process.env.DATABASE_URL = ":memory:";

import { describe, it, expect, beforeAll } from "vitest";
import { getDbSync } from "@/lib/db";
import { items, itemQuantities, stockLocations, people, employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { changeCostPrice } from "./repository";

describe("changeCostPrice", () => {
  let itemId: number;
  let locationId: number;

  beforeAll(() => {
    const db = getDbSync();

    const person = db.insert(people).values({ firstName: "Test" }).returning().get();
    db.insert(employees).values({ personId: person.personId, username: "test", password: "x", hashVersion: 2 }).run();

    const loc = db.insert(stockLocations).values({ locationName: "Stock", deleted: false }).returning().get();
    locationId = loc.locationId;

    const item = db.insert(items).values({
      name: "Widget",
      costPrice: 10,
      unitPrice: 20,
      deleted: false,
    }).returning().get();
    itemId = item.itemId;

    db.insert(itemQuantities).values({ itemId, locationId, quantity: 10 }).run();
  });

  it("computes weighted-average cost before quantity is updated", () => {
    changeCostPrice(itemId, 10, 20, 10, 1);
    const db = getDbSync();
    const row = db.select().from(items).where(eq(items.itemId, itemId)).get();
    // (10 old @ 10 + 10 new @ 20) / 20 = 15
    expect(row?.costPrice).toBe(15);
  });

  it("rounds to 4 decimal places", () => {
    const db = getDbSync();
    db.update(items).set({ costPrice: 10 }).where(eq(items.itemId, itemId)).run();
    db.update(itemQuantities).set({ quantity: 3 }).where(eq(itemQuantities.itemId, itemId)).run();

    changeCostPrice(itemId, 7, 11.1111, 10, 1);
    const row = db.select().from(items).where(eq(items.itemId, itemId)).get();
    // (3*10 + 7*11.1111) / 10 = 10.77777 -> rounded 10.7778
    expect(row?.costPrice).toBe(10.7778);
  });
});
