import { test as base, expect } from "@playwright/test";
import path from "node:path";

export * from "@playwright/test";

const authFile = path.resolve(process.cwd(), "e2e/.auth/admin.json");

export const test = base.extend({
  page: async ({ browser }, provide) => {
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

export { expect };
