import { eq, asc, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { itemKits, itemKitItems } from "@/db/schema";

export interface ItemKitRow {
  itemKitId: number;
  itemKitNumber: string | null;
  name: string;
  description: string | null;
  itemId: number | null;
  kitDiscount: number;
  kitDiscountType: number;
  priceOption: number;
  printOption: number;
  itemCount: number;
  itemIds?: number[];
}

export interface ItemKitItemRow {
  itemKitId: number;
  itemId: number;
  quantity: number;
  kitSequence: number;
}

export function getAll(limit = 25, offset = 0): ItemKitRow[] {
  const db = getDbSync();
  const rows = db.select().from(itemKits)
    .orderBy(asc(itemKits.name))
    .limit(limit).offset(offset).all() as any[];
  return rows.map((r) => ({
    ...r,
    itemCount: db.select({ c: sql<number>`count(*)` }).from(itemKitItems)
      .where(eq(itemKitItems.itemKitId, r.itemKitId)).get()?.c ?? 0,
    itemIds: db.select({ iid: itemKitItems.itemId }).from(itemKitItems)
      .where(eq(itemKitItems.itemKitId, r.itemKitId)).all().map((x) => x.iid),
  }));
}

export function getInfo(itemKitId: number): ItemKitRow | null {
  const db = getDbSync();
  const r = db.select().from(itemKits).where(eq(itemKits.itemKitId, itemKitId)).get() as any;
  if (!r) return null;
  const kitItems = db.select().from(itemKitItems).where(eq(itemKitItems.itemKitId, itemKitId)).all();
  return { ...r, itemCount: kitItems.length, itemIds: kitItems.map((ki) => ki.itemId) };
}

export function getItems(itemKitId: number): ItemKitItemRow[] {
  return getDbSync().select().from(itemKitItems)
    .where(eq(itemKitItems.itemKitId, itemKitId))
    .orderBy(asc(itemKitItems.kitSequence))
    .all() as ItemKitItemRow[];
}

export function getEmptyRow(): ItemKitRow {
  return { itemKitId: 0, itemKitNumber: null, name: "", description: null, itemId: null, kitDiscount: 0, kitDiscountType: 0, priceOption: 0, printOption: 0, itemCount: 0, itemIds: [] };
}

export function saveValue(input: { itemKitId?: number; name: string; description: string | null; itemKitNumber?: string; kitDiscount?: number; kitDiscountType?: number; priceOption?: number; printOption?: number; itemIds: number[]; quantities?: number[] }): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    let kid = input.itemKitId;
    if (kid) {
      tx.update(itemKits).set({
        name: input.name, description: input.description, itemKitNumber: input.itemKitNumber ?? null,
        kitDiscount: input.kitDiscount ?? 0, kitDiscountType: input.kitDiscountType ?? 0,
        priceOption: input.priceOption ?? 0, printOption: input.printOption ?? 0,
      }).where(eq(itemKits.itemKitId, kid)).run();
      tx.delete(itemKitItems).where(eq(itemKitItems.itemKitId, kid)).run();
    } else {
      kid = tx.insert(itemKits).values({
        name: input.name, description: input.description, itemKitNumber: input.itemKitNumber ?? null,
        kitDiscount: input.kitDiscount ?? 0, kitDiscountType: input.kitDiscountType ?? 0,
        priceOption: input.priceOption ?? 0, printOption: input.printOption ?? 0,
      }).returning({ id: itemKits.itemKitId }).get().id;
    }
    input.itemIds.forEach((iid, idx) => {
      tx.insert(itemKitItems).values({ itemKitId: kid!, itemId: iid, quantity: input.quantities?.[idx] ?? 1, kitSequence: idx + 1 }).run();
    });
    return kid!;
  });
}

export function deleteItemKit(itemKitId: number): void {
  getDbSync().delete(itemKits).where(eq(itemKits.itemKitId, itemKitId)).run();
}

export function search(term: string, limit = 25): ItemKitRow[] {
  return getDbSync().select().from(itemKits)
    .where(sql`${itemKits.name} LIKE ${`%${term}%`}`)
    .orderBy(asc(itemKits.name)).limit(limit).all() as any;
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` }).from(itemKits).get();
  return r?.c ?? 0;
}

export function deleteList(ids: number[]): void {
  const db = getDbSync();
  for (const id of ids) db.delete(itemKits).where(eq(itemKits.itemKitId, id)).run();
}
