import { test, expect } from "./fixtures";
import { acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Dinner Tables", () => {
  test("list page loads and can create a table", async ({ page }) => {
    await page.goto("/dinner_tables");
    await expect(page.getByRole("heading", { name: "Dinner Tables" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/dinner_tables/new/0");
    await page.locator("input[name='name']").fill("E2E Table 1");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/dinner_tables");
    await waitForTableRow(page, "E2E Table 1");
  });

  test("edits a dinner table", async ({ page }) => {
    await page.goto("/dinner_tables/new/0");
    await page.locator("input[name='name']").fill("E2E Edit Table");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/dinner_tables");

    const row = await waitForTableRow(page, "E2E Edit Table");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/dinner_tables\/new\/\d+$/);
    await page.locator("input[name='name']").fill("E2E Updated Table");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/dinner_tables");
    await waitForTableRow(page, "E2E Updated Table");
  });

  test("deletes a dinner table after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/dinner_tables/new/0");
    await page.locator("input[name='name']").fill("E2E Delete Table");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/dinner_tables");

    const row = await waitForTableRow(page, "E2E Delete Table");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Table" })).toHaveCount(0, { timeout: 3000 });
  });
});
