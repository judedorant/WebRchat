import { test, expect } from "@playwright/test";
test("API readiness, navigation, theme, and mobile layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /good conversations/i }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("API connected");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Roadmap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Built with intention." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /good conversations/i }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Reverb accepts a real WebSocket handshake", async ({ page }) => {
  await page.goto("/");
  const event = await page.evaluate(
    (url) =>
      new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(url);
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error("Reverb handshake timeout"));
        }, 5000);
        socket.onmessage = (message) => {
          clearTimeout(timer);
          socket.close();
          resolve(JSON.parse(message.data).event);
        };
        socket.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Reverb connection failed"));
        };
      }),
    process.env.E2E_REVERB_URL ||
      "ws://127.0.0.1:8081/app/local-public-key?protocol=7&client=js&version=8.4.0&flash=false",
  );
  expect(event).toBe("pusher:connection_established");
});
