import { test, expect } from "./fixtures";
import { acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Gift Cards", () => {
  test("list page loads and can create a gift card", async ({ page }) => {
    await page.goto("/giftcards");
    await expect(page.getByRole("heading", { name: "Gift Cards" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/giftcards/new/0");
    await page.locator("input[name='giftcardNumber']").fill("E2E-GC-001");
    await page.locator("input[name='value']").fill("50.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/giftcards");
    await waitForTableRow(page, "E2E-GC-001");
  });

  test("edits a gift card", async ({ page }) => {
    await page.goto("/giftcards/new/0");
    await page.locator("input[name='giftcardNumber']").fill("E2E-GC-EDIT");
    await page.locator("input[name='value']").fill("25.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/giftcards");

    const row = await waitForTableRow(page, "E2E-GC-EDIT");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/giftcards\/new\/\d+$/);
    await page.locator("input[name='value']").fill("75.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/giftcards");
    await waitForTableRow(page, "75.00");
  });

  test("deletes a gift card after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/giftcards/new/0");
    await page.locator("input[name='giftcardNumber']").fill("E2E-GC-DEL");
    await page.locator("input[name='value']").fill("10.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/giftcards");

    const row = await waitForTableRow(page, "E2E-GC-DEL");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E-GC-DEL" })).toHaveCount(0, { timeout: 3000 });
  });
});
