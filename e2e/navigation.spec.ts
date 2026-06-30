import { test, expect } from "./fixtures";

test.describe("Navigation & permissions", () => {
  test("sidebar links render for allowed modules", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByTestId("nav-home")).toBeVisible();
    await expect(page.getByTestId("nav-sales")).toBeVisible();
    await expect(page.getByTestId("nav-items")).toBeVisible();
    await expect(page.getByTestId("nav-customers")).toBeVisible();
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.goto("/home");
    await page.getByTestId("nav-items").click();
    await page.waitForURL("/items");
    await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
  });

  test("reports and settings links are in office section", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByTestId("nav-reports")).toBeVisible();
    await expect(page.getByTestId("nav-config")).toBeVisible();
  });
});
