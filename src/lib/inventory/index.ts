import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { inventory, itemQuantities } from "@/db/schema";
import { bcMul, dec, toDbDecimal, type DecimalInput } from "@/lib/money";
import { nowDb } from "@/lib/datetime";
import { timezone } from "@/lib/config";

interface InventoryDelta {
  transItems: number;
  transUser: number;
  transLocation: number;
  transInventory: DecimalInput;
  transComment?: string;
}

/**
 * Port of `Inventory::update()`: rewrites the comment (and delta) on the
 * matching rows. Prefer `recordDelta()` for normal stock movement; inventory
 * is an append-only ledger.
 */
export async function update(
  comment: string,
  inventoryData: InventoryDelta[] | InventoryDelta,
): Promise<void> {
  const db = await getDb();
  const arr = Array.isArray(inventoryData) ? inventoryData : [inventoryData];
  for (const inv of arr) {
    await db
      .update(inventory)
      .set({
        transComment: comment,
        transInventory: toDbDecimal(inv.transInventory, 3),
      })
      .where(
        and(
          eq(inventory.transItems, inv.transItems),
          eq(inventory.transLocation, inv.transLocation),
          eq(inventory.transComment, inv.transComment ?? comment),
        ),
      );
  }
}

export async function getInventoryDataForItem(itemId: number, locationId?: number) {
  const db = await getDb();
  const conditions = [eq(inventory.transItems, itemId)];
  if (locationId) conditions.push(eq(inventory.transLocation, locationId));
  return db
    .select()
    .from(inventory)
    .where(and(...conditions))
    .orderBy(sql`${inventory.transDate} DESC`);
}

export async function getInventorySum(
  itemId: number,
): Promise<{ locationId: number; quantity: string }[]> {
  const db = await getDb();
  const rows = await db
    .select({
      locationId: inventory.transLocation,
      quantity: sql<string>`COALESCE(SUM(${inventory.transInventory}), 0)`,
    })
    .from(inventory)
    .where(eq(inventory.transItems, itemId))
    .groupBy(inventory.transLocation);
  return rows.map((r) => ({
    locationId: r.locationId ?? 0,
    quantity: toDbDecimal(r.quantity ?? "0", 3),
  }));
}

export async function resetQuantity(
  itemId: number,
  employeeId: number,
  comment = "Item is deleted",
): Promise<void> {
  await withTransaction(async (tx) => {
    const sumsByLocation = await tx
      .select({
        locationId: itemQuantities.locationId,
        quantity: itemQuantities.quantity,
      })
      .from(itemQuantities)
      .where(eq(itemQuantities.itemId, itemId));
    for (const r of sumsByLocation) {
      if (dec(r.quantity).gt(0)) {
        await tx.insert(inventory).values({
          transItems: itemId,
          transUser: employeeId,
          transLocation: r.locationId,
          transInventory: toDbDecimal(bcMul(r.quantity, "-1"), 3),
          transComment: comment,
        });
      }
    }
    await tx
      .update(itemQuantities)
      .set({ quantity: "0" })
      .where(eq(itemQuantities.itemId, itemId));
  });
}

export async function recordDelta(
  itemId: number,
  locationId: number,
  employeeId: number,
  delta: DecimalInput,
  comment: string,
  transDate?: string,
): Promise<void> {
  const db = await getDb();
  await db.insert(inventory).values({
    transItems: itemId,
    transUser: employeeId,
    transLocation: locationId,
    transInventory: toDbDecimal(delta, 3),
    transComment: comment,
    transDate: transDate ?? nowDb(timezone()),
  });
}
