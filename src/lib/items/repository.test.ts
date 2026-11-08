import { describe, expect, it, beforeEach } from "vitest";
import { getRawSqlite } from "@/lib/db/sqlite";
import { resetTestDatabase } from "@/test/db";
import { changeCostPrice, getItemById } from "./repository";

function sql(sqlText: string): void {
  getRawSqlite().exec(sqlText);
}

async function seedItem(costPrice: string): Promise<void> {
  sql(
    `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
     VALUES (1, 'Test', 'User', '', '', '', '', '', '', '', '', '')`,
  );
  sql(
    `INSERT INTO ospos_employees (person_id, username, password, hash_version) VALUES (1, 'test', 'x', 2)`,
  );
  sql(
    `INSERT INTO ospos_stock_locations (location_id, location_name, deleted, is_default, sort_order) VALUES (1, 'stock', 0, 1, 0)`,
  );
  sql(
    `INSERT INTO ospos_items (item_id, name, category, description, cost_price, unit_price, allow_alt_description, is_serialized)
     VALUES (1, 'Widget', 'cat', '', ${costPrice}, '20', 0, 0)`,
  );
}

beforeEach(() => {
  resetTestDatabase();
});

describe("Item::change_cost_price", () => {
  it("computes weighted average before quantity update and stores 2dp", async () => {
    await seedItem("10");
    sql(
      `INSERT INTO ospos_item_quantities (item_id, location_id, quantity) VALUES (1, 1, 10)`,
    );
    await changeCostPrice(1, "10", "20");
    const row = await getItemById(1);
    expect(row?.costPrice).toBe("15.00");
  });

  it("truncates the division at bcscale then rounds to the column scale", async () => {
    await seedItem("10");
    sql(
      `INSERT INTO ospos_item_quantities (item_id, location_id, quantity) VALUES (1, 1, 3)`,
    );
    // (3*10 + 7*11.1111)/10 = 10.77777 -> bc 10.7777 -> 2dp 10.78
    await changeCostPrice(1, "7", "11.1111");
    const row = await getItemById(1);
    expect(row?.costPrice).toBe("10.78");
  });

  it("ignores deleted stock locations when summing old quantity", async () => {
    await seedItem("10");
    sql(
      `INSERT INTO ospos_item_quantities (item_id, location_id, quantity) VALUES (1, 1, 3)`,
    );
    sql(
      `INSERT INTO ospos_stock_locations (location_id, location_name, deleted, is_default, sort_order) VALUES (2, 'old', 1, 0, 1)`,
    );
    sql(
      `INSERT INTO ospos_item_quantities (item_id, location_id, quantity) VALUES (1, 2, 100)`,
    );
    await changeCostPrice(1, "7", "20");
    const row = await getItemById(1);
    // (3*10 + 7*20)/10 = 17.00 (the deleted location is excluded)
    expect(row?.costPrice).toBe("17.00");
  });
});
