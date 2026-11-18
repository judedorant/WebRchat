import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { registerVerified, site } from "./helpers/accounts";
test.use({
  baseURL: site,
  actionTimeout: 15000,
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test("private attachments, emoji, reactions, recorded voice, notifications, search, reporting and blocking work across live accounts", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240000);
  const marker = randomUUID().slice(0, 8);
  const accounts = await Promise.all(
    ["Alice", "Bob", "Outsider"].map(async (name) => {
      const context = await browser.newContext({
          baseURL: site,
          permissions: ["microphone"],
          viewport: { width: 1440, height: 1000 },
        }),
        page = await context.newPage();
      await registerVerified(
        page,
        request,
        `${name} Media ${marker}`,
        `${name.toLowerCase()}-media-${randomUUID()}@example.test`,
      );
      await page.goto("/app");
      await expect(
        page.getByRole("status", { name: "Live connection" }),
      ).toHaveText(/Live$/, { timeout: 15000 });
      return { context, page };
    }),
  );
  test.setTimeout(240000);
  try {
    const [alice, bob, outsider] = accounts;
    await alice.page
      .getByRole("button", { name: "New message", exact: true })
      .click();
    await alice.page.getByLabel("Search people").fill(`Bob Media ${marker}`);
    await alice.page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`Bob Media ${marker}`) })
      .click();
    await alice.page.getByLabel("Message draft").fill(`Media hello ${marker} `);
    await alice.page
      .getByRole("button", { name: "Emoji picker", exact: true })
      .click();
    await alice.page
      .getByRole("button", { name: "Insert 🎉", exact: true })
      .click();
    await expect(alice.page.getByLabel("Message draft")).toHaveValue(
      `Media hello ${marker} 🎉`,
    );
    await alice.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(alice.page).toHaveURL(/\/conversations\/\d+$/);
    await bob.page
      .getByRole("list", { name: "Conversation list" })
      .getByRole("link", { name: new RegExp(`Alice Media ${marker}`) })
      .click();
    const history = bob.page.getByRole("region", { name: "Message history" });
    await expect(
      history.getByText(`Media hello ${marker} 🎉`, { exact: true }),
    ).toBeVisible();
    const first = history.locator("[data-message-id]").first();
    const firstId = (await first.getAttribute("data-message-id"))!;
    await first
      .getByRole("button", { name: `Reply to message ${firstId}`, exact: true })
      .click();
    await bob.page.getByLabel("Message draft").fill(`A reply ${marker}`);
    await bob.page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      alice.page
        .getByRole("region", { name: "Message history" })
        .getByText(`A reply ${marker}`, { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await alice.page
      .getByRole("button", { name: `Edit message ${firstId}`, exact: true })
      .click();
    const edit = alice.page.getByRole("dialog", {
      name: "Edit message",
      exact: true,
    });
    await edit.getByLabel("Edited message").fill(`Edited hello ${marker} 🎉`);
    await edit.getByRole("button", { name: "Save edit", exact: true }).click();
    await expect(
      first.getByText(`Edited hello ${marker} 🎉`, { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await alice.page
      .getByRole("button", { name: "Attach a file", exact: true })
      .click();
    await alice.page.getByLabel("Attachment", { exact: true }).setInputFiles({
      name: `notes-${marker}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("Private attachment bytes"),
    });
    await alice.page
      .getByRole("button", { name: "Send attachment", exact: true })
      .click();
    await expect(
      alice.page.getByRole("dialog", { name: "Send an attachment" }),
    ).toHaveCount(0);
    const fileLink = history.getByRole("link", {
      name: new RegExp(`notes-${marker}.txt`),
    });
    await expect(fileLink).toBeVisible({ timeout: 15000 });
    const url = (await fileLink.getAttribute("href"))!;
    expect(
      (
        await bob.context.request.get(`${site}${url}`, {
          headers: { Origin: site },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await outsider.context.request.get(`${site}${url}`, {
          headers: { Origin: site },
        })
      ).status(),
    ).toBe(403);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEnkAAAAASUVORK5CYII=",
      "base64",
    );
    await alice.page
      .getByRole("button", { name: "Attach a file", exact: true })
      .click();
    await alice.page.getByLabel("Attachment", { exact: true }).setInputFiles({
      name: `pixel-${marker}.png`,
      mimeType: "image/png",
      buffer: png,
    });
    await alice.page
      .getByRole("button", { name: "Send attachment", exact: true })
      .click();
    const image = history.getByRole("img", { name: `pixel-${marker}.png` });
    await expect(image).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBe(1);
    await first
      .getByRole("button", { name: `React to message ${firstId}`, exact: true })
      .click();
    await first.getByRole("button", { name: "React ❤️", exact: true }).click();
    await expect(
      alice.page
        .getByRole("region", { name: "Message history" })
        .getByRole("button", { name: "❤️ reaction, 1", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await alice.page
      .getByRole("button", { name: "Voice message", exact: true })
      .click();
    const upload = alice.page.getByRole("dialog", {
      name: "Send an attachment",
    });
    await expect(upload.getByRole("status")).toHaveText(/Recording/);
    // Exercise the real browser encoder with one short second of fake microphone input.
    await alice.page.waitForTimeout(1200);
    await upload
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await expect(upload.getByLabel("Review voice recording")).toBeVisible();
    await upload
      .getByRole("button", { name: "Send attachment", exact: true })
      .click();
    await expect(upload).toHaveCount(0);
    const audio = history.locator("audio");
    await expect(audio).toHaveCount(1, { timeout: 15000 });
    await audio.evaluate(async (node) => {
      await (node as HTMLAudioElement).play();
    });
    await expect
      .poll(() =>
        audio.evaluate((node) => (node as HTMLAudioElement).readyState),
      )
      .toBeGreaterThan(1);
    await bob.page.getByRole("button", { name: /^Notifications/ }).click();
    const notifications = bob.page.getByRole("dialog", {
      name: "Notifications",
      exact: true,
    });
    await expect(
      notifications.getByText("New message", { exact: true }).first(),
    ).toBeVisible();
    await notifications
      .getByRole("button", { name: "Mark read", exact: true })
      .first()
      .click();
    await notifications
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await bob.page
      .getByRole("button", { name: "Search messages", exact: true })
      .click();
    const search = bob.page.getByRole("dialog", {
      name: "Search messages",
      exact: true,
    });
    await search.getByLabel("Message search").fill(marker);
    await search
      .getByRole("button", { name: "Search history", exact: true })
      .click();
    await expect(
      search.getByText(`Edited hello ${marker} 🎉`, { exact: true }),
    ).toBeVisible();
    await search.getByLabel("Message search").fill(`Alice Media ${marker}`);
    await search
      .getByRole("button", { name: "Search history", exact: true })
      .click();
    await expect(
      search.getByRole("heading", { name: "Conversations", exact: true }),
    ).toBeVisible();
    await search
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await first
      .getByRole("button", { name: `Report message ${firstId}`, exact: true })
      .click();
    const report = bob.page.getByRole("dialog", {
      name: `Report Alice Media ${marker}`,
    });
    await report
      .getByLabel("Reason")
      .fill("Please review this synthetic test message.");
    await report
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    await expect(report.getByRole("status")).toHaveText(
      "Report submitted for review.",
    );
    await report
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await bob.page
      .getByRole("button", { name: "Block member", exact: true })
      .click();
    await bob.page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm block", exact: true })
      .click();
    await expect(bob.page.getByLabel("Message draft")).toBeDisabled();
    await expect(alice.page.getByLabel("Message draft")).toBeDisabled({
      timeout: 15000,
    });
    await bob.page
      .getByRole("button", { name: "Blocked members", exact: true })
      .click();
    const blocked = bob.page.getByRole("dialog", {
      name: "Blocked members",
      exact: true,
    });
    await blocked
      .getByRole("button", {
        name: `Unblock Alice Media ${marker}`,
        exact: true,
      })
      .click();
    await expect(blocked.getByText("No blocked members.")).toBeVisible();
    await blocked
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(alice.page.getByLabel("Message draft")).toBeEnabled({
      timeout: 15000,
    });
    await bob.page.reload();
    await expect(
      bob.page
        .getByRole("region", { name: "Message history" })
        .getByRole("link", { name: new RegExp(`notes-${marker}.txt`) }),
    ).toBeVisible();
    await expect(
      bob.page
        .getByRole("region", { name: "Message history" })
        .locator("audio"),
    ).toHaveCount(1);
    await alice.page
      .getByRole("button", { name: `Delete message ${firstId}`, exact: true })
      .click();
    await alice.page
      .getByRole("dialog", { name: "Delete message?", exact: true })
      .getByRole("button", { name: "Confirm delete", exact: true })
      .click();
    await expect(
      bob.page
        .getByRole("region", { name: "Message history" })
        .getByText("Message deleted", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      bob.page.getByRole("status", { name: "Live connection" }),
    ).toHaveText(/Live$/, { timeout: 15000 });
    await bob.page.screenshot({
      path: testInfo.outputPath("rich-chat-desktop.png"),
      fullPage: true,
    });
    await bob.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await bob.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await bob.page.screenshot({
      path: testInfo.outputPath("rich-chat-mobile.png"),
      fullPage: true,
    });
  } finally {
    await Promise.all(accounts.map(({ context }) => context.close()));
  }
});
