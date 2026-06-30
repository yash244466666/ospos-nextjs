import { test, expect } from "./fixtures";

test.describe("Taxes", () => {
  test("tax rates list page loads", async ({ page }) => {
    await page.goto("/taxes");
    await expect(page.getByRole("heading", { name: "Tax Rates" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();
  });

  test("tax rate form renders with code, category, and jurisdiction selects", async ({ page }) => {
    await page.goto("/taxes/new/0");
    await expect(page.getByRole("heading", { name: "New Tax Rate" })).toBeVisible();
    await expect(page.locator("select[name='taxCodeId']")).toBeVisible();
    await expect(page.locator("select[name='taxCategoryId']")).toBeVisible();
    await expect(page.locator("select[name='jurisdictionId']")).toBeVisible();
    await expect(page.getByTestId("save-button")).toBeVisible();
  });
});
