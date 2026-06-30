import { test, expect } from "./fixtures";
import { acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Expense Categories", () => {
  test("list page loads and can create a category", async ({ page }) => {
    await page.goto("/expenses_categories");
    await expect(page.getByRole("heading", { name: "Expense Categories" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/expenses_categories/new/0");
    await page.locator("input[name='category']").fill("E2E Travel");
    await page.locator("textarea[name='description']").fill("Travel expenses");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses_categories");
    await waitForTableRow(page, "E2E Travel");
  });

  test("edits a category", async ({ page }) => {
    await page.goto("/expenses_categories/new/0");
    await page.locator("input[name='category']").fill("E2E Edit Category");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses_categories");

    const row = await waitForTableRow(page, "E2E Edit Category");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/expenses_categories\/new\/\d+$/);
    await page.locator("input[name='category']").fill("E2E Updated Category");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses_categories");
    await waitForTableRow(page, "E2E Updated Category");
  });

  test("deletes a category after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/expenses_categories/new/0");
    await page.locator("input[name='category']").fill("E2E Delete Category");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses_categories");

    const row = await waitForTableRow(page, "E2E Delete Category");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Category" })).toHaveCount(0, { timeout: 3000 });
  });
});
