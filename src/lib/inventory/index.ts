import { and, eq, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { inventory, itemQuantities, employees } from "@/db/schema";
import { SALE_STATUS, STOCK_TYPE } from "@/lib/constants";

export function update(comment: string, inventoryData: Array<{ transItems: number; transUser: number; transLocation: number; transInventory: number; transComment?: string }> | { transItems: number; transUser: number; transLocation: number; transInventory: number; transComment?: string }): void {
  const db = getDbSync();
  const arr = Array.isArray(inventoryData) ? inventoryData : [inventoryData];
  for (const inv of arr) {
    db.update(inventory)
      .set({ transComment: comment, transInventory: inv.transInventory })
      .where(and(
        eq(inventory.transItems, inv.transItems),
        eq(inventory.transLocation, inv.transLocation),
        eq(inventory.transComment, inv.transComment ?? comment)
      ))
      .run();
  }
}

export function getInventoryDataForItem(itemId: number, locationId?: number) {
  const db = getDbSync();
  const conditions = [eq(inventory.transItems, itemId)];
  if (locationId) conditions.push(eq(inventory.transLocation, locationId));
  return db.select().from(inventory).where(and(...conditions)).orderBy(sql`${inventory.transDate} DESC`).all();
}

export function getInventorySum(itemId: number): { locationId: number; quantity: number }[] {
  const db = getDbSync();
  const rows = db
    .select({
      locationId: inventory.transLocation,
      quantity: sql<number>`COALESCE(SUM(${inventory.transInventory}), 0)`,
    })
    .from(inventory)
    .where(eq(inventory.transItems, itemId))
    .groupBy(inventory.transLocation)
    .all();
  return rows.map((r) => ({ locationId: r.locationId ?? 0, quantity: r.quantity }));
}

export function resetQuantity(itemId: number, employeeId: number, comment = "Item is deleted"): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const sumByLoc = tx
      .select({
        locationId: itemQuantities.locationId,
        quantity: itemQuantities.quantity,
      })
      .from(itemQuantities)
      .where(eq(itemQuantities.itemId, itemId))
      .all();
    for (const r of sumByLoc) {
      if (r.quantity > 0) {
        tx.insert(inventory).values({
          transItems: itemId,
          transUser: employeeId,
          transLocation: r.locationId,
          transInventory: -r.quantity,
          transComment: comment,
        }).run();
      }
    }
    tx.update(itemQuantities).set({ quantity: 0 }).where(eq(itemQuantities.itemId, itemId)).run();
  });
}

export function recordDelta(itemId: number, locationId: number, employeeId: number, delta: number, comment: string, transDate?: number): void {
  const db = getDbSync();
  db.insert(inventory).values({
    transItems: itemId,
    transUser: employeeId,
    transLocation: locationId,
    transInventory: delta,
    transComment: comment,
    transDate: transDate ?? Math.floor(Date.now() / 1000),
  }).run();
}

void employees;
void STOCK_TYPE;
void SALE_STATUS;
