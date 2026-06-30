import { test, expect } from "./fixtures";
import { createTestSupplier, acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Suppliers", () => {
  test("list page loads and can create a supplier", async ({ page }) => {
    await page.goto("/suppliers");
    await expect(page.getByRole("heading", { name: "Suppliers" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();
    await expect(page.getByTestId("search-input")).toBeVisible();

    await createTestSupplier(page, { firstName: "E2E Supplier", companyName: "E2E Corp" });
  });

  test("search filters suppliers", async ({ page }) => {
    await createTestSupplier(page, { firstName: "E2E Search Supplier", companyName: "Search Co" });
    await page.goto("/suppliers?q=E2E Search Supplier");
    await waitForTableRow(page, "E2E Search Supplier");
  });

  test("edits a supplier", async ({ page }) => {
    await createTestSupplier(page, { firstName: "E2E Edit Supplier", companyName: "Old Co" });
    const row = await waitForTableRow(page, "E2E Edit Supplier");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/suppliers\/new\/\d+$/);

    await page.locator("input[name='companyName']").fill("Updated Co");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/suppliers");
    await waitForTableRow(page, "Updated Co");
  });

  test("deletes a supplier after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await createTestSupplier(page, { firstName: "E2E Delete Supplier", companyName: "Gone Co" });
    const row = await waitForTableRow(page, "E2E Delete Supplier");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Supplier" })).toHaveCount(0, { timeout: 3000 });
  });
});
