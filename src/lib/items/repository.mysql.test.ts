import { beforeEach, describe, expect, it } from "vitest";
import { execMysql, truncateMysqlTables } from "@/test/mysql-db";
import { changeCostPrice, getItemById, saveItem, searchItems } from "./repository";

async function seedEmployee(): Promise<void> {
  await execMysql(
    `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
     VALUES (1, 'Test', 'User', '', '', '', '', '', '', '', '', '')`,
  );
  await execMysql(
    "INSERT INTO ospos_employees (person_id, username, password, hash_version) VALUES (1, 'test', 'x', 2)",
  );
  await execMysql(
    "INSERT INTO ospos_stock_locations (location_id, location_name, deleted, is_default, sort_order) VALUES (1, 'stock', 0, 1, 0)",
  );
}

const baseItem = {
  name: "Widget",
  category: "tools",
  supplierId: null,
  itemNumber: null,
  description: "A widget",
  costPrice: "10.00",
  unitPrice: "20.00",
  reorderLevel: "1",
  receivingQuantity: "0",
  allowAltDescription: false,
  isSerialized: false,
  stockType: 0,
  itemType: 0,
  taxCategoryId: null,
  qtyPerPack: "1",
  packName: null,
  hsnCode: "",
  employeeId: 1,
};

beforeEach(async () => {
  await truncateMysqlTables();
  await seedEmployee();
});

describe("Item repository on MySQL", () => {
  it("creates an item and returns its generated id", async () => {
    const itemId = await saveItem({ ...baseItem, quantities: [{ locationId: 1, quantity: "5" }] });
    expect(itemId).toBeGreaterThan(0);
    const row = await getItemById(itemId);
    expect(row?.name).toBe("Widget");
    expect(row?.lowSellItemId).toBe(itemId);
  });

  it("search finds the item by name and number", async () => {
    const itemId = await saveItem({ ...baseItem, itemNumber: "SKU-1" });
    const byName = await searchItems({ searchText: "Widget" }, 10, 0);
    expect(byName.rows.map((r) => Number(r.itemId))).toContain(itemId);
    const byNumber = await searchItems({ searchText: "SKU-1" }, 10, 0);
    expect(byNumber.rows.map((r) => Number(r.itemId))).toContain(itemId);
  });

  it("computes weighted-average cost before the quantity update", async () => {
    const itemId = await saveItem({ ...baseItem, quantities: [{ locationId: 1, quantity: "10" }] });
    await changeCostPrice(itemId, "10", "20");
    expect((await getItemById(itemId))?.costPrice).toBe("15.00");
  });
});
