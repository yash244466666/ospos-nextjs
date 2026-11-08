import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { truncateMysqlTables } from "@/test/mysql-db";
import { loadConfig } from "@/lib/config";

/**
 * Every read repository must generate valid MySQL SQL even with empty tables.
 * This catches dialect-only syntax errors (CONCAT/GROUP_CONCAT, DATE_FORMAT,
 * LIKE collation, CAST) that an empty result set would otherwise hide.
 */

beforeAll(async () => {
  await loadConfig(true);
});

beforeEach(async () => {
  await truncateMysqlTables();
});

describe("repository reads on MySQL", () => {
  it("taxes", async () => {
    const taxes = await import("./taxes/repository");
    await expect(taxes.getAllTaxCategories()).resolves.toEqual([]);
    await expect(taxes.getAllTaxCodes()).resolves.toEqual([]);
    await expect(taxes.getAllJurisdictions()).resolves.toEqual([]);
    await expect(taxes.getTaxCategoryUsage(1)).resolves.toBe(0);
    await expect(taxes.getTaxCategorySuggestions("x")).resolves.toEqual([]);
    await expect(taxes.getTaxCodeSearchSuggestions("x")).resolves.toEqual([]);
  });

  it("attributes", async () => {
    const attributes = await import("./attributes/repository");
    await expect(attributes.listDefinitions()).resolves.toEqual([]);
    await expect(attributes.getDefinitionNames()).resolves.toEqual([]);
    await expect(attributes.getTotalDefinitionRows()).resolves.toBe(0);
    await expect(attributes.getDefinitionsByFlags(0)).resolves.toEqual([]);
    await expect(attributes.getSuggestions("x")).resolves.toEqual([]);
    await expect(attributes.searchDefinitions("x", 25)).resolves.toEqual([]);
  });

  it("giftcards", async () => {
    const giftcards = await import("./giftcards/repository");
    await expect(giftcards.getAll()).resolves.toEqual([]);
    await expect(giftcards.search("x")).resolves.toEqual([]);
    await expect(giftcards.getTotalRows()).resolves.toBe(0);
    await expect(giftcards.getSearchSuggestions("x")).resolves.toEqual([]);
  });

  it("cashups", async () => {
    const cashups = await import("./cashups/repository");
    await expect(cashups.listCashups()).resolves.toEqual([]);
    await expect(cashups.getAll()).resolves.toEqual([]);
    await expect(cashups.search({}, 25, 0)).resolves.toEqual([]);
    await expect(cashups.getTotalRows()).resolves.toBe(0);
  });

  it("expenses and categories", async () => {
    const expenses = await import("./expenses/repository");
    await expect(expenses.getAll()).resolves.toEqual([]);
    await expect(expenses.search("", { is_deleted: false }, 25, 0)).resolves.toEqual([]);
    await expect(expenses.getTotalRows()).resolves.toBe(0);
    const categories = await import("./expenses_categories/repository");
    await expect(categories.getAll()).resolves.toEqual([]);
    await expect(categories.search("x")).resolves.toEqual([]);
    await expect(categories.getTotalRows()).resolves.toBe(0);
  });

  it("dinner tables, rewards and item kits", async () => {
    const dinnerTables = await import("./dinner_tables/repository");
    await expect(dinnerTables.getAll()).resolves.toEqual([]);
    await expect(dinnerTables.search("x")).resolves.toEqual([]);
    const rewards = await import("./rewards/repository");
    await expect(rewards.getAll()).resolves.toEqual([]);
    const itemKits = await import("./item_kits/repository");
    await expect(itemKits.getAll()).resolves.toEqual([]);
    await expect(itemKits.search("x")).resolves.toEqual([]);
    await expect(itemKits.getTotalRows()).resolves.toBe(0);
  });

  it("stock locations and people search", async () => {
    const locations = await import("./stock_locations/repository");
    await expect(locations.getAll()).resolves.toEqual([]);
    await expect(locations.search("x")).resolves.toEqual([]);
    await expect(locations.getTotalRows()).resolves.toBe(0);
    const persons = await import("./persons/repository");
    await expect(persons.searchCustomers("x")).resolves.toEqual([]);
    await expect(persons.searchSuppliers("x")).resolves.toEqual([]);
    await expect(persons.searchEmployees("x")).resolves.toEqual([]);
    await expect(persons.listAllPermissions()).resolves.toEqual([]);
  });
});
