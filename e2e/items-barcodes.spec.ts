import { test, expect } from "./fixtures";
import { createTestItem } from "./helpers";

test.describe("Items barcode generation", () => {
  test("preview and PDF download work", async ({ page }) => {
    const itemId = await createTestItem(page, { name: "E2E Barcode Item", unitPrice: "9.99", costPrice: "4.00" });

    await page.goto(`/items/generate-barcodes?ids=${itemId}`);
    await expect(page.getByRole("heading", { name: "Generate Barcodes" })).toBeVisible();
    await expect(page.getByText("E2E Barcode Item")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download PDF" }).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
  });
});
