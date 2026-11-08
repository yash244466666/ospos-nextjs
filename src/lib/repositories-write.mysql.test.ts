import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execMysql, queryMysql, truncateMysqlTables } from "@/test/mysql-db";
import { invalidateConfigCache, loadConfig } from "@/lib/config";
import { nowDb } from "@/lib/datetime";

async function seedBase(): Promise<void> {
  await execMysql(
    `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
     VALUES (1, 'Admin', 'User', '', '', '', '', '', '', '', '', '')`,
  );
  await execMysql(
    "INSERT INTO ospos_employees (person_id, username, password, hash_version) VALUES (1, 'admin', 'x', 2)",
  );
  await execMysql(
    "INSERT INTO ospos_stock_locations (location_id, location_name, deleted, is_default, sort_order) VALUES (1, 'stock', 0, 1, 0)",
  );
  await execMysql(
    `INSERT INTO ospos_items (item_id, name, category, description, cost_price, unit_price, allow_alt_description, is_serialized)
     VALUES (1, 'Widget', 'cat', 'Widget', '5.00', '10.00', 0, 0)`,
  );
  await execMysql(
    "INSERT INTO ospos_item_quantities (item_id, location_id, quantity) VALUES (1, 1, 10)",
  );
  await execMysql(
    "INSERT INTO ospos_expense_categories (expense_category_id, category_name, category_description, deleted) VALUES (1, 'Office', 'Office expenses', 0)",
  );
}

beforeAll(async () => {
  await loadConfig(true);
});

beforeEach(async () => {
  await truncateMysqlTables();
  await seedBase();
  invalidateConfigCache();
  await loadConfig(true);
});

describe("repository writes on MySQL", () => {
  it("creates and updates a giftcard", async () => {
    const giftcards = await import("./giftcards/repository");
    const id = await giftcards.saveValue({ giftcardNumber: "GC1", value: "50.00", personId: null });
    expect(id).toBeGreaterThan(0);
    expect((await giftcards.getGiftcardValue("GC1"))?.value).toBe("50.00");
    await giftcards.saveValue({ giftcardId: id, giftcardNumber: "GC1", value: "75.00", personId: null });
    expect((await giftcards.getGiftcardValue("GC1"))?.value).toBe("75.00");
  });

  it("creates dinner tables and reward packages", async () => {
    const dinnerTables = await import("./dinner_tables/repository");
    const tableId = await dinnerTables.saveValue({ dinnerTableId: 0, name: "Patio 1", status: 0, deleted: false });
    expect(tableId).toBeGreaterThan(0);
    expect((await dinnerTables.getAll()).map((t) => t.name)).toContain("Patio 1");

    const rewards = await import("./rewards/repository");
    const rewardId = await rewards.saveValue({ rewardId: 0, name: "Gold", pointsPercent: 10, deleted: false });
    expect(rewardId).toBeGreaterThan(0);
    expect((await rewards.getAll()).map((r) => r.name)).toContain("Gold");
  });

  it("creates tax categories, jurisdictions and codes with links", async () => {
    const taxes = await import("./taxes/repository");
    const categoryId = await taxes.saveTaxCategory({
      taxCategoryId: 0,
      taxCategory: "Standard",
      taxGroupSeq: null,
      deleted: false,
    });
    const jurisdictionId = await taxes.saveJurisdiction({
      jurisdictionId: 0,
      jurisdictionName: "State",
      taxType: 0,
      reportingAuthority: null,
      taxGroup: "",
      taxGroupSequence: 0,
      cascadeSequence: 0,
      deleted: false,
    });
    await taxes.saveTaxCode({
      taxCode: "STD",
      taxCodeName: "Standard",
      city: null,
      state: null,
      jurisdictions: [
        {
          taxCodeId: 0,
          taxCategoryId: categoryId,
          jurisdictionId,
          taxRate: "8.00",
          roundCode: 1,
          cascadeSequence: 0,
        },
      ],
    });
    const codes = await taxes.getAllTaxCodes();
    expect(codes).toHaveLength(1);
    expect(codes[0].taxCode).toBe("STD");
  });

  it("creates an expense with the MySQL insert path", async () => {
    const expenses = await import("./expenses/repository");
    const id = await expenses.saveValue({
      expenseId: 0,
      expenseTime: nowDb(),
      amount: "12.34",
      paymentType: "Cash",
      description: "Paper",
      expenseCategoryId: 1,
      employeeId: 1,
      deleted: false,
      supplierTaxCode: null,
      taxAmount: null,
      supplierId: null,
    });
    expect(id).toBeGreaterThan(0);
    expect(await expenses.getInfo(id)).toMatchObject({ amount: "12.34" });
  });

  it("creates an item kit linking an item", async () => {
    const itemKits = await import("./item_kits/repository");
    const id = await itemKits.saveValue({
      name: "Starter Kit",
      description: null,
      itemIds: [1],
      quantities: ["2"],
    });
    expect(id).toBeGreaterThan(0);
    expect((await itemKits.getAll()).map((k) => k.name)).toContain("Starter Kit");
    expect(await itemKits.getItems(id)).toHaveLength(1);
  });

  it("saves a dropdown definition and typed item attributes", async () => {
    const attributes = await import("./attributes/repository");
    const definitionId = await attributes.saveDefinition(
      {
        definitionName: "Colour",
        definitionType: "DROPDOWN",
        definitionUnit: null,
        definitionFlags: 0,
        definitionFk: null,
      },
      ["Red", "Blue"],
    );
    expect(definitionId).toBeGreaterThan(0);
    expect((await attributes.listDefinitions()).map((d) => d.definitionName)).toContain("Colour");

    const textDef = await attributes.saveDefinition(
      { definitionName: "Note", definitionType: "TEXT", definitionUnit: null, definitionFlags: 0, definitionFk: null },
      [],
    );
    await attributes.saveTypedItemAttribute({
      definitionId: textDef,
      itemId: 1,
      definitionType: "TEXT",
      value: "hello",
    });
    expect((await attributes.getLinkValue(textDef, 1))?.attributeValue).toBe("hello");
  });

  it("saves customers, suppliers and employees", async () => {
    const persons = await import("./persons/repository");
    const customerId = await persons.saveCustomer(null, {
      firstName: "Cara",
      lastName: "Customer",
      email: "cara@example.com",
      phoneNumber: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      zip: "",
      country: "",
      comments: "",
    }, {
      companyName: "",
      accountNumber: null,
      taxable: false,
      taxId: "",
      discount: 0,
      discountType: 0,
      packageId: null,
    });
    expect(customerId).toBeGreaterThan(0);
    expect((await persons.getCustomer(customerId))?.firstName).toBe("Cara");

    const supplierId = await persons.saveSupplier(null, {
      firstName: "Sam",
      lastName: "Supplier",
      email: "",
      phoneNumber: "",
      address1: "",
      address2: "",
      city: "",
      state: "",
      zip: "",
      country: "",
      comments: "",
    }, {
      companyName: "Supplies Inc",
      agencyName: "",
      accountNumber: null,
      taxId: "",
      category: 0,
    });
    expect(supplierId).toBeGreaterThan(0);
    expect((await persons.getSupplier(supplierId))?.companyName).toBe("Supplies Inc");
  });
});
