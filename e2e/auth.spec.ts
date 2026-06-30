import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login with valid credentials redirects to home", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-username").fill("admin");
    await page.getByTestId("login-password").fill("pointofsale");
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/home");
    await expect(page.getByRole("heading", { name: /Welcome, admin/ })).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-username").fill("admin");
    await page.getByTestId("login-password").fill("wrong");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toContainText("Invalid username or password");
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated access to secure route redirects to login", async ({ page }) => {
    await page.goto("/items");
    await page.waitForURL("**/login**");
    await expect(page).toHaveURL(/callbackUrl=%2Fitems/);
  });
});
