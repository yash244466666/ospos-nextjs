import { test as base, expect, type Page } from "@playwright/test";

export * from "@playwright/test";

/**
 * OSPOS carts live in a browser session (`ospos_sessions`). Reusing a stored
 * auth cookie across tests would share one cart, so each test gets a fresh
 * browser context and a fresh login, matching the upstream session boundary.
 */
async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-username").fill("admin");
  await page.getByTestId("login-password").fill("pointofsale");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/home");
}

export const test = base.extend({
  page: async ({ browser }, provide) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page);
    await provide(page);
    await context.close();
  },
});

export { expect };
