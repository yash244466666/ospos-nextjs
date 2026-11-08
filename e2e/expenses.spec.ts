import { test, expect } from "./fixtures";
import { acceptDialogs, createTestExpenseCategory, waitForTableRow } from "./helpers";

test.describe("Expenses", () => {
  test.beforeAll(async ({ page }) => {
    await createTestExpenseCategory(page, "E2E Expense Category");
  });

  test("list page loads and can create an expense", async ({ page }) => {
    await page.goto("/expenses");
    await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/expenses/new/0");
    await page.locator("input[name='amount']").fill("12.50");
    await page.locator("select[name='expenseCategoryId']").selectOption({ label: "E2E Expense Category" });
    await page.locator("select[name='paymentType']").selectOption("credit");
    await page.locator("textarea[name='description']").fill("E2E expense note");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses");
    await waitForTableRow(page, "12.50");
  });

  test("edits an expense", async ({ page }) => {
    await page.goto("/expenses/new/0");
    await page.locator("select[name='expenseCategoryId']").selectOption({ label: "E2E Expense Category" });
    await page.locator("input[name='amount']").fill("25.00");
    await page.locator("textarea[name='description']").fill("E2E Edit Expense");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses");

    const row = await waitForTableRow(page, "E2E Edit Expense");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/expenses\/new\/\d+$/);
    await page.locator("input[name='amount']").fill("30.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses");
    await waitForTableRow(page, "30.00");
  });

  test("deletes an expense after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/expenses/new/0");
    await page.locator("select[name='expenseCategoryId']").selectOption({ label: "E2E Expense Category" });
    await page.locator("input[name='amount']").fill("5.00");
    await page.locator("textarea[name='description']").fill("E2E Delete Expense");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/expenses");

    const row = await waitForTableRow(page, "E2E Delete Expense");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Expense" })).toHaveCount(0, { timeout: 3000 });
  });
});
