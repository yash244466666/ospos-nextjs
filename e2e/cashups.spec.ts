import { test, expect } from "./fixtures";
import { acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Cashups", () => {
  test("list page loads and can create a cashup", async ({ page }) => {
    await page.goto("/cashups");
    await expect(page.getByRole("heading", { name: "Cashups" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/cashups/new/0");
    await page.locator("input[name='openAmountCash']").fill("100.00");
    await page.locator("input[name='transferAmountCash']").fill("20.00");
    await page.locator("input[name='closedAmountCash']").fill("120.00");
    await page.locator("textarea[name='note']").fill("E2E cashup note");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/cashups");
    await waitForTableRow(page, "100.00");
  });

  test("edits a cashup", async ({ page }) => {
    await page.goto("/cashups/new/0");
    await page.locator("input[name='openAmountCash']").fill("50.00");
    await page.locator("input[name='closedAmountCash']").fill("55.00");
    await page.locator("textarea[name='note']").fill("E2E Edit Cashup");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/cashups");

    const row = await waitForTableRow(page, "55.00");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/cashups\/new\/\d+$/);
    await page.locator("input[name='closedAmountCash']").fill("60.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/cashups");
    await waitForTableRow(page, "60.00");
  });

  test("deletes a cashup after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/cashups/new/0");
    await page.locator("input[name='openAmountCash']").fill("10.00");
    await page.locator("textarea[name='note']").fill("E2E Delete Cashup");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/cashups");

    const row = await waitForTableRow(page, "10.00");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "10.00" })).toHaveCount(0, { timeout: 3000 });
  });
});
