import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { registerVerified, site } from "./helpers/accounts";

test.use({ baseURL: site, actionTimeout: 15000 });
test("group owners and admins manage members while live removal revokes history and preserves private notices", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(180000);
  const marker = randomUUID().slice(0, 8);
  const people = ["Avery", "Blair", "Casey", "Drew"].map((name) => ({
    name: `${name} Group ${marker}`,
    email: `group-${name.toLowerCase()}-${randomUUID()}@example.test`,
  }));
  const contexts = await Promise.all(
    people.map(async (person) => {
      const context = await browser.newContext({ baseURL: site });
      const page = await context.newPage();
      await registerVerified(page, request, person.name, person.email);
      await page.goto("/app");
      await expect(
        page.getByRole("status", { name: "Live connection" }),
      ).toHaveText(/Live$/, { timeout: 15000 });
      return { context, page };
    }),
  );
  test.setTimeout(180000);
  try {
    const [owner, admin, member, outsider] = contexts;
    const title = `Field notes ${marker}`;
    await owner.page.setViewportSize({ width: 1440, height: 1000 });
    await owner.page
      .getByRole("button", { name: "New group", exact: true })
      .click();
    await owner.page.getByLabel("Group name", { exact: true }).fill(title);
    for (const person of people.slice(1, 3)) {
      await owner.page
        .getByRole("button", { name: "Choose members", exact: true })
        .click();
      const picker = owner.page.getByRole("dialog", {
        name: "Choose group members",
      });
      await picker.getByLabel("Search people").fill(person.name);
      await picker
        .getByRole("button", { name: new RegExp(person.name) })
        .click();
    }
    await owner.page
      .getByRole("button", { name: "Create group", exact: true })
      .click();
    await expect(owner.page).toHaveURL(/\/app\/conversations\/\d+$/);
    const id = new URL(owner.page.url()).pathname.split("/").at(-1)!;
    async function openGroup(page: Page) {
      await page
        .getByRole("list", { name: "Conversation list" })
        .getByRole("link", { name: new RegExp(title) })
        .click();
      await expect(page).toHaveURL(new RegExp(`/conversations/${id}$`));
    }
    async function settings(page: Page) {
      const button = page.getByRole("button", {
        name: "Group settings",
        exact: true,
      });
      if (!(await button.isVisible()))
        await page
          .getByRole("button", { name: "Conversation details", exact: true })
          .click();
      await button.click();
      return page.getByRole("dialog", { name: "Group settings", exact: true });
    }
    await openGroup(admin.page);
    await openGroup(member.page);
    expect(
      (
        await outsider.context.request.get(`${site}/api/v1/groups/${id}`, {
          headers: { Origin: site },
        })
      ).status(),
    ).toBe(403);
    const original = await (
      await owner.context.request.get(`${site}/api/v1/groups/${id}`, {
        headers: { Origin: site },
      })
    ).json();
    const memberIds = original.data.participants
      .filter((person: { name: string }) => person.name !== people[0].name)
      .map((person: { id: number }) => person.id);
    async function mutation(
      method: "post" | "patch",
      path: string,
      data: unknown,
    ) {
      await owner.context.request.get(`${site}/sanctum/csrf-cookie`);
      const token = (await owner.context.request.storageState()).cookies.find(
        (cookie) => cookie.name === "XSRF-TOKEN",
      )!;
      return owner.context.request[method](`${site}/api/v1/${path}`, {
        data,
        headers: {
          Origin: site,
          "X-XSRF-TOKEN": decodeURIComponent(token.value),
          Accept: "application/json",
        },
      });
    }
    const race = await mutation("post", "groups", {
      name: `Ownership race ${marker}`,
      member_ids: memberIds,
    });
    expect(race.status()).toBe(201);
    const raceId = (await race.json()).data.id;
    const transfers = await Promise.all(
      memberIds.map((member: number) =>
        mutation("patch", `groups/${raceId}/members/${member}`, {
          role: "owner",
        }),
      ),
    );
    expect(transfers.map((response) => response.status()).sort()).toEqual([
      200, 403,
    ]);
    const finalOwner = await (
      await owner.context.request.get(`${site}/api/v1/groups/${raceId}`, {
        headers: { Origin: site },
      })
    ).json();
    expect(
      finalOwner.data.participants.filter(
        (person: { role: string }) => person.role === "owner",
      ),
    ).toHaveLength(1);
    expect(finalOwner.data.my_role).toBe("admin");
    await owner.page
      .getByRole("button", { name: "Groups", exact: true })
      .click();
    await expect(
      owner.page
        .getByRole("list", { name: "Conversation list" })
        .getByRole("link", { name: new RegExp(title) }),
    ).toBeVisible();
    const initial = `A message for the group ${marker}`;
    await owner.page.getByLabel("Message draft", { exact: true }).fill(initial);
    await owner.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    for (const person of [admin, member])
      await expect(
        person.page
          .getByRole("region", { name: "Message history" })
          .getByText(initial, { exact: true }),
      ).toBeVisible({ timeout: 15000 });
    await expect(owner.page.getByLabel("Message status").first()).toContainText(
      "Read by",
      { timeout: 15000 },
    );

    let manager = await settings(owner.page);
    await manager
      .getByRole("combobox", {
        name: `Role for ${people[1].name}`,
        exact: true,
      })
      .selectOption("admin");
    await expect(
      manager.getByText("admin", { exact: true }).first(),
    ).toBeVisible();
    const renamed = `Studio circle ${marker}`;
    await manager.getByLabel("Group name", { exact: true }).fill(renamed);
    await manager
      .getByRole("button", { name: "Save group name", exact: true })
      .click();
    await expect(
      owner.page.getByRole("heading", { name: renamed, exact: true }).first(),
    ).toBeVisible();
    await manager
      .getByLabel("Group image", { exact: true })
      .setInputFiles({
        name: "team.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMI7Yn6DwAEsAI7bmBTrQAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
    await expect(manager.locator(".group-summary img")).toBeVisible();
    await expect
      .poll(() =>
        manager
          .locator(".group-summary img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    await manager.getByRole("button", { name: "Close dialog" }).click();
    expect(
      (
        await outsider.context.request.get(
          `${site}/api/v1/groups/${id}/image`,
          { headers: { Origin: site } },
        )
      ).status(),
    ).toBe(403);

    manager = await settings(admin.page);
    await expect(manager.getByLabel("Group name", { exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    expect(await manager.getByRole("combobox").count()).toBe(0);
    await manager
      .getByRole("button", { name: "Add member", exact: true })
      .click();
    const picker = admin.page.getByRole("dialog", { name: "Add group member" });
    await picker.getByLabel("Search people").fill(people[3].name);
    await picker
      .getByRole("button", { name: new RegExp(people[3].name) })
      .click();
    manager = admin.page.getByRole("dialog", {
      name: "Group settings",
      exact: true,
    });
    await expect(
      manager.getByRole("list", { name: "Group members" }),
    ).toContainText(people[3].name);
    await manager.getByRole("button", { name: "Close dialog" }).click();
    await outsider.page
      .getByRole("list", { name: "Conversation list" })
      .getByRole("link", { name: new RegExp(renamed) })
      .click();
    await expect(
      outsider.page
        .getByRole("region", { name: "Message history" })
        .getByText(initial, { exact: true }),
    ).toBeVisible();
    await member.page.setViewportSize({ width: 390, height: 844 });
    await member.page.screenshot({
      path: testInfo.outputPath("group-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
    manager = await settings(member.page);
    await expect(
      manager.getByRole("button", { name: "Add member" }),
    ).toHaveCount(0);
    await expect(manager.getByRole("combobox")).toHaveCount(0);
    await manager.getByRole("button", { name: "Close dialog" }).click();

    manager = await settings(owner.page);
    await expect(
      manager.getByRole("button", { name: "Leave group", exact: true }),
    ).toBeDisabled();
    await manager
      .getByRole("combobox", {
        name: `Role for ${people[1].name}`,
        exact: true,
      })
      .selectOption("owner");
    await manager
      .getByRole("button", { name: "Confirm change", exact: true })
      .click();
    await expect(manager.getByText(/Your role: admin/)).toBeVisible();
    await manager.getByRole("button", { name: "Close dialog" }).click();
    manager = await settings(admin.page);
    await expect(manager.getByText(/Your role: owner/)).toBeVisible({
      timeout: 15000,
    });
    await settings(member.page);
    await manager
      .getByRole("button", {
        name: `Remove ${people[2].name} from group`,
        exact: true,
      })
      .click();
    await manager
      .getByRole("button", { name: "Confirm change", exact: true })
      .click();
    await expect(
      member.page.getByText("This conversation isn’t available."),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      member.page.getByRole("region", { name: "Message history" }),
    ).toHaveCount(0);
    expect(
      (
        await member.context.request.get(
          `${site}/api/v1/conversations/${id}/messages`,
          { headers: { Origin: site } },
        )
      ).status(),
    ).toBe(403);
    await member.page
      .getByRole("link", { name: "Back to conversations", exact: true })
      .click();
    await member.page
      .getByRole("list", { name: "Conversation list" })
      .getByRole("link", { name: new RegExp(`Ownership race ${marker}`) })
      .click();
    await expect(
      member.page.getByRole("dialog", { name: "Group settings" }),
    ).toHaveCount(0);
    await member.page
      .getByRole("button", { name: "Back to conversations", exact: true })
      .click();
    await member.page
      .getByRole("button", { name: "Group updates", exact: true })
      .click();
    const updates = member.page.getByRole("dialog", {
      name: "Group updates",
      exact: true,
    });
    const removed = updates
      .locator("li")
      .filter({ hasText: "You were removed" });
    await expect(removed).toBeVisible();
    await expect(
      removed.getByRole("button", { name: "Open group" }),
    ).toHaveCount(0);
    await removed
      .getByRole("button", { name: "Mark read", exact: true })
      .click();
    await expect(
      removed.getByRole("button", { name: "Mark read", exact: true }),
    ).toHaveCount(0);
    await updates.getByRole("button", { name: "Close dialog" }).click();
    await manager.getByRole("button", { name: "Close dialog" }).click();
    manager = await settings(owner.page);
    await manager
      .getByRole("button", { name: "Leave group", exact: true })
      .click();
    await manager
      .getByRole("button", { name: "Confirm change", exact: true })
      .click();
    await expect(owner.page).toHaveURL(/\/app$/);
    await admin.page.setViewportSize({ width: 1440, height: 1000 });
    await admin.page.screenshot({
      path: testInfo.outputPath("group-workspace.png"),
      fullPage: true,
      animations: "disabled",
    });
    await admin.page.reload();
    await expect(
      admin.page.getByRole("heading", { name: renamed, exact: true }).first(),
    ).toBeVisible();
    await expect(
      admin.page
        .getByRole("region", { name: "Message history" })
        .getByText(initial, { exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map(({ context }) => context.close()));
  }
});
