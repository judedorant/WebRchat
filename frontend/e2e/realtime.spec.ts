import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { registerVerified, site } from "./helpers/accounts";

test.use({ baseURL: site });
test("Reverb delivers live messages, typing, presence and visible-only receipts, then catches up and retries safely", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(180000);
  const marker = randomUUID().slice(0, 8);
  const frames: string[] = [];
  const contexts = await Promise.all(
    ["Alice", "Bob"].map(async (name) => {
      const context = await browser.newContext({ baseURL: site });
      const page = await context.newPage();
      if (name === "Alice")
        page.on("websocket", (socket) =>
          socket.on("framereceived", ({ payload }) =>
            frames.push(String(payload)),
          ),
        );
      await registerVerified(
        page,
        request,
        `${name} Live ${marker}`,
        `${name.toLowerCase()}-live-${randomUUID()}@example.test`,
      );
      await page.goto("/app");
      await expect(
        page.getByRole("status", { name: "Live connection" }),
      ).toHaveText(/Live$/, { timeout: 15000 });
      return { context, page };
    }),
  );
  try {
    const [alice, bob] = contexts;
    await alice.page
      .getByRole("button", { name: "New message", exact: true })
      .click();
    await alice.page.getByLabel("Search people").fill(`Bob Live ${marker}`);
    await alice.page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`Bob Live ${marker}`) })
      .click();
    await alice.page.getByLabel("Message draft").fill(`First live ${marker}`);
    await alice.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(alice.page).toHaveURL(/\/app\/conversations\/\d+$/);
    const id = new URL(alice.page.url()).pathname.split("/").at(-1)!;
    await bob.page
      .getByRole("list", { name: "Conversation list" })
      .getByRole("link", { name: new RegExp(`Alice Live ${marker}`) })
      .click();
    const aHistory = alice.page.getByRole("region", {
      name: "Message history",
    });
    const bHistory = bob.page.getByRole("region", { name: "Message history" });
    await expect(
      bHistory.getByText(`First live ${marker}`, { exact: true }),
    ).toBeVisible();
    await expect(aHistory.getByLabel("Message status").first()).toHaveText(
      "Read",
      { timeout: 15000 },
    );
    await expect(alice.page.getByText("Online", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(bob.page.getByText("Online", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    await alice.page
      .getByLabel("Message draft")
      .fill("A thought still being written");
    await expect(
      bob.page.getByRole("status", { name: "Typing indicator" }),
    ).toContainText("Alice Live", { timeout: 10000 });
    await expect(
      bob.page.getByRole("status", { name: "Typing indicator" }),
    ).toHaveCount(0, { timeout: 10000 });
    await alice.page.getByLabel("Message draft").fill("");

    await bob.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const unseen = `Delivered while hidden ${marker}`;
    await alice.page.getByLabel("Message draft").fill(unseen);
    await alice.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(bHistory.getByText(unseen, { exact: true })).toBeVisible({
      timeout: 15000,
    });
    const outgoing = aHistory
      .locator(".chat-message")
      .filter({ hasText: unseen });
    await expect(outgoing.getByLabel("Message status")).toHaveText(
      "Delivered",
      { timeout: 15000 },
    );
    await bob.page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(outgoing.getByLabel("Message status")).toHaveText("Read", {
      timeout: 15000,
    });

    await alice.context.setOffline(true);
    await expect(
      alice.page.getByRole("status", { name: "Live connection" }),
    ).not.toHaveText(/Live$/, { timeout: 15000 });
    for (let index = 0; index < 3; index++) {
      await bob.page
        .getByLabel("Message draft")
        .fill(`Offline catchup ${marker} ${index}`);
      await bob.page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await expect(
        bHistory.getByText(`Offline catchup ${marker} ${index}`, {
          exact: true,
        }),
      ).toBeVisible();
    }
    await alice.context.setOffline(false);
    await expect(
      alice.page.getByRole("status", { name: "Live connection" }),
    ).toHaveText(/Live$/, { timeout: 30000 });
    for (let index = 0; index < 3; index++)
      await expect(
        aHistory.getByText(`Offline catchup ${marker} ${index}`, {
          exact: true,
        }),
      ).toBeVisible({ timeout: 15000 });

    const attempts: string[] = [];
    let dropped = false;
    await alice.page.route(
      `**/api/v1/conversations/${id}/messages`,
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        attempts.push(route.request().postDataJSON().client_uuid);
        if (!dropped) {
          dropped = true;
          await route.fetch();
          await route.abort("failed");
        } else await route.continue();
      },
    );
    const retryText = `One persisted retry ${marker}`;
    await alice.page.getByLabel("Message draft").fill(retryText);
    await alice.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await alice.page
      .getByRole("button", { name: "Retry send", exact: true })
      .click();
    await expect(alice.page.getByLabel("Message draft")).toHaveValue("");
    await expect(aHistory.getByText(retryText, { exact: true })).toHaveCount(1);
    await expect(bHistory.getByText(retryText, { exact: true })).toHaveCount(
      1,
      { timeout: 15000 },
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBe(attempts[1]);
    await alice.page.unroute(`**/api/v1/conversations/${id}/messages`);
    await alice.page.reload();
    await expect(aHistory.getByText(retryText, { exact: true })).toHaveCount(1);
    await expect(
      alice.page.getByRole("status", { name: "Live connection" }),
    ).toHaveText(/Live$/, { timeout: 15000 });
    await bob.page
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(bob.page).toHaveURL(/\/login$/);
    await expect(
      alice.page.getByRole("status", { name: "Contact presence" }),
    ).toContainText("Offline", {
      timeout: 15000,
    });
    await alice.page.setViewportSize({ width: 1440, height: 1000 });
    await alice.page.screenshot({
      path: testInfo.outputPath("live-direct-messaging.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(frames.some((frame) => frame.includes("chat.signal"))).toBe(true);
    expect(frames.some((frame) => frame.includes("Offline catchup"))).toBe(
      false,
    );
  } finally {
    await Promise.all(contexts.map(({ context }) => context.close()));
  }
});
