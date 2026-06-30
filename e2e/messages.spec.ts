import { test, expect } from "./fixtures";

test.describe("Messages", () => {
  test("messages page loads and can submit an SMS", async ({ page }) => {
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Send Message" })).toBeVisible();
    await expect(page.getByTestId("messages-form")).toBeVisible();

    await page.locator("input[name='phone']").fill("+8801712345678");
    await page.locator("textarea[name='message']").fill("E2E test message");
    await page.getByTestId("send-button").click();
    await expect(page.locator("text=SMS provider is stubbed")).toBeVisible();
  });
});
