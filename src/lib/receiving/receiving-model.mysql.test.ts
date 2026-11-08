import { beforeEach, describe, expect, it } from "vitest";
import { execMysql, queryMysql, truncateMysqlTables } from "@/test/mysql-db";
import { invalidateConfigCache, loadConfig } from "@/lib/config";
import { getItemById } from "@/lib/items/repository";
import { cancelReceiving, completeReceiving } from "./receiving-model";
import type { ReceivingCart } from "./receiving-store";

async function seed(): Promise<void> {
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
    "INSERT INTO ospos_app_config (`key`, value) VALUES ('receiving_calculate_average_price', '1'), ('receivings_invoice_format', 'RECV {ISEQ:4}'), ('last_used_invoice_number', '0')",
  );
  invalidateConfigCache();
  await loadConfig(true);
}

function cart(overrides: Partial<ReceivingCart> = {}): ReceivingCart {
  return {
    cart: [
      {
        line: 1,
        itemId: 1,
        itemLocation: 1,
        itemNumber: null,
        stockName: "stock",
        name: "Widget",
        description: "Widget",
        serialnumber: "",
        attributeValues: "",
        attributeDtvalues: "",
        allowAltDescription: false,
        isSerialized: false,
        quantity: "2",
        discount: "0",
        discountType: 0,
        inStock: "10",
        price: "10",
        receivingQuantity: "1",
        receivingQuantityChoices: {},
        total: "20",
        stockType: 0,
      },
    ],
    supplierId: -1,
    employeeId: 1,
    mode: "receive",
    comment: "",
    reference: "",
    stockSource: null,
    stockDestination: null,
    printAfterSale: false,
    ...overrides,
  };
}

beforeEach(async () => {
  await truncateMysqlTables();
  await seed();
});

describe("Receiving model on MySQL", () => {
  it("receives stock, averages cost before quantity update and appends inventory", async () => {
    const result = await completeReceiving({
      cart: cart(),
      employeeId: 1,
      paymentType: "Cash",
    });
    expect(result.receivingId).toBeGreaterThan(0);

    const quantity = await queryMysql<{ quantity: string }>(
      "SELECT quantity FROM ospos_item_quantities WHERE item_id = 1 AND location_id = 1",
    );
    expect(Number(quantity[0].quantity)).toBe(12);

    // (10*5 + 2*10) / 12 = 5.8333 -> 5.83
    expect((await getItemById(1))?.costPrice).toBe("5.83");

    const inventory = await queryMysql<{ trans_inventory: string }>(
      "SELECT trans_inventory FROM ospos_inventory WHERE trans_items = 1",
    );
    expect(inventory).toHaveLength(1);
    expect(Number(inventory[0].trans_inventory)).toBe(2);
  });

  it("reverses stock when a receiving is deleted", async () => {
    const result = await completeReceiving({
      cart: cart(),
      employeeId: 1,
      paymentType: "Cash",
    });
    await cancelReceiving(result.receivingId, 1, true);
    const quantity = await queryMysql<{ quantity: string }>(
      "SELECT quantity FROM ospos_item_quantities WHERE item_id = 1 AND location_id = 1",
    );
    expect(Number(quantity[0].quantity)).toBe(10);
  });
});
