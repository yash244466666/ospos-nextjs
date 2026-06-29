import { and, desc, eq, like, or, sql, ne, isNull } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes, itemQuantities, inventory, stockLocations, attributeDefinitions, attributeLinks, attributeValues, suppliers, people } from "@/db/schema";
import { ITEM_TYPE, STOCK_TYPE } from "@/lib/constants";

export interface ItemRow {
  itemId: number;
  name: string;
  category: string | null;
  supplierId: number | null;
  itemNumber: string | null;
  description: string | null;
  costPrice: number;
  unitPrice: number;
  reorderLevel: number;
  receivingQuantity: number;
  picFilename: string | null;
  allowAltDescription: boolean;
  isSerialized: boolean;
  stockType: number;
  itemType: number;
  taxCategoryId: number | null;
  qtyPerPack: number;
  packName: string | null;
  lowSellItemId: number | null;
  hsnCode: string | null;
  deleted: boolean;
}

export interface ItemSearchFilters {
  searchText?: string;
  stockLocationId?: number;
  emptyUpc?: boolean;
  lowInventory?: boolean;
  isSerialized?: boolean;
  noDescription?: boolean;
  searchCustom?: boolean;
  isDeleted?: boolean;
  temporary?: boolean;
  limit?: number;
  offset?: number;
}

function isItemId(s: string): boolean {
  return /^\d+$/.test(s) && !s.startsWith("0");
}

export function searchItems(filters: ItemSearchFilters): { rows: ItemRow[]; total: number } {
  const db = getDbSync();
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.searchText) {
    const term = `%${filters.searchText}%`;
    conditions.push(
      or(
        like(items.name, term),
        like(items.itemNumber, term),
        like(items.category, term),
        like(items.description, term),
        isItemId(filters.searchText) ? eq(items.itemId, parseInt(filters.searchText, 10)) : sql`false`
      )!
    );
  }
  if (filters.emptyUpc) conditions.push(isNull(items.itemNumber));
  if (filters.isSerialized) conditions.push(eq(items.isSerialized, true));
  if (filters.noDescription) conditions.push(isNull(items.description));
  if (typeof filters.isDeleted !== "undefined") {
    conditions.push(eq(items.deleted, filters.isDeleted));
  } else {
    conditions.push(eq(items.deleted, false));
  }
  if (filters.temporary) conditions.push(eq(items.itemType, ITEM_TYPE.ITEM_TEMP));

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = db
    .select({
      itemId: items.itemId,
      name: items.name,
      category: items.category,
      supplierId: items.supplierId,
      itemNumber: items.itemNumber,
      description: items.description,
      costPrice: items.costPrice,
      unitPrice: items.unitPrice,
      reorderLevel: items.reorderLevel,
      receivingQuantity: items.receivingQuantity,
      picFilename: items.picFilename,
      allowAltDescription: items.allowAltDescription,
      isSerialized: items.isSerialized,
      stockType: items.stockType,
      itemType: items.itemType,
      taxCategoryId: items.taxCategoryId,
      qtyPerPack: items.qtyPerPack,
      packName: items.packName,
      lowSellItemId: items.lowSellItemId,
      hsnCode: items.hsnCode,
      deleted: items.deleted,
    })
    .from(items)
    .where(where)
    .orderBy(desc(items.itemId))
    .limit(filters.limit ?? 25)
    .offset(filters.offset ?? 0)
    .all();

  let quantityMap: Record<number, number> = {};
  if (filters.stockLocationId && filters.stockLocationId > 0 && rows.length > 0) {
    const ids = rows.map((r) => r.itemId);
    const qrows = db
      .select()
      .from(itemQuantities)
      .where(
        and(
          eq(itemQuantities.locationId, filters.stockLocationId),
          sql`${itemQuantities.itemId} IN (${ids.join(",")})`
        )
      )
      .all();
    quantityMap = Object.fromEntries(qrows.map((q) => [q.itemId, q.quantity]));
  }

  const totalRow = db
    .select({ c: sql<number>`count(*)` })
    .from(items)
    .where(where)
    .get();

  return {
    rows: rows.map((r) => ({
      ...r,
      quantity: quantityMap[r.itemId] ?? 0,
    })) as ItemRow[],
    total: totalRow?.c ?? 0,
  };
}

export function getItemById(itemId: number): ItemRow | null {
  const db = getDbSync();
  const row = db.select().from(items).where(eq(items.itemId, itemId)).get();
  return (row as ItemRow) ?? null;
}

export function getItemByNumber(itemNumber: string): ItemRow | null {
  const db = getDbSync();
  const row = db.select().from(items).where(eq(items.itemNumber, itemNumber)).get();
  return (row as ItemRow) ?? null;
}

export function getItemByIdOrNumber(input: string): ItemRow | null {
  if (isItemId(input)) return getItemById(parseInt(input, 10));
  return getItemByNumber(input);
}

export interface ItemTaxRow { name: string; percent: number; }

export function getItemTaxes(itemId: number): ItemTaxRow[] {
  const db = getDbSync();
  return db.select({ name: itemsTaxes.name, percent: itemsTaxes.percent })
    .from(itemsTaxes)
    .where(eq(itemsTaxes.itemId, itemId))
    .all();
}

export function getStockLocations(): { locationId: number; locationName: string }[] {
  const db = getDbSync();
  return db.select({
    locationId: stockLocations.locationId,
    locationName: stockLocations.locationName,
  })
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false))
    .all();
}

export function getQuantitiesByLocation(itemId: number): Record<number, number> {
  const db = getDbSync();
  const rows = db.select().from(itemQuantities).where(eq(itemQuantities.itemId, itemId)).all();
  return Object.fromEntries(rows.map((r) => [r.locationId, r.quantity]));
}

export function getSuppliers(): { personId: number; companyName: string | null }[] {
  const db = getDbSync();
  return db.select({ personId: suppliers.personId, companyName: suppliers.companyName })
    .from(suppliers)
    .where(eq(suppliers.deleted, false))
    .all();
}

export function getInventoryHistory(itemId: number, locationId?: number, limit = 50) {
  const db = getDbSync();
  const conditions = [eq(inventory.transItems, itemId)];
  if (locationId) conditions.push(eq(inventory.transLocation, locationId));
  return db.select()
    .from(inventory)
    .where(and(...conditions))
    .orderBy(desc(inventory.transDate))
    .limit(limit)
    .all();
}

export interface SaveItemInput {
  itemId?: number;
  name: string;
  category: string | null;
  supplierId: number | null;
  itemNumber: string | null;
  description: string | null;
  costPrice: number;
  unitPrice: number;
  reorderLevel: number;
  receivingQuantity: number;
  allowAltDescription: boolean;
  isSerialized: boolean;
  stockType: number;
  itemType: number;
  taxCategoryId: number | null;
  qtyPerPack: number;
  packName: string | null;
  hsnCode: string | null;
  picFilename?: string | null;
  taxes?: ItemTaxRow[];
  quantities?: { locationId: number; quantity: number }[];
  employeeId: number;
}

export function saveItem(input: SaveItemInput): number {
  const db = getDbSync();
  const isTemp = input.itemType === ITEM_TYPE.ITEM_TEMP;
  const data: typeof items.$inferInsert = {
    name: input.name,
    category: input.category,
    supplierId: input.supplierId,
    itemNumber: input.itemNumber,
    description: input.description,
    costPrice: input.costPrice,
    unitPrice: input.unitPrice,
    reorderLevel: isTemp ? 0 : input.reorderLevel,
    receivingQuantity: input.receivingQuantity,
    allowAltDescription: input.allowAltDescription,
    isSerialized: input.isSerialized,
    stockType: isTemp ? STOCK_TYPE.HAS_NO_STOCK : input.stockType,
    itemType: input.itemType,
    taxCategoryId: input.taxCategoryId,
    qtyPerPack: input.qtyPerPack,
    packName: input.packName,
    hsnCode: input.hsnCode,
    picFilename: input.picFilename,
    deleted: false,
  };

  return db.transaction((tx) => {
    let itemId = input.itemId;
    if (itemId) {
      tx.update(items).set(data).where(eq(items.itemId, itemId)).run();
    } else {
      const inserted = tx.insert(items).values(data).returning({ id: items.itemId }).get();
      itemId = inserted.id;
      tx.update(items).set({ lowSellItemId: itemId }).where(eq(items.itemId, itemId)).run();
    }

    if (input.taxes) {
      tx.delete(itemsTaxes).where(eq(itemsTaxes.itemId, itemId)).run();
      for (const t of input.taxes.slice(0, 2)) {
        if (t.name && t.percent) {
          tx.insert(itemsTaxes).values({
            itemId,
            name: t.name,
            percent: t.percent,
          }).run();
        }
      }
    }

    if (input.quantities) {
      for (const q of input.quantities) {
        const existing = tx.select()
          .from(itemQuantities)
          .where(and(
            eq(itemQuantities.itemId, itemId!),
            eq(itemQuantities.locationId, q.locationId)
          ))
          .get();
        const oldQty = existing?.quantity ?? 0;
        if (existing) {
          tx.update(itemQuantities)
            .set({ quantity: q.quantity })
            .where(and(
              eq(itemQuantities.itemId, itemId!),
              eq(itemQuantities.locationId, q.locationId)
            ))
            .run();
        } else {
          tx.insert(itemQuantities).values({
            itemId: itemId!,
            locationId: q.locationId,
            quantity: q.quantity,
          }).run();
        }
        const delta = q.quantity - oldQty;
        if (delta !== 0) {
          tx.insert(inventory).values({
            transItems: itemId!,
            transUser: input.employeeId,
            transLocation: q.locationId,
            transInventory: delta,
            transComment: "Manually editing of quantity",
          }).run();
        }
      }
    }

    return itemId!;
  });
}

export function deleteItem(itemId: number, employeeId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    tx.update(items).set({ deleted: true }).where(eq(items.itemId, itemId)).run();
    const qrows = tx.select().from(itemQuantities).where(eq(itemQuantities.itemId, itemId)).all();
    for (const q of qrows) {
      tx.insert(inventory).values({
        transItems: itemId,
        transUser: employeeId,
        transLocation: q.locationId,
        transInventory: -q.quantity,
        transComment: "Item is deleted",
      }).run();
    }
    tx.update(itemQuantities).set({ quantity: 0 }).where(eq(itemQuantities.itemId, itemId)).run();
  });
}

export function adjustInventory(itemId: number, locationId: number, newQty: number, employeeId: number, comment = "Manually editing of quantity"): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const existing = tx.select().from(itemQuantities)
      .where(and(eq(itemQuantities.itemId, itemId), eq(itemQuantities.locationId, locationId)))
      .get();
    const oldQty = existing?.quantity ?? 0;
    const delta = newQty - oldQty;
    if (existing) {
      tx.update(itemQuantities).set({ quantity: newQty })
        .where(and(eq(itemQuantities.itemId, itemId), eq(itemQuantities.locationId, locationId)))
        .run();
    } else {
      tx.insert(itemQuantities).values({ itemId, locationId, quantity: newQty }).run();
    }
    if (delta !== 0) {
      tx.insert(inventory).values({
        transItems: itemId,
        transUser: employeeId,
        transLocation: locationId,
        transInventory: delta,
        transComment: comment,
      }).run();
    }
  });
}

export function itemNumberExists(itemNumber: string, excludeItemId?: number): boolean {
  if (!itemNumber) return false;
  const db = getDbSync();
  const row = db.select().from(items).where(eq(items.itemNumber, itemNumber)).get();
  if (!row) return false;
  if (excludeItemId && row.itemId === excludeItemId) return false;
  return true;
}

export function suggestItems(term: string, opts: { stockOnly?: boolean; kitsOnly?: boolean; limit?: number } = {}): ItemRow[] {
  const db = getDbSync();
  const like_term = `%${term}%`;
  const conditions = [
    eq(items.deleted, false),
    or(
      like(items.name, like_term),
      like(items.itemNumber, like_term),
      like(items.category, like_term)
    )!,
  ];
  if (opts.stockOnly) conditions.push(eq(items.stockType, STOCK_TYPE.HAS_STOCK));
  if (opts.kitsOnly) conditions.push(eq(items.itemType, ITEM_TYPE.ITEM_KIT));
  return db.select()
    .from(items)
    .where(and(...conditions))
    .limit(opts.limit ?? 10)
    .all() as ItemRow[];
}

export function getCategorySuggestions(term: string): string[] {
  const db = getDbSync();
  const rows = db.select({ c: sql<string>`DISTINCT ${items.category}` })
    .from(items)
    .where(and(
      eq(items.deleted, false),
      like(items.category, `%${term}%`),
      ne(items.category, "")
    ))
    .limit(10)
    .all();
  return rows.map((r) => r.c).filter(Boolean) as string[];
}

export function bulkUpdate(itemIds: number[], fields: Partial<ItemRow>, employeeId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    for (const id of itemIds) {
      tx.update(items).set(fields).where(eq(items.itemId, id)).run();
    }
  });
  void employeeId;
}

export { attributeDefinitions, attributeLinks, attributeValues };
void people;