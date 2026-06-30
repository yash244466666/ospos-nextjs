import { test, expect } from "./fixtures";
import { createTestItem, createTestCustomer } from "./helpers";

test.describe("Sales register", () => {
  let itemId: number;
  let saleId: number;

  test.beforeAll(async ({ page }) => {
    itemId = await createTestItem(page, { name: "E2E Widget", unitPrice: "100.00", costPrice: "50.00" });
    await createTestCustomer(page, { firstName: "E2E", lastName: "Customer" });
    await page.goto("/sales/register");
  });

  test("loads with empty cart", async ({ page }) => {
    await page.goto("/sales/register");
    await expect(page.getByRole("heading", { name: "Point of Sale" })).toBeVisible();
    await expect(page.getByTestId("cart-table").getByText("No items yet")).toBeVisible();
    await expect(page.getByTestId("totals-total-value")).toHaveText("$0.00");
  });

  test("adds item to cart and shows totals", async ({ page }) => {
    await page.goto("/sales/register");
    await page.getByTestId("item-input").fill(String(itemId));
    await page.getByTestId("add-item-button").click();

    await expect(page.getByTestId("cart-row-1")).toBeVisible();
    await expect(page.getByTestId("cart-item-name-1")).toHaveText("E2E Widget");
    await expect(page.getByTestId("cart-row-total-1")).toHaveText("$100.00");
    await expect(page.getByTestId("totals-total-value")).toHaveText("$108.00"); // 8% default tax
  });

  test("edits cart quantity and updates totals", async ({ page }) => {
    await page.goto("/sales/register");
    await page.getByTestId("item-input").fill(String(itemId));
    await page.getByTestId("add-item-button").click();

    const qty = page.getByTestId("cart-row-1").locator("input[type=number]").nth(1);
    await qty.fill("3");
    await qty.press("Tab");
    await page.waitForTimeout(300); // server transition

    await expect(page.getByTestId("cart-row-total-1")).toHaveText("$300.00");
    await expect(page.getByTestId("totals-total-value")).toContainText("$");
  });

  test("adds cash payment and shows amount due", async ({ page }) => {
    await page.goto("/sales/register");
    await page.getByTestId("item-input").fill(String(itemId));
    await page.getByTestId("add-item-button").click();

    await page.getByTestId("payment-amount").fill("200");
    await page.getByTestId("add-payment-button").click();

    await expect(page.getByTestId("payments-paid")).toContainText("$200.00");
  });

  test("completes a sale and redirects to receipt", async ({ page }) => {
    await page.goto("/sales/register");
    await page.getByTestId("item-input").fill(String(itemId));
    await page.getByTestId("add-item-button").click();

    await page.getByTestId("payment-amount").fill("200");
    await page.getByTestId("add-payment-button").click();

    await page.getByTestId("complete-sale-button").click();
    await page.waitForURL(/\/sales\/receipt\//);
    await expect(page.getByText("E2E Widget")).toBeVisible();

    const match = page.url().match(/\/sales\/receipt\/(\d+)/);
    saleId = match ? parseInt(match[1], 10) : 0;
    await expect(saleId).toBeGreaterThan(0);
  });

  test("suspends and unsuspends a sale", async ({ page }) => {
    await page.goto("/sales/register");
    await page.getByTestId("item-input").fill(String(itemId));
    await page.getByTestId("add-item-button").click();

    await page.getByTestId("suspend-sale-button").click();
    await page.waitForURL("/sales/suspended");
    await expect(page.getByRole("button", { name: "Unsuspend" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Unsuspend" }).first().click();
    await page.waitForURL("/sales/register");
    await expect(page.getByTestId("cart-row-1")).toBeVisible();
  });

  test("return mode uses negative totals", async ({ page }) => {
    await page.goto("/sales/register");
    await page.getByTestId("item-input").fill(String(itemId));
    await page.getByTestId("add-item-button").click();
    await page.getByTestId("payment-amount").fill("200");
    await page.getByTestId("add-payment-button").click();
    await page.getByTestId("complete-sale-button").click();
    await page.waitForURL(/\/sales\/receipt\//);
    const match = page.url().match(/\/sales\/receipt\/(\d+)/);
    const id = match ? parseInt(match[1], 10) : 0;

    await page.goto("/sales/register");
    await page.getByTestId("mode-return").click();
    await page.getByTestId("item-input").fill(`POS ${id}`);
    await page.getByTestId("add-item-button").click();

    await expect(page.getByTestId("cart-item-name-1")).toHaveText("E2E Widget");
    await expect(page.getByTestId("cart-row-total-1")).toContainText("-");
    await expect(page.getByTestId("totals-total-value")).toContainText("-");
  });

  test("switches register modes", async ({ page }) => {
    await page.goto("/sales/register");
    await page.getByTestId("mode-sale_invoice").click();
    await expect(page.getByTestId("document-number-input")).toBeVisible();

    await page.getByTestId("mode-sale_quote").click();
    await expect(page.getByTestId("document-number-input")).toBeVisible();

    await page.getByTestId("mode-sale_work_order").click();
    await expect(page.getByTestId("document-number-input")).toBeVisible();

    await page.getByTestId("mode-return").click();
    await expect(page.getByTestId("document-number-input")).toBeHidden();
  });
});
