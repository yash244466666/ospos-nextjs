import { test, expect } from "./fixtures";
import { createTestItem, waitForTableRow } from "./helpers";

test.describe("Items", () => {
  test("list page loads with empty state", async ({ page }) => {
    await page.goto("/items");
    await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();
    await expect(page.getByTestId("search-input")).toBeVisible();
  });

  test("creates and edits an item", async ({ page }) => {
    const itemId = await createTestItem(page, { name: "E2E Edit Item", unitPrice: "25.00", costPrice: "10.00" });

    await page.goto(`/items/${itemId}`);
    await expect(page.getByRole("heading", { name: "Edit" })).toBeVisible();

    await page.locator("input[name='name']").fill("E2E Updated Item");
    await page.getByTestId("save-button").click();
    await page.waitForURL(`/items/${itemId}`);

    await page.goto("/items");
    await page.getByTestId("search-input").fill("E2E Updated");
    await page.getByTestId("search-button").click();
    await waitForTableRow(page, "E2E Updated Item");
  });

  test("inventory page adjusts quantity", async ({ page }) => {
    const itemId = await createTestItem(page, { name: "E2E Stock Item", unitPrice: "10.00", costPrice: "5.00" });
    await page.goto(`/items/${itemId}/inventory`);
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  });

  test("CSV import page loads", async ({ page }) => {
    await page.goto("/items/csv-import");
    await expect(page.getByRole("heading", { name: "CSV Import" })).toBeVisible();
  });

  test("barcode generation page loads", async ({ page }) => {
    await page.goto("/items/generate-barcodes");
    await expect(page.getByRole("heading", { name: "Generate Barcodes" })).toBeVisible();
  });
});
