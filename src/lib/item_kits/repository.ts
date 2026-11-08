import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { itemKits, itemKitItems } from "@/db/schema";
import { toDbDecimal, type DecimalInput } from "@/lib/money";

export interface ItemKitRow {
  itemKitId: number;
  itemKitNumber: string | null;
  name: string;
  description: string | null;
  itemId: number | null;
  kitDiscount: string;
  kitDiscountType: number;
  priceOption: number;
  printOption: number;
  itemCount: number;
  itemIds?: number[];
}

export interface ItemKitItemRow {
  itemKitId: number;
  itemId: number;
  quantity: string;
  kitSequence: number;
}

export async function getAll(limit = 25, offset = 0): Promise<ItemKitRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(itemKits)
    .orderBy(asc(itemKits.name))
    .limit(limit)
    .offset(offset);
  const result: ItemKitRow[] = [];
  for (const r of rows) {
    const countRows = await db
      .select({ c: sql<number>`count(*)` })
      .from(itemKitItems)
      .where(eq(itemKitItems.itemKitId, r.itemKitId));
    const itemIds = await db
      .select({ iid: itemKitItems.itemId })
      .from(itemKitItems)
      .where(eq(itemKitItems.itemKitId, r.itemKitId));
    result.push({
      ...r,
      itemCount: Number(countRows[0]?.c ?? 0),
      itemIds: itemIds.map((x) => x.iid),
    });
  }
  return result;
}

export async function getInfo(itemKitId: number): Promise<ItemKitRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(itemKits)
    .where(eq(itemKits.itemKitId, itemKitId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const kitItems = await db
    .select()
    .from(itemKitItems)
    .where(eq(itemKitItems.itemKitId, itemKitId));
  return {
    ...row,
    itemCount: kitItems.length,
    itemIds: kitItems.map((ki) => ki.itemId),
  };
}

export async function getItems(itemKitId: number): Promise<ItemKitItemRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(itemKitItems)
    .where(eq(itemKitItems.itemKitId, itemKitId))
    .orderBy(asc(itemKitItems.kitSequence));
}

export function getEmptyRow(): ItemKitRow {
  return {
    itemKitId: 0,
    itemKitNumber: null,
    name: "",
    description: null,
    itemId: null,
    kitDiscount: "0",
    kitDiscountType: 0,
    priceOption: 0,
    printOption: 0,
    itemCount: 0,
    itemIds: [],
  };
}

export async function saveValue(input: {
  itemKitId?: number;
  name: string;
  description: string | null;
  itemKitNumber?: string;
  kitDiscount?: DecimalInput;
  kitDiscountType?: number;
  priceOption?: number;
  printOption?: number;
  itemIds: number[];
  quantities?: DecimalInput[];
}): Promise<number> {
  return withTransaction(async (tx) => {
    const values = {
      name: input.name,
      description: input.description ?? "",
      itemKitNumber: input.itemKitNumber ?? null,
      kitDiscount: toDbDecimal(input.kitDiscount ?? 0, 2),
      kitDiscountType: input.kitDiscountType ?? 0,
      priceOption: input.priceOption ?? 0,
      printOption: input.printOption ?? 0,
    };
    let kid = input.itemKitId;
    if (kid) {
      await tx.update(itemKits).set(values).where(eq(itemKits.itemKitId, kid));
      await tx.delete(itemKitItems).where(eq(itemKitItems.itemKitId, kid));
    } else {
      const inserted = await tx
        .insert(itemKits)
        .values(values)
        .returning({ id: itemKits.itemKitId });
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      kid = result.id;
    }
    for (const [idx, iid] of input.itemIds.entries()) {
      await tx.insert(itemKitItems).values({
        itemKitId: kid!,
        itemId: iid,
        quantity: toDbDecimal(input.quantities?.[idx] ?? 1, 3),
        kitSequence: idx + 1,
      });
    }
    return kid;
  });
}

export async function deleteItemKit(itemKitId: number): Promise<void> {
  const db = await getDb();
  await db.delete(itemKits).where(eq(itemKits.itemKitId, itemKitId));
}

export async function search(term: string, limit = 25): Promise<ItemKitRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(itemKits)
    .where(sql`${itemKits.name} LIKE ${`%${term}%`}`)
    .orderBy(asc(itemKits.name))
    .limit(limit);
  return rows.map((r) => ({ ...r, itemCount: 0, itemIds: [] }));
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ c: sql<number>`count(*)` }).from(itemKits);
  return Number(rows[0]?.c ?? 0);
}

export async function deleteList(ids: number[]): Promise<void> {
  const db = await getDb();
  for (const id of ids) {
    await db.delete(itemKits).where(eq(itemKits.itemKitId, id));
  }
}
