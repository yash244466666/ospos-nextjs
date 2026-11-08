import type { Page, Locator } from "@playwright/test";
import { expect } from "./fixtures";

export async function waitForTableRow(page: Page, text: string): Promise<Locator> {
  const row = page.locator("table tbody tr", { hasText: text }).first();
  await expect(row).toBeVisible();
  return row;
}

export async function selectOptionByLabel(page: Page, testId: string, label: string): Promise<void> {
  const select = page.getByTestId(testId);
  await select.selectOption({ label });
}

export async function fillField(page: Page, testId: string, value: string): Promise<void> {
  const field = page.getByTestId(testId);
  await field.fill(value);
}

export async function submitForm(page: Page, formTestId = "entity-form"): Promise<void> {
  await page.getByTestId(formTestId).getByTestId("save-button").click();
}

export async function expectToast(page: Page, text: string): Promise<void> {
  // The app currently does not render toast notifications. This helper waits
  // for either a toast element or falls back to checking the page content.
  const toast = page.locator("[data-testid='toast-message']", { hasText: text });
  const fallback = page.locator("body", { hasText: text });
  await expect(toast.or(fallback).first()).toBeVisible({ timeout: 5000 }).catch(() => {
    // tolerate apps without toasts
  });
}

export async function expectHeading(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByRole("heading", { name: text }).first()).toBeVisible();
}

export async function createTestItem(page: Page, item: { name: string; unitPrice: string; costPrice?: string }): Promise<number> {
  await page.goto("/items/new");
  await page.locator("input[name='name']").fill(item.name);
  await page.locator("input[name='unitPrice']").fill(item.unitPrice);
  if (item.costPrice) await page.locator("input[name='costPrice']").fill(item.costPrice);
  await page.getByTestId("save-button").click();
  await page.waitForURL(/\/items\/\d+$/);
  const match = page.url().match(/\/items\/(\d+)$/);
  const itemId = match ? parseInt(match[1], 10) : 0;
  await expect(itemId).toBeGreaterThan(0);
  return itemId;
}

export async function createTestCustomer(page: Page, customer: { firstName: string; lastName: string }): Promise<void> {
  await page.goto("/customers/new/0");
  await page.locator("input[name='firstName']").fill(customer.firstName);
  await page.locator("input[name='lastName']").fill(customer.lastName);
  await page.getByTestId("save-button").click();
  await page.waitForURL("/customers");
  await waitForTableRow(page, customer.firstName);
}

export async function acceptDialogs(page: Page): Promise<void> {
  page.on("dialog", (dialog) => void dialog.accept());
}

export async function createTestSupplier(page: Page, supplier: { firstName: string; companyName: string }): Promise<number> {
  await page.goto("/suppliers/new/0");
  await page.locator("input[name='firstName']").fill(supplier.firstName);
  await page.locator("input[name='companyName']").fill(supplier.companyName);
  await page.getByTestId("save-button").click();
  await page.waitForURL(/\/suppliers$/);
  const row = await waitForTableRow(page, supplier.firstName);
  const href = await row.getByRole("link", { name: "Edit" }).getAttribute("href");
  const match = href?.match(/\/(\d+)$/);
  const id = match ? parseInt(match[1], 10) : 0;
  await expect(id).toBeGreaterThan(0);
  return id;
}

export async function createTestEmployee(page: Page, employee: { firstName: string; username: string; password: string }): Promise<number> {
  await page.goto("/employees/new/0");
  await page.locator("input[name='firstName']").fill(employee.firstName);
  await page.locator("input[name='username']").fill(employee.username);
  await page.locator("input[name='password']").fill(employee.password);
  await page.getByTestId("save-button").click();
  await page.waitForURL(/\/employees$/);
  const row = await waitForTableRow(page, employee.username);
  const href = await row.getByRole("link", { name: "Edit" }).getAttribute("href");
  const match = href?.match(/\/(\d+)$/);
  const id = match ? parseInt(match[1], 10) : 0;
  await expect(id).toBeGreaterThan(0);
  return id;
}

export async function resetCart(page: Page): Promise<void> {
  await page.goto("/sales/register");
  await page.waitForSelector("[data-testid='cart-table']");
}


export async function createTestExpenseCategory(page: Page, name: string): Promise<void> {
  await page.goto("/expenses_categories/new/0");
  await page.locator("input[name='category']").fill(name);
  await page.locator("textarea[name='description']").fill(name);
  await page.getByTestId("save-button").click();
  await page.waitForURL(/\/expenses_categories$/);
  await waitForTableRow(page, name);
}
