import { test, expect } from "./fixtures";
import { createTestCustomer, acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Customers", () => {
  test("list page loads and can create a customer", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();
    await expect(page.getByTestId("search-input")).toBeVisible();

    await createTestCustomer(page, { firstName: "E2E Customer", lastName: "One" });
  });

  test("search filters customers", async ({ page }) => {
    await createTestCustomer(page, { firstName: "E2E Search", lastName: "Customer" });
    await page.goto("/customers?q=E2E Search");
    await waitForTableRow(page, "E2E Search");
  });

  test("edits a customer", async ({ page }) => {
    await createTestCustomer(page, { firstName: "E2E Edit Customer", lastName: "A" });
    const row = await waitForTableRow(page, "E2E Edit Customer");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/customers\/new\/\d+$/);

    await page.locator("input[name='lastName']").fill("B");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/customers");
    await waitForTableRow(page, "B");
  });

  test("deletes a customer after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await createTestCustomer(page, { firstName: "E2E Delete Customer", lastName: "X" });
    const row = await waitForTableRow(page, "E2E Delete Customer");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Customer" })).toHaveCount(0, { timeout: 3000 });
  });
});
