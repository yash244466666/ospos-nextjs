import { test, expect } from "./fixtures";
import { acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Attributes", () => {
  test("list page loads and can create a text attribute", async ({ page }) => {
    await page.goto("/attributes");
    await expect(page.getByRole("heading", { name: "Attributes" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();

    await page.getByTestId("new-button").click();
    await page.waitForURL("/attributes/new/0");
    await page.locator("input[name='definitionName']").fill("E2E Text Attribute");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/attributes");
    await waitForTableRow(page, "E2E Text Attribute");
  });

  test("edits an attribute", async ({ page }) => {
    await page.goto("/attributes/new/0");
    await page.locator("input[name='definitionName']").fill("E2E Edit Attribute");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/attributes");

    const row = await waitForTableRow(page, "E2E Edit Attribute");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/attributes\/new\/\d+$/);
    await page.locator("input[name='definitionName']").fill("E2E Updated Attribute");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/attributes");
    await waitForTableRow(page, "E2E Updated Attribute");
  });

  test("creates a dropdown attribute with values", async ({ page }) => {
    await page.goto("/attributes/new/0");
    await page.locator("input[name='definitionName']").fill("E2E Dropdown Attribute");
    await page.locator("select[name='definitionType']").selectOption("DROPDOWN");
    await page.locator("input[placeholder='Value']").first().fill("Option A");
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.locator("input[placeholder='Value']").nth(1).fill("Option B");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/attributes");
    await waitForTableRow(page, "E2E Dropdown Attribute");
  });

  test("deletes an attribute after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await page.goto("/attributes/new/0");
    await page.locator("input[name='definitionName']").fill("E2E Delete Attribute");
    await page.getByTestId("save-button").click();
    await page.waitForURL("/attributes");

    const row = await waitForTableRow(page, "E2E Delete Attribute");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "E2E Delete Attribute" })).toHaveCount(0, { timeout: 3000 });
  });
});
