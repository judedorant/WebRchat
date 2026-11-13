import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  accountPassword,
  login,
  registerVerified,
  site,
} from "./helpers/accounts";

test.use({ baseURL: site });
const marker = randomUUID().slice(0, 8);
const sender = {
  name: `Quinn Taylor ${marker}`,
  email: `e2e-${randomUUID()}@example.test`,
};
const recipient = {
  name: `Riley Morgan ${marker}`,
  email: `e2e-${randomUUID()}@example.test`,
};
test.beforeAll(async ({ browser, request }) => {
  for (const person of [sender, recipient]) {
    const context = await browser.newContext({ baseURL: site });
    try {
      await registerVerified(
        await context.newPage(),
        request,
        person.name,
        person.email,
      );
    } finally {
      await context.close();
    }
  }
});
test.beforeEach(async ({ page }) => {
  await login(page, sender.email, accountPassword);
});

test("desktop preview has searchable routes, group details, image preview and an unsent draft", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      /\/api\/v1\/(conversations|messages|groups)(\/|$)/.test(
        new URL(request.url()).pathname,
      )
    )
      writes.push(request.method());
  });
  await expect(
    page.getByRole("heading", { name: "Messages", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("A fresh start")).toBeVisible();
  await expect(page.getByText("Maya Chen", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Explore design preview", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/conversations\/demo-maya$/);
  await expect(page.getByText(/Fictional conversations/)).toBeVisible();
  await expect(
    page.getByRole("complementary", {
      name: "Conversation details",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("dashboard-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByLabel("Message draft", { exact: true })
    .fill("A private temporary draft");
  await page.getByLabel("Message draft", { exact: true }).press("Enter");
  await expect(
    page.getByRole("region", { name: "Message history" }),
  ).not.toContainText("A private temporary draft");
  await page.getByRole("button", { name: "Groups", exact: true }).click();
  const list = page.getByRole("list", { name: "Conversation list" });
  await expect(list.getByRole("link")).toHaveCount(2);
  await list.getByRole("link", { name: /Design circle/ }).click();
  await expect(
    page.getByRole("heading", { name: "Group details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Sample members/ }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "View sample: Mountain lake illustration",
      exact: true,
    })
    .click();
  const image = page.getByRole("dialog", { name: "Sample image", exact: true });
  await expect(image).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(image).not.toBeVisible();
  await page.getByLabel("Search conversations", { exact: true }).fill("launch");
  await expect(list.getByRole("link")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear conversation search", exact: true })
    .click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await list.getByRole("link", { name: /Maya Chen/ }).click();
  await expect(page.getByLabel("Message draft", { exact: true })).toHaveValue(
    "A private temporary draft\n",
  );
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Exit preview", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("A fresh start")).toBeVisible();
});

test("new-message dialog uses real verified profiles and a reload restores only the public contact", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New message", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New message", exact: true });
  await expect(page.getByLabel("Search people", { exact: true })).toBeFocused();
  await page.getByLabel("Search people", { exact: true }).fill(recipient.name);
  await dialog
    .getByRole("button", { name: new RegExp(recipient.name) })
    .click();
  await expect(page).toHaveURL(/\/app\/conversations\/contact-\d+$/);
  await expect(
    page.getByText(
      "You can prepare a draft here. No conversation or message has been saved.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Message draft", { exact: true })
    .fill("This is not persisted.");
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Message draft", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`A conversation with Riley`),
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New message", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "New message", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New message", exact: true }),
  ).toBeFocused();
});

test("mobile navigation, dark mode, responsive details and dialog keyboard controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await expect(page.locator(".app")).toHaveClass(/theme-dark/);
  await page
    .getByRole("button", { name: "Design preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Maya Chen", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chat-sidebar")).toBeHidden();
  await page
    .getByRole("button", { name: "Conversation details", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "Conversation details",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Close conversation details",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Conversation details", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("dashboard-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 390, 980]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Back to conversations", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator(".chat-sidebar")).toBeVisible();
  await page.getByRole("button", { name: "New message", exact: true }).click();
  for (let index = 0; index < 24; index++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document
          .querySelector("dialog[open]")
          ?.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "New message", exact: true }),
  ).toBeFocused();
});

test("logout and another account cannot see the previous account’s temporary drafts", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Explore design preview", exact: true })
    .click();
  await page
    .getByLabel("Message draft", { exact: true })
    .fill("Only for the first account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, recipient.email, accountPassword);
  await expect(page.getByText("A fresh start")).toBeVisible();
  await expect(page.getByText("Only for the first account")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Explore design preview", exact: true })
    .click();
  await expect(page.getByLabel("Message draft", { exact: true })).toHaveValue(
    "",
  );
});
