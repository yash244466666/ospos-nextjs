import { test, expect } from "./fixtures";

test.describe("Reports", () => {
  test("reports index lists report categories", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Summary Sales (by day)", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Detailed Sales", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inventory Summary", exact: true })).toBeVisible();
  });

  test("summary sales report loads with date filters", async ({ page }) => {
    await page.goto("/reports/summary_sales");
    await expect(page.getByRole("heading", { name: "Summary Sales (by day)" })).toBeVisible();
    await expect(page.getByTestId("report-date-start")).toBeVisible();
    await expect(page.getByTestId("report-date-end")).toBeVisible();
    await expect(page.getByTestId("report-apply-button")).toBeVisible();
    await expect(page.getByTestId("report-export-link")).toBeVisible();
  });

  test("inventory summary report renders", async ({ page }) => {
    await page.goto("/reports/inventory_summary");
    await expect(page.getByRole("heading", { name: "Inventory Summary" })).toBeVisible();
    await expect(page.getByTestId("report-filter-form").or(page.getByText("No data.")).or(page.getByTestId("report-table"))).toBeVisible();
  });
});
