import { test, expect } from "./fixtures";
import { createTestItem, acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Item Kits", () => {
  let itemId: number;

  test.beforeAll(async ({ page }) => {
    itemId = await createTestItem(page, { name: "E2E Kit Component", unitPrice: "10.00", costPrice: "5.00" });
  });

  test("list page loads and can create a kit", async ({ page }) => {
    await page.goto("/item_kits");
    await expect(page.getByRole("heading", { name: "Item Kits" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/item_kits/new/0");
    await page.locator("input[name='name']").fill("E2E Starter Kit");
    await page.locator("input[name='itemKitNumber']").fill("KIT-001");

    await page.locator("[data-testid='kit-item-select']").first().selectOption(String(itemId), { timeout: 5000 });
    await page.locator("table tbody input[type=number]").nth(1).fill("2");

    await page.getByTestId("save-button").click();
    await page.waitForURL("/item_kits");
    await waitForTableRow(page, "E2E Starter Kit");
  });

  test("edits a kit", async ({ page }) => {
    await page.goto("/item_kits/new/0");
    await page.locator("input[name='name']").fill("E2E Edit Kit");
    await page.locator("[data-testid='kit-item-select']").first().selectOption(String(itemId), { timeout: 5000 });
    await page.getByTestId("save-button").click();
    await page.waitForURL("/item_kits");

    const row = await waitForTableRow(page, "E2E Edit Kit");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/item_kits\/new\/\d+$/);
    await page.locator("input[name='name']").fill("E2E Updated Kit");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/item_kits");
    await waitForTableRow(page, "E2E Updated Kit");
  });

  test("deletes a kit after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/item_kits/new/0");
    await page.locator("input[name='name']").fill("E2E Delete Kit");
    await page.locator("[data-testid='kit-item-select']").first().selectOption(String(itemId), { timeout: 5000 });
    await page.getByTestId("save-button").click();
    await page.waitForURL("/item_kits");

    const row = await waitForTableRow(page, "E2E Delete Kit");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Kit" })).toHaveCount(0, { timeout: 3000 });
  });
});
