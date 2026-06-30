import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const authFile = path.resolve(process.cwd(), "e2e/.auth/admin.json");

setup.setTimeout(120000);

setup("authenticate as admin", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/login");
  await page.getByTestId("login-username").fill("admin");
  await page.getByTestId("login-password").fill("pointofsale");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/home");
  await expect(page.getByText("Welcome, admin")).toBeVisible();

  await page.context().storageState({ path: authFile });
});
