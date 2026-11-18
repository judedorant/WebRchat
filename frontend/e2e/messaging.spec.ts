import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { registerVerified, site } from "./helpers/accounts";

test.use({ baseURL: site });
test("two verified accounts persist direct messages, reuse pairs and UUIDs, page history, and exclude outsiders", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const marker = randomUUID().slice(0, 8);
  const alice = {
    name: `Alice ${marker}`,
    email: `alice-${randomUUID()}@example.test`,
  };
  const bob = {
    name: `Bob ${marker}`,
    email: `bob-${randomUUID()}@example.test`,
  };
  const stranger = {
    name: `Stranger ${marker}`,
    email: `stranger-${randomUUID()}@example.test`,
  };
  const contexts = await Promise.all(
    [alice, bob, stranger].map(async (person) => {
      const context = await browser.newContext({ baseURL: site });
      const page = await context.newPage();
      await registerVerified(page, request, person.name, person.email);
      await page.goto("/app");
      await expect(
        page.getByRole("heading", { name: "Messages", exact: true }),
      ).toBeVisible();
      return { context, page };
    }),
  );
  try {
    const [a, b, outsider] = contexts;
    const errors: string[] = [];
    a.page.on("pageerror", (error) => errors.push(error.message));
    await a.page
      .getByRole("button", { name: "New message", exact: true })
      .click();
    await a.page.getByLabel("Search people").fill(bob.name);
    await a.page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(bob.name) })
      .click();
    const first = `Hello ${marker} 👋 <script>window.chatInjected = true</script>`;
    await a.page.getByLabel("Message draft", { exact: true }).fill(first);
    await a.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(a.page).toHaveURL(/\/app\/conversations\/\d+$/);
    const id = Number(new URL(a.page.url()).pathname.split("/").at(-1));
    const history = a.page.getByRole("region", { name: "Message history" });
    await expect(history.getByText(first, { exact: true })).toBeVisible();
    expect(await a.page.evaluate(() => "chatInjected" in window)).toBe(false);
    await a.page.reload();
    await expect(history.getByText(first, { exact: true })).toBeVisible();
    await expect(
      a.page.getByLabel("Message draft", { exact: true }),
    ).toHaveValue("");
    await b.page.getByRole("button", { name: "Refresh conversations" }).click();
    await b.page
      .getByRole("list", { name: "Conversation list" })
      .getByRole("link", { name: new RegExp(alice.name) })
      .click();
    await expect(b.page).toHaveURL(new RegExp(`/conversations/${id}$`));
    await expect(
      b.page
        .getByRole("region", { name: "Message history" })
        .getByText(first, { exact: true }),
    ).toBeVisible();
    await b.page
      .getByLabel("Message draft", { exact: true })
      .fill(`Reply ${marker}`);
    await b.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      b.page
        .getByRole("region", { name: "Message history" })
        .getByText(`Reply ${marker}`, { exact: true }),
    ).toBeVisible();
    await a.page.getByRole("button", { name: "Refresh messages" }).click();
    await expect(
      history.getByText(`Reply ${marker}`, { exact: true }),
    ).toBeVisible();

    async function post(
      client: APIRequestContext,
      path: string,
      data: unknown,
    ) {
      await client.get(`${site}/sanctum/csrf-cookie`);
      const state = await client.storageState();
      const xsrf = state.cookies.find((cookie) => cookie.name === "XSRF-TOKEN");
      return client.post(`${site}/api/v1/${path}`, {
        data,
        headers: {
          Origin: site,
          "X-XSRF-TOKEN": decodeURIComponent(xsrf!.value),
          Accept: "application/json",
        },
      });
    }
    const members = await (
      await a.context.request.get(`${site}/api/v1/conversations/${id}`, {
        headers: { Origin: site },
      })
    ).json();
    const senderId = members.data.participants.find(
      (person: { name: string }) => person.name === alice.name,
    ).id;
    const recipientId = members.data.participants.find(
      (person: { name: string }) => person.name === bob.name,
    ).id;
    const pairResponses = await Promise.all([
      post(a.context.request, "conversations", { recipient_id: recipientId }),
      post(b.context.request, "conversations", { recipient_id: senderId }),
    ]);
    for (const response of pairResponses) {
      expect(response.status()).toBe(200);
      expect((await response.json()).data.id).toBe(id);
    }
    const payload = { client_uuid: randomUUID(), body: `Idempotent ${marker}` };
    const retries = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(a.context.request, `conversations/${id}/messages`, payload),
      ),
    );
    expect(
      retries.filter((response) => response.status() === 201),
    ).toHaveLength(1);
    expect(
      retries.every((response) => [200, 201].includes(response.status())),
    ).toBe(true);
    const retryIds = await Promise.all(
      retries.map(async (response) => (await response.json()).data.id),
    );
    expect(new Set(retryIds).size).toBe(1);
    expect(
      (
        await post(a.context.request, `conversations/${id}/messages`, {
          ...payload,
          body: "Different",
        })
      ).status(),
    ).toBe(409);
    const older = await a.context.request.get(
      `${site}/api/v1/conversations/${id}/messages?per_page=1`,
      { headers: { Origin: site } },
    );
    const page = await older.json();
    expect(page.data).toHaveLength(1);
    expect(page.meta.next_cursor).toBeTruthy();
    const second = await (
      await a.context.request.get(
        `${site}/api/v1/conversations/${id}/messages?per_page=1&cursor=${encodeURIComponent(page.meta.next_cursor)}`,
        { headers: { Origin: site } },
      )
    ).json();
    expect(second.data[0].id).not.toBe(page.data[0].id);
    for (const path of [
      `conversations/${id}`,
      `conversations/${id}/messages`,
    ]) {
      expect(
        (
          await outsider.context.request.get(`${site}/api/v1/${path}`, {
            headers: { Origin: site },
          })
        ).status(),
      ).toBe(403);
    }
    expect(
      (
        await post(outsider.context.request, `conversations/${id}/messages`, {
          client_uuid: randomUUID(),
          body: "Intrusion",
        })
      ).status(),
    ).toBe(403);
    await outsider.page.goto(`/app/conversations/${id}`);
    await expect(
      outsider.page.getByText("This conversation isn’t available."),
    ).toBeVisible();
    await expect(outsider.page.getByText(first, { exact: true })).toHaveCount(
      0,
    );
    const outsiderId = (
      await (
        await outsider.context.request.get(`${site}/api/v1/me`, {
          headers: { Origin: site },
        })
      ).json()
    ).data.id;
    const racingPairs = await Promise.all([
      post(a.context.request, "conversations", { recipient_id: outsiderId }),
      post(outsider.context.request, "conversations", {
        recipient_id: senderId,
      }),
    ]);
    expect(racingPairs.map((response) => response.status()).sort()).toEqual([
      200, 201,
    ]);
    const newPairs = await Promise.all(
      racingPairs.map(async (response) => (await response.json()).data.id),
    );
    expect(new Set(newPairs).size).toBe(1);
    expect(
      (
        await post(
          a.context.request,
          `conversations/${newPairs[0]}/messages`,
          payload,
        )
      ).status(),
    ).toBe(409);
    expect(
      (
        await a.context.request.post(
          `${site}/api/v1/conversations/${id}/messages`,
          {
            data: { body: "Missing CSRF", client_uuid: randomUUID() },
            headers: { Origin: site, Accept: "application/json" },
          },
        )
      ).status(),
    ).toBe(419);
    for (let index = 0; index < 31; index++) {
      expect(
        (
          await post(a.context.request, `conversations/${id}/messages`, {
            body: `History ${marker} ${index}`,
            client_uuid: randomUUID(),
          })
        ).status(),
      ).toBe(201);
    }
    await a.page.getByRole("button", { name: "Refresh messages" }).click();
    await a.page.reload();
    await expect(
      a.page.getByRole("button", { name: "Load older messages" }),
    ).toBeVisible();
    await expect(history.getByText(first, { exact: true })).toHaveCount(0);
    await a.page.getByRole("button", { name: "Load older messages" }).click();
    await expect(history.getByText(first, { exact: true })).toBeVisible();
    await a.page.setViewportSize({ width: 1440, height: 1000 });
    await a.page.screenshot({
      path: testInfo.outputPath("persisted-direct-messaging.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(({ context }) => context.close()));
  }
});
