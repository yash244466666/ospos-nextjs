import { test, expect } from "./fixtures";

test.describe("Office", () => {
  test("office shortcuts page loads", async ({ page }) => {
    await page.goto("/office");
    await expect(page.getByRole("heading", { name: "Office" })).toBeVisible();
    await expect(page.getByTestId("office-shortcut-reports")).toBeVisible();
    await expect(page.getByTestId("office-shortcut-config")).toBeVisible();
    await expect(page.getByTestId("office-shortcut-pos")).toBeVisible();
  });

  test("shortcuts navigate to their destinations", async ({ page }) => {
    await page.goto("/office");

    await page.getByTestId("office-shortcut-reports").click();
    await page.waitForURL("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

    await page.goto("/office");
    await page.getByTestId("office-shortcut-config").click();
    await page.waitForURL("/config");
    await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();

    await page.goto("/office");
    await page.getByTestId("office-shortcut-pos").click();
    await page.waitForURL("/sales/register");
    await expect(page.getByRole("heading", { name: "Point of Sale" })).toBeVisible();
  });
});
