import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { site, emailLink, login } from "./helpers/accounts";
test.use({ baseURL: site });

test("cookie-based account lifecycle, queued email, profile, session revocation and password recovery", async ({
  page,
  context,
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const email = `e2e-${randomUUID()}@example.test`;
  const password = "StrongPassword123!";
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Alex Test");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`${site}/api/v1/users`, {
        headers: { Origin: site },
      })
    ).status(),
  ).toBe(403);

  const verification = await emailLink(request, email, "/verify-email");
  await page.goto(verification);
  await page
    .getByRole("button", { name: "Verify email address", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re all set." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue to your account" }).click();
  await expect(
    page.getByRole("heading", { name: "Messages", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Account settings", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("Alex Updated");
  await page
    .getByLabel("About you", { exact: true })
    .fill("A thoughtful profile.");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile updated." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Alex Updated",
  );

  const other = await browser.newContext({ baseURL: site });
  try {
    const otherPage = await other.newPage();
    await login(otherPage, email, password);
    const passwordSection = page.locator("section.card").filter({
      has: page.getByRole("heading", { name: "Password", exact: true }),
    });
    await passwordSection
      .getByLabel("Current password", { exact: true })
      .fill(password);
    await passwordSection
      .getByLabel("New password", { exact: true })
      .fill("ChangedPassword123!");
    await passwordSection
      .getByLabel("Confirm password", { exact: true })
      .fill("ChangedPassword123!");
    await passwordSection
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Password updated." }),
    ).toBeVisible();
    expect(
      (
        await other.request.get(`${site}/api/v1/me`, {
          headers: { Origin: site },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await other.close();
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your account, your space." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, email, "ChangedPassword123!");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  const recoveryResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/forgot-password") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  expect((await recoveryResponse).status()).toBe(202);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "If an eligible account exists" }),
  ).toBeVisible();
  const reset = await emailLink(request, email, "/reset-password");
  await page.goto(reset);
  await page
    .getByLabel("New password", { exact: true })
    .fill("RecoveredPassword123!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("RecoveredPassword123!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?password-reset=1$/);
  await login(page, email, "RecoveredPassword123!");
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText(
    "do not have administrator access",
  );
  const cookies = await context.cookies();
  expect(
    cookies.find(
      (cookie) =>
        cookie.name === (process.env.E2E_SESSION_COOKIE || "webrchat-session"),
    )?.httpOnly,
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("login rejects a cookie request without a CSRF token or same-origin fetch metadata", async ({
  request,
}) => {
  const response = await request.post(`${site}/api/v1/login`, {
    headers: { Origin: site, Accept: "application/json" },
    data: { email: "missing@example.test", password: "WrongPassword123!" },
  });
  expect(response.status()).toBe(419);
});
