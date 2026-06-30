import { test, expect } from "./fixtures";
import { createTestItem } from "./helpers";

test.describe("Receivings", () => {
  let itemId: number;

  test.beforeAll(async ({ page }) => {
    itemId = await createTestItem(page, { name: "E2E Receive Widget", unitPrice: "50.00", costPrice: "20.00" });
  });

  test("register loads and can receive items", async ({ page }) => {
    await page.goto("/receivings/register");
    await expect(page.getByRole("heading", { name: "Receiving" })).toBeVisible();

    await page.getByPlaceholder("Item name or barcode").fill(String(itemId));
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });
});
