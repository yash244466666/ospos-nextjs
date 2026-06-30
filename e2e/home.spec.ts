import { test, expect } from "./fixtures";

test.describe("Home dashboard", () => {
  test("renders welcome and metric cards", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Welcome, admin/ })).toBeVisible();
    await expect(page.getByTestId("metric-sales")).toBeVisible();
    await expect(page.getByTestId("metric-stock")).toBeVisible();
    await expect(page.getByTestId("metric-suspended")).toBeVisible();
    await expect(page.getByTestId("metric-items")).toBeVisible();
  });

  test("quick actions navigate to key modules", async ({ page }) => {
    await page.goto("/home");

    await page.getByTestId("quick-action-open-pos-register").click();
    await page.waitForURL("/sales/register");
    await expect(page.getByRole("heading", { name: "Point of Sale" })).toBeVisible();

    await page.goto("/home");
    await page.getByTestId("quick-action-add-new-item").click();
    await page.waitForURL("/items/new");
    await expect(page.getByRole("heading", { name: "New Item" })).toBeVisible();

    await page.goto("/home");
    await page.getByTestId("quick-action-new-receiving").click();
    await page.waitForURL("/receivings/register");
    await expect(page.getByRole("heading", { name: "Receiving" })).toBeVisible();

    await page.goto("/home");
    await page.getByTestId("quick-action-view-reports").click();
    await page.waitForURL("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  });
});
