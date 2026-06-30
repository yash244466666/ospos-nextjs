import { test, expect } from "./fixtures";
import { createTestEmployee, acceptDialogs, waitForTableRow } from "./helpers";

test.describe("Employees", () => {
  test("list page loads and can create an employee", async ({ page }) => {
    await page.goto("/employees");
    await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
    await expect(page.getByTestId("new-button")).toBeVisible();
    await expect(page.getByTestId("search-input")).toBeVisible();

    await createTestEmployee(page, { firstName: "E2E Employee", username: "e2eemployee", password: "password123" });
  });

  test("search filters employees", async ({ page }) => {
    await createTestEmployee(page, { firstName: "E2E Search Employee", username: "e2esearch", password: "password123" });
    await page.goto("/employees?q=E2E Search Employee");
    await waitForTableRow(page, "e2esearch");
  });

  test("edits an employee and preserves grants", async ({ page }) => {
    await createTestEmployee(page, { firstName: "E2E Edit Employee", username: "e2eedit", password: "password123" });
    const row = await waitForTableRow(page, "e2eedit");
    await row.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/employees\/new\/\d+$/);

    await page.locator("input[name='lastName']").fill("Updated");
    const reportsSales = page.locator("input[name='grant_reports_sales']");
    await reportsSales.check();
    await page.getByTestId("save-button").click();
    await page.waitForURL("/employees");

    const updated = await waitForTableRow(page, "e2eedit");
    await updated.getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/employees\/new\/\d+$/);
    await expect(page.locator("input[name='grant_reports_sales']")).toBeChecked();
  });

  test("admin user has no delete button", async ({ page }) => {
    await page.goto("/employees");
    const adminRow = await waitForTableRow(page, "admin");
    await expect(adminRow.getByRole("button", { name: "Delete" })).toHaveCount(0);
  });

  test("deletes a non-admin employee after confirmation", async ({ page }) => {
    acceptDialogs(page);
    await createTestEmployee(page, { firstName: "E2E Delete Employee", username: "e2edelete", password: "password123" });
    const row = await waitForTableRow(page, "e2edelete");
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("table tbody tr", { hasText: "e2edelete" })).toHaveCount(0, { timeout: 3000 });
  });
});
