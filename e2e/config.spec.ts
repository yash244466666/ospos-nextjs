import { test, expect } from "./fixtures";

test.describe("Configuration", () => {
  test("configuration page loads with tabs", async ({ page }) => {
    await page.goto("/config");
    await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
    await expect(page.getByTestId("config-tab-general")).toBeVisible();
    await expect(page.getByTestId("config-tab-locale")).toBeVisible();
  });

  test("updates company name and persists after reload", async ({ page }) => {
    await page.goto("/config");
    await page.locator("input[name='company']").fill("E2E Test Company");
    await page.getByTestId("save-config-button").click();
    await expect(page.locator("text=Saved")).toBeVisible();

    await page.reload();
    await expect(page.locator("input[name='company']")).toHaveValue("E2E Test Company");
  });

  test("updates currency symbol and restores default", async ({ page }) => {
    await page.goto("/config");
    await page.getByTestId("config-tab-locale").click();
    await page.locator("input[name='currency_symbol']").fill("€");
    await page.getByTestId("save-config-button").click();
    await expect(page.locator("text=Saved")).toBeVisible();

    await page.reload();
    await page.getByTestId("config-tab-locale").click();
    await expect(page.locator("input[name='currency_symbol']")).toHaveValue("€");

    await page.locator("input[name='currency_symbol']").fill("$");
    await page.getByTestId("save-config-button").click();
    await expect(page.locator("text=Saved")).toBeVisible();
  });
});
