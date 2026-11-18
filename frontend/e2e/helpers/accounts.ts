import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
// Keep this origin identical to FRONTEND_URL / APP_URL used in notification links.
export const site = process.env.E2E_AUTH_BASE_URL || "http://localhost:5173";
const inbox = process.env.E2E_MAILPIT_URL || "http://127.0.0.1:8026";
if (
  ![site, inbox].every((url) =>
    ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
  )
) {
  throw new Error(
    "Account lifecycle tests are restricted to local development services.",
  );
}

export async function emailLink(
  request: APIRequestContext,
  email: string,
  path: string,
): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const listing = await request.get(`${inbox}/api/v1/messages`);
        if (!listing.ok()) return false;
        const data = await listing.json();
        for (const item of data.messages || []) {
          if (
            !(item.To || []).some(
              (to: { Address: string }) => to.Address === email,
            )
          )
            continue;
          const message = await (
            await request.get(`${inbox}/api/v1/message/${item.ID}`)
          ).json();
          const matches = String(message.HTML || "").matchAll(
            /href="(https?:[^"]+)"/g,
          );
          for (const match of matches) {
            const candidate = match[1].replaceAll("&amp;", "&");
            if (new URL(candidate).pathname === path) {
              link = candidate;
              return true;
            }
          }
        }
        return false;
      },
      {
        timeout: 20000,
        message: "Expected a queued email in the local Mailpit inbox",
      },
    )
    .toBe(true);
  return link;
}
export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export const accountPassword = "StrongPassword123!";
export async function registerVerified(
  page: Page,
  request: APIRequestContext,
  name: string,
  email: string,
) {
  test.setTimeout(120000);
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(accountPassword);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(accountPassword);
  const submit = () =>
    Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/v1/register" &&
          response.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Create account", exact: true }).click(),
    ]);
  const [response] = await submit();
  if (response.status() === 429) {
    // Honor the real registration throttle when the complete suite creates
    // more than five accounts. Do not weaken the application's abuse controls.
    const seconds = Math.min(
      60,
      Math.max(1, Number(response.headers()["retry-after"]) || 60),
    );
    await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    await submit();
  }
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.goto(await emailLink(request, email, "/verify-email"));
  await page
    .getByRole("button", { name: "Verify email address", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re all set." }),
  ).toBeVisible();
}
