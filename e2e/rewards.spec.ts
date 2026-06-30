import { test, expect } from "./fixtures";
import { acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Customer Rewards", () => {
  test("list page loads and can create a reward", async ({ page }) => {
    await page.goto("/rewards");
    await expect(page.getByRole("heading", { name: "Customer Rewards" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/rewards/new/0");
    await page.locator("input[name='name']").fill("E2E Reward");
    await page.locator("input[name='pointsPercent']").fill("5.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/rewards");
    await waitForTableRow(page, "E2E Reward");
  });

  test("edits a reward", async ({ page }) => {
    await page.goto("/rewards/new/0");
    await page.locator("input[name='name']").fill("E2E Edit Reward");
    await page.locator("input[name='pointsPercent']").fill("3.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/rewards");

    const row = await waitForTableRow(page, "E2E Edit Reward");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/rewards\/new\/\d+$/);
    await page.locator("input[name='name']").fill("E2E Updated Reward");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/rewards");
    await waitForTableRow(page, "E2E Updated Reward");
  });

  test("deletes a reward after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/rewards/new/0");
    await page.locator("input[name='name']").fill("E2E Delete Reward");
    await page.locator("input[name='pointsPercent']").fill("1.00");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/rewards");

    const row = await waitForTableRow(page, "E2E Delete Reward");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Reward" })).toHaveCount(0, { timeout: 3000 });
  });
});
