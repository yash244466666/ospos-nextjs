import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  like,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { insertReturning } from "@/lib/db/insert";
import { withTransaction } from "@/lib/db/transaction";
import {
  attributeDefinitions,
  attributeLinks,
  attributeValues,
  inventory,
  itemKitItems,
  itemKits,
  itemQuantities,
  items,
  itemsTaxes,
  people,
  stockLocations,
  suppliers,
  taxCategories,
} from "@/db/schema";
import { ITEM_TYPE, STOCK_TYPE } from "@/lib/constants";
import { getConfigBool, loadConfig } from "@/lib/config";
import {
  bcAdd,
  bcDiv,
  bcMul,
  bcSub,
  dec,
  phpRound,
  toDbDecimal,
  type DecimalInput,
} from "@/lib/money";
import { ROUNDING_MODE } from "@/lib/constants";
import { formatDb } from "@/lib/datetime";
import { dateFormat } from "@/lib/config";

export interface ItemRow {
  itemId: number;
  name: string;
  category: string;
  supplierId: number | null;
  itemNumber: string | null;
  description: string;
  costPrice: string;
  unitPrice: string;
  reorderLevel: string;
  receivingQuantity: string;
  picFilename: string | null;
  allowAltDescription: boolean;
  isSerialized: boolean;
  stockType: number;
  itemType: number;
  taxCategoryId: number | null;
  qtyPerPack: string;
  packName: string | null;
  lowSellItemId: number | null;
  hsnCode: string;
  deleted: boolean;
  quantity?: string;
  companyName?: string | null;
  taxPercents?: string;
  taxCategory?: string | null;
  attributeValues?: string;
  attributeDtvalues?: string;
  attributeDvalues?: string;
  attributeMap?: Record<number, string | null>;
}

export interface ItemSearchFilters {
  searchText?: string;
  stockLocationId?: number;
  selectedLocationId?: number;
  emptyUpc?: boolean;
  lowInventory?: boolean;
  isSerialized?: boolean;
  noDescription?: boolean;
  searchCustom?: boolean;
  isDeleted?: boolean;
  temporary?: boolean;
  startDate?: string;
  endDate?: string;
}

const isItemId = (value: string): boolean => /^\d+$/.test(value) && !value.startsWith("0");

function rowToItem(row: typeof items.$inferSelect, extra: Partial<ItemRow> = {}): ItemRow {
  return {
    ...row,
    costPrice: toDbDecimal(row.costPrice, 2),
    unitPrice: toDbDecimal(row.unitPrice, 2),
    reorderLevel: toDbDecimal(row.reorderLevel, 3),
    receivingQuantity: toDbDecimal(row.receivingQuantity, 3),
    qtyPerPack: toDbDecimal(row.qtyPerPack, 3),
    ...extra,
  };
}

export async function getItemById(itemId: number): Promise<ItemRow | null> {
  const db = await getDb();
  const rows = await db.select().from(items).where(eq(items.itemId, itemId)).limit(1);
  return rows[0] ? rowToItem(rows[0]) : null;
}

export async function getItemByNumber(itemNumber: string): Promise<ItemRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(items)
    .where(eq(items.itemNumber, itemNumber))
    .limit(1);
  return rows[0] ? rowToItem(rows[0]) : null;
}

/** `Item::get_info_by_id_or_number` — item_number first, then numeric id (no leading zero). */
export async function getInfoByIdOrNumber(
  input: string,
  includeDeleted = true,
): Promise<ItemRow | null> {
  const db = await getDb();
  const condition = isItemId(input)
    ? or(eq(items.itemNumber, input), eq(items.itemId, Number(input)))
    : eq(items.itemNumber, input);
  const where = includeDeleted ? condition : and(condition, eq(items.deleted, false));
  const rows = await db.select().from(items).where(where).limit(1);
  return rows[0] ? rowToItem(rows[0]) : null;
}

export async function getItemIdByNumber(
  itemNumber: string,
  ignoreDeleted = false,
  deleted = false,
): Promise<number | null> {
  const db = await getDb();
  const condition = or(eq(items.itemNumber, itemNumber), eq(items.itemId, Number(itemNumber)));
  const where = ignoreDeleted ? condition : and(condition, eq(items.deleted, deleted));
  const rows = await db.select({ itemId: items.itemId }).from(items).where(where).limit(1);
  return rows[0]?.itemId ?? null;
}

export async function itemNumberExists(
  itemNumber: string,
  excludeItemId?: number,
): Promise<boolean> {
  if (!itemNumber) return false;
  if (getConfigBool("allow_duplicate_barcodes", false)) return false;
  const db = await getDb();
  const rows = await db
    .select({ itemId: items.itemId })
    .from(items)
    .where(eq(items.itemNumber, itemNumber));
  return rows.some((row) => row.itemId !== excludeItemId);
}

export async function getItemTaxes(
  itemId: number,
): Promise<{ name: string; percent: string }[]> {
  const db = await getDb();
  return db
    .select({ name: itemsTaxes.name, percent: itemsTaxes.percent })
    .from(itemsTaxes)
    .where(eq(itemsTaxes.itemId, itemId));
}

export async function getQuantitiesByLocation(
  itemId: number,
): Promise<Record<number, string>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(itemQuantities)
    .where(eq(itemQuantities.itemId, itemId));
  return Object.fromEntries(rows.map((row) => [row.locationId, row.quantity]));
}

export const getItemQuantities = getQuantitiesByLocation;

export async function getStockLocations(): Promise<
  { locationId: number; locationName: string }[]
> {
  const db = await getDb();
  const rows = await db
    .select({
      locationId: stockLocations.locationId,
      locationName: stockLocations.locationName,
    })
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false))
    .orderBy(asc(stockLocations.sortOrder));
  return rows.map((row) => ({
    locationId: row.locationId,
    locationName: row.locationName ?? "",
  }));
}

export async function getStockLocationName(locationId: number): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select({ name: stockLocations.locationName })
    .from(stockLocations)
    .where(eq(stockLocations.locationId, locationId))
    .limit(1);
  return rows[0]?.name ?? "";
}

export async function getSuppliers(): Promise<
  { personId: number; companyName: string }[]
> {
  const db = await getDb();
  return db
    .select({ personId: suppliers.personId, companyName: suppliers.companyName })
    .from(suppliers)
    .where(eq(suppliers.deleted, false));
}

export async function getInventoryHistory(
  itemId: number,
  locationId?: number,
  limit = 50,
) {
  const db = await getDb();
  const conditions = [eq(inventory.transItems, itemId)];
  if (locationId) conditions.push(eq(inventory.transLocation, locationId));
  return db
    .select()
    .from(inventory)
    .where(and(...conditions))
    .orderBy(desc(inventory.transDate))
    .limit(limit);
}

function attributeSearchClause(search: string) {
  const pattern = /([A-Za-z][A-Za-z0-9 _-]*?)\s*:\s*([0-9]+,[0-9]+|[^\s,]+)(?:\s*,\s*|\s+(?:AND|OR)\s+)?/gu;
  const clauses = [];
  for (const match of search.matchAll(pattern)) {
    const name = match[1].trim().toLowerCase();
    const value = match[2].trim();
    clauses.push(sql`${items.itemId} IN (
      SELECT al.item_id FROM ospos_attribute_links al
      JOIN ospos_attribute_values av ON av.attribute_id = al.attribute_id
      JOIN ospos_attribute_definitions ad ON ad.definition_id = al.definition_id
      WHERE al.item_id IS NOT NULL AND al.sale_id IS NULL AND al.receiving_id IS NULL
        AND ad.deleted = 0 AND LOWER(ad.definition_name) = ${name}
        AND (
          av.attribute_value = ${value}
          OR CAST(av.attribute_decimal AS TEXT) = ${value}
          OR av.attribute_date = ${value}
        )
    )`);
  }
  return clauses;
}

export async function searchItems(
  filters: ItemSearchFilters,
  rowLimit = 25,
  limitFrom = 0,
  sort = "name",
  order: "asc" | "desc" = "asc",
  countOnly = false,
): Promise<{ rows: ItemRow[]; total: number }> {
  await loadConfig();
  const db = await getDb();
  const conditions = [
    eq(items.deleted, filters.isDeleted ?? false),
  ];

  if (filters.searchText) {
    const term = `%${filters.searchText}%`;
    const clauses = [
      like(items.name, term),
      like(items.itemNumber, term),
      like(items.category, term),
      like(items.description, term),
      like(suppliers.companyName, term),
    ];
    if (isItemId(filters.searchText)) clauses.push(eq(items.itemId, Number(filters.searchText)));
    conditions.push(or(...clauses)!);
    conditions.push(...attributeSearchClause(filters.searchText));
  }
  if (filters.emptyUpc) {
    conditions.push(or(isNull(items.itemNumber), eq(items.itemNumber, ""))!);
  }
  if (filters.isSerialized) conditions.push(eq(items.isSerialized, true));
  if (filters.noDescription) {
    conditions.push(or(isNull(items.description), eq(items.description, ""))!);
  }
  if (filters.temporary) conditions.push(eq(items.itemType, ITEM_TYPE.ITEM_TEMP));

  const locationId = filters.stockLocationId ?? filters.selectedLocationId;
  if (locationId) {
    conditions.push(
      sql`${items.itemId} IN (SELECT item_id FROM ospos_item_quantities WHERE location_id = ${locationId})`,
    );
  }
  if (filters.lowInventory && locationId) {
    conditions.push(
      sql`${items.itemId} IN (
        SELECT iq.item_id FROM ospos_item_quantities iq
        JOIN ospos_items i ON i.item_id = iq.item_id
        WHERE iq.location_id = ${locationId} AND iq.quantity <= i.reorder_level
      )`,
    );
  }
  if (filters.startDate && filters.endDate && locationId) {
    const start = `${decodeURIComponent(filters.startDate)} 00:00:00`;
    const end = `${decodeURIComponent(filters.endDate)} 23:59:59`;
    conditions.push(
      sql`${items.itemId} IN (
        SELECT DISTINCT trans_items FROM ospos_inventory
        WHERE trans_location = ${locationId}
          AND trans_date BETWEEN ${start} AND ${end}
      )`,
    );
  }

  const where = and(...conditions);
  const countRows = await db
    .select({ value: sql<number>`count(DISTINCT ${items.itemId})` })
    .from(items)
    .leftJoin(suppliers, eq(suppliers.personId, items.supplierId))
    .where(where);
  const total = Number(countRows[0]?.value ?? 0);
  if (countOnly) return { rows: [], total };

  const sortColumn = (() => {
    switch (sort) {
      case "item_id": return items.itemId;
      case "item_number": return items.itemNumber;
      case "category": return items.category;
      case "cost_price": return items.costPrice;
      case "unit_price": return items.unitPrice;
      case "reorder_level": return items.reorderLevel;
      case "quantity": return itemQuantities.quantity;
      default: return items.name;
    }
  })();

  const query = db
    .select({
      item: items,
      companyName: suppliers.companyName,
      taxCategory: taxCategories.taxCategory,
      quantity: locationId ? itemQuantities.quantity : sql<string>`NULL`,
    })
    .from(items)
    .leftJoin(suppliers, eq(suppliers.personId, items.supplierId))
    .leftJoin(taxCategories, eq(taxCategories.taxCategoryId, items.taxCategoryId))
    .leftJoin(
      itemQuantities,
      locationId
        ? and(
            eq(itemQuantities.itemId, items.itemId),
            eq(itemQuantities.locationId, locationId),
          )
        : sql`1 = 0`,
    )
    .where(where)
    .orderBy(order === "asc" ? asc(sortColumn) : desc(sortColumn))
    .limit(rowLimit)
    .offset(limitFrom);

  const rows = await query;
  const itemIds = rows.map((row) => row.item.itemId);
  const taxMap = new Map<number, string[]>();
  const attributeMap = new Map<number, { values: string; dates: string; decimals: string }>();
  const attrRowsByItem = new Map<number, { definitionId: number; attributeValue: string | null }[]>();
  if (itemIds.length > 0) {
    const taxRows = await db
      .select()
      .from(itemsTaxes)
      .where(inArray(itemsTaxes.itemId, itemIds));
    for (const tax of taxRows) {
      const list = taxMap.get(tax.itemId) ?? [];
      list.push(`${Number(tax.percent).toFixed(2)}%`);
      taxMap.set(tax.itemId, list);
    }
    const attrRows = await db
      .select({
        itemId: attributeLinks.itemId,
        definitionId: attributeLinks.definitionId,
        attributeValue: attributeValues.attributeValue,
        attributeDate: attributeValues.attributeDate,
        attributeDecimal: attributeValues.attributeDecimal,
        definitionType: attributeDefinitions.definitionType,
      })
      .from(attributeLinks)
      .innerJoin(attributeValues, eq(attributeValues.attributeId, attributeLinks.attributeId))
      .innerJoin(
        attributeDefinitions,
        eq(attributeDefinitions.definitionId, attributeLinks.definitionId),
      )
      .where(
        and(
          inArray(attributeLinks.itemId, itemIds),
          isNull(attributeLinks.saleId),
          isNull(attributeLinks.receivingId),
        ),
      );
    for (const attr of attrRows) {
      if (attr.itemId === null) continue;
      const list = attrRowsByItem.get(attr.itemId) ?? [];
      list.push({ definitionId: attr.definitionId, attributeValue: attr.attributeValue });
      attrRowsByItem.set(attr.itemId, list);
      const entry = attributeMap.get(attr.itemId) ?? { values: "", dates: "", decimals: "" };
      if (attr.attributeValue !== null) {
        entry.values = entry.values ? `${entry.values}|${attr.attributeValue}` : attr.attributeValue;
      }
      if (attr.attributeDate !== null) {
        const formatted = formatDb(attr.attributeDate, dateFormat());
        entry.dates = entry.dates ? `${entry.dates}|${formatted}` : formatted;
      }
      if (attr.attributeDecimal !== null) {
        entry.decimals = entry.decimals ? `${entry.decimals}|${attr.attributeDecimal}` : attr.attributeDecimal;
      }
      attributeMap.set(attr.itemId, entry);
    }
  }

  return {
    total,
    rows: rows.map((row) => rowToItem(row.item, {
      companyName: row.companyName ?? null,
      taxCategory: row.taxCategory ?? null,
      quantity: row.quantity ?? "0",
      taxPercents: (taxMap.get(row.item.itemId) ?? ["-"]).join(", "),
      attributeValues: attributeMap.get(row.item.itemId)?.values ?? "",
      attributeMap: Object.fromEntries(
        (attrRowsByItem.get(row.item.itemId) ?? []).map((attribute) => [
          attribute.definitionId,
          attribute.attributeValue,
        ]),
      ),
      attributeDtvalues: attributeMap.get(row.item.itemId)?.dates ?? "",
      attributeDvalues: attributeMap.get(row.item.itemId)?.decimals ?? "",
    })),
  };
}

export async function getAllItems(
  stockLocationId?: number,
  limit = 100,
  offset = 0,
): Promise<ItemRow[]> {
  return (await searchItems({ stockLocationId }, limit, offset)).rows;
}

export interface SaveItemInput {
  itemId?: number;
  name: string;
  category: string;
  supplierId: number | null;
  itemNumber: string | null;
  description: string;
  costPrice: DecimalInput;
  unitPrice: DecimalInput;
  reorderLevel: DecimalInput;
  receivingQuantity: DecimalInput;
  allowAltDescription: boolean;
  isSerialized: boolean;
  stockType: number;
  itemType: number;
  taxCategoryId: number | null;
  qtyPerPack: DecimalInput;
  packName: string | null;
  hsnCode: string;
  lowSellItemId?: number | null;
  deleted?: boolean;
  picFilename?: string | null;
  taxes?: { name: string; percent: DecimalInput }[];
  quantities?: { locationId: number; quantity: DecimalInput }[];
  employeeId: number;
}

export async function saveItem(input: SaveItemInput): Promise<number> {
  const isTemp = input.itemType === ITEM_TYPE.ITEM_TEMP;
  const values = {
    name: input.name,
    category: input.category,
    supplierId: input.supplierId,
    itemNumber: input.itemNumber,
    description: input.description,
    costPrice: toDbDecimal(input.costPrice, 2),
    unitPrice: toDbDecimal(input.unitPrice, 2),
    reorderLevel: toDbDecimal(isTemp ? 0 : input.reorderLevel, 3),
    receivingQuantity: toDbDecimal(isTemp ? 0 : input.receivingQuantity, 3),
    allowAltDescription: input.allowAltDescription,
    isSerialized: input.isSerialized,
    stockType: isTemp ? STOCK_TYPE.HAS_NO_STOCK : input.stockType,
    itemType: input.itemType,
    taxCategoryId: input.taxCategoryId,
    qtyPerPack: toDbDecimal(input.qtyPerPack, 3),
    packName: input.packName,
    hsnCode: input.hsnCode,
    deleted: input.deleted ?? false,
    lowSellItemId: input.lowSellItemId ?? input.itemId ?? null,
    ...(input.picFilename !== undefined ? { picFilename: input.picFilename } : {}),
  };

  return withTransaction(async (tx) => {
    let itemId = input.itemId;
    if (itemId && itemId > 0) {
      await tx.update(items).set(values).where(eq(items.itemId, itemId));
    } else {
      const inserted = await insertReturning(tx, items, values, items.itemId);
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      itemId = result.id;
      await tx
        .update(items)
        .set({ lowSellItemId: itemId })
        .where(eq(items.itemId, itemId));
    }

    if (input.taxes && !getConfigBool("use_destination_based_tax", false)) {
      await tx.delete(itemsTaxes).where(eq(itemsTaxes.itemId, itemId));
      for (const tax of input.taxes.slice(0, 2)) {
        if (tax.name && !dec(tax.percent).isZero()) {
          await tx.insert(itemsTaxes).values({
            itemId,
            name: tax.name,
            percent: toDbDecimal(tax.percent, 3),
          });
        }
      }
    }

    if (input.quantities) {
      for (const quantity of input.quantities) {
        const existing = await tx
          .select()
          .from(itemQuantities)
          .where(
            and(
              eq(itemQuantities.itemId, itemId),
              eq(itemQuantities.locationId, quantity.locationId),
            ),
          )
          .limit(1);
        const oldQuantity = existing[0]?.quantity ?? "0";
        const newQuantity = toDbDecimal(quantity.quantity, 3);
        if (existing.length === 0) {
          await tx.insert(itemQuantities).values({
            itemId,
            locationId: quantity.locationId,
            quantity: newQuantity,
          });
        } else if (toDbDecimal(oldQuantity, 3) !== newQuantity) {
          await tx
            .update(itemQuantities)
            .set({ quantity: newQuantity })
            .where(
              and(
                eq(itemQuantities.itemId, itemId),
                eq(itemQuantities.locationId, quantity.locationId),
              ),
            );
        }
        if (toDbDecimal(oldQuantity, 3) !== newQuantity) {
          await tx.insert(inventory).values({
            transItems: itemId,
            transUser: input.employeeId,
            transLocation: quantity.locationId,
            transInventory: toDbDecimal(bcSub(newQuantity, oldQuantity), 3),
            transComment: "Manually editing of quantity",
          });
        }
      }
    }
    return itemId;
  });
}

export async function deleteItem(itemId: number, employeeId: number): Promise<void> {
  const db = await getDb();
  const quantities = await db
    .select()
    .from(itemQuantities)
    .where(eq(itemQuantities.itemId, itemId));
  await withTransaction(async (tx) => {
    await tx.update(items).set({ deleted: true }).where(eq(items.itemId, itemId));
    await tx
      .update(itemQuantities)
      .set({ quantity: "0" })
      .where(eq(itemQuantities.itemId, itemId));
    for (const quantity of quantities) {
      if (dec(quantity.quantity).gt(0)) {
        await tx.insert(inventory).values({
          transItems: itemId,
          transUser: employeeId,
          transLocation: quantity.locationId,
          transInventory: toDbDecimal(bcMul(quantity.quantity, "-1"), 3),
          transComment: "Item is deleted",
        });
      }
    }
  });
}

export async function undeleteItem(itemId: number): Promise<void> {
  const db = await getDb();
  await db.update(items).set({ deleted: false }).where(eq(items.itemId, itemId));
}

export async function deleteItemList(itemIds: number[], employeeId: number): Promise<void> {
  for (const id of itemIds) await deleteItem(id, employeeId);
}

export async function adjustInventory(
  itemId: number,
  locationId: number,
  newQuantity: DecimalInput,
  employeeId: number,
  comment = "Manually editing of quantity",
): Promise<void> {
  await withTransaction(async (tx) => {
    const existing = await tx
      .select()
      .from(itemQuantities)
      .where(
        and(eq(itemQuantities.itemId, itemId), eq(itemQuantities.locationId, locationId)),
      )
      .limit(1);
    const oldQuantity = existing[0]?.quantity ?? "0";
    const newValue = toDbDecimal(newQuantity, 3);
    if (existing.length === 0) {
      await tx.insert(itemQuantities).values({ itemId, locationId, quantity: newValue });
    } else {
      await tx
        .update(itemQuantities)
        .set({ quantity: newValue })
        .where(
          and(eq(itemQuantities.itemId, itemId), eq(itemQuantities.locationId, locationId)),
        );
    }
    const delta = bcSub(newValue, oldQuantity);
    if (!dec(delta).isZero()) {
      await tx.insert(inventory).values({
        transItems: itemId,
        transUser: employeeId,
        transLocation: locationId,
        transInventory: toDbDecimal(delta, 3),
        transComment: comment,
      });
    }
  });
}

export async function recordInventoryDelta(
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
    ...(transDate ? { transDate } : {}),
  });
}

/** `Item::change_cost_price` — pre-receipt stock, bcmath truncation, 2-dp column. */
export async function changeCostPrice(
  itemId: number,
  itemsReceived: DecimalInput,
  newPrice: DecimalInput,
  oldPrice?: DecimalInput,
): Promise<void> {
  const item = await getItemById(itemId);
  if (!item) return;
  const previousPrice = oldPrice ?? item.costPrice;
  const db = await getDb();
  const rows = await db
    .select({ quantity: itemQuantities.quantity })
    .from(itemQuantities)
    .innerJoin(stockLocations, eq(stockLocations.locationId, itemQuantities.locationId))
    .where(and(eq(itemQuantities.itemId, itemId), eq(stockLocations.deleted, false)));
  const oldTotalQuantity = rows.reduce(
    (sum, row) => bcAdd(sum, row.quantity),
    dec(0),
  );
  const totalQuantity = bcAdd(oldTotalQuantity, itemsReceived);
  if (dec(totalQuantity).isZero()) {
    await db.update(items).set({ costPrice: toDbDecimal(newPrice, 2) }).where(eq(items.itemId, itemId));
    return;
  }
  const numerator = bcAdd(
    bcMul(itemsReceived, newPrice),
    bcMul(oldTotalQuantity, previousPrice),
  );
  const average = bcDiv(numerator, totalQuantity);
  await db
    .update(items)
    .set({ costPrice: toDbDecimal(phpRound(average, 2, ROUNDING_MODE.HALF_UP), 2) })
    .where(eq(items.itemId, itemId));
}

export async function updateItemNumber(itemId: number, itemNumber: string): Promise<void> {
  const db = await getDb();
  await db
    .update(items)
    .set({ itemNumber: itemNumber || null })
    .where(eq(items.itemId, itemId));
}

export async function updateItemName(itemId: number, name: string): Promise<void> {
  const db = await getDb();
  await db.update(items).set({ name }).where(eq(items.itemId, itemId));
}

export async function updateItemDescription(
  itemId: number,
  description: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(items)
    .set({ description })
    .where(eq(items.itemId, itemId));
}

export async function updateMultiple(
  itemIds: number[],
  fields: Record<string, unknown>,
): Promise<void> {
  if (itemIds.length === 0) return;
  const db = await getDb();
  await db.update(items).set(fields).where(inArray(items.itemId, itemIds));
}

export async function bulkUpdate(
  itemIds: number[],
  fields: Record<string, unknown>,
  employeeId: number,
): Promise<void> {
  void employeeId;
  await updateMultiple(itemIds, fields);
}

export async function getMultipleInfo(
  itemIds: number[],
  locationId?: number | null,
): Promise<ItemRow[]> {
  if (locationId === null || locationId === undefined) return [];
  if (itemIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      item: items,
      quantity: itemQuantities.quantity,
      companyName: suppliers.companyName,
    })
    .from(items)
    .leftJoin(suppliers, eq(suppliers.personId, items.supplierId))
    .innerJoin(
      itemQuantities,
      and(
        eq(itemQuantities.itemId, items.itemId),
        eq(itemQuantities.locationId, locationId),
      ),
    )
    .where(inArray(items.itemId, itemIds))
    .groupBy(items.itemId);
  return rows.map((row) =>
    rowToItem(row.item, {
      quantity: row.quantity,
      companyName: row.companyName ?? null,
    }),
  );
}

export async function suggestItems(
  term: string,
  options: { stockOnly?: boolean; kitsOnly?: boolean; limit?: number } = {},
): Promise<ItemRow[]> {
  const db = await getDb();
  const pattern = `%${term}%`;
  const conditions = [
    eq(items.deleted, false),
    or(
      like(items.name, pattern),
      like(items.itemNumber, pattern),
      like(items.category, pattern),
      like(items.description, pattern),
    )!,
  ];
  if (options.stockOnly) conditions.push(eq(items.stockType, STOCK_TYPE.HAS_STOCK));
  if (options.kitsOnly) conditions.push(eq(items.itemType, ITEM_TYPE.ITEM_KIT));
  const rows = await db
    .select()
    .from(items)
    .where(and(...conditions))
    .orderBy(asc(items.name))
    .limit(options.limit ?? 25);
  return rows.map((row) => rowToItem(row));
}

export async function getCategorySuggestions(term: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ category: items.category })
    .from(items)
    .where(
      and(
        eq(items.deleted, false),
        like(items.category, `%${term}%`),
        ne(items.category, ""),
      ),
    )
    .limit(25);
  return rows.map((row) => row.category).filter(Boolean);
}

export async function getCategories(): Promise<string[]> {
  return getCategorySuggestions("");
}

export async function getLocationSuggestions(term: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ name: stockLocations.locationName })
    .from(stockLocations)
    .where(and(eq(stockLocations.deleted, false), like(stockLocations.locationName, `%${term}%`)));
  return rows.map((row) => row.name ?? "").filter(Boolean);
}

export async function getStockSearchSuggestions(
  search: string,
  limit = 25,
): Promise<ItemRow[]> {
  return suggestItems(search, { stockOnly: true, limit });
}

export async function getKitSearchSuggestions(
  search: string,
  limit = 25,
): Promise<ItemRow[]> {
  const db = await getDb();
  const pattern = `%${search}%`;
  const rows = await db
    .select()
    .from(itemKits)
    .where(or(like(itemKits.name, pattern), like(itemKits.itemKitNumber, pattern)))
    .limit(limit);
  return rows.map((row) => ({
    itemId: row.itemId,
    name: row.name,
    category: "",
    supplierId: null,
    itemNumber: row.itemKitNumber,
    description: row.description,
    costPrice: "0",
    unitPrice: "0",
    reorderLevel: "0",
    receivingQuantity: "0",
    picFilename: null,
    allowAltDescription: false,
    isSerialized: false,
    stockType: STOCK_TYPE.HAS_NO_STOCK,
    itemType: ITEM_TYPE.ITEM_KIT,
    taxCategoryId: null,
    qtyPerPack: "1",
    packName: null,
    lowSellItemId: null,
    hsnCode: "",
    deleted: false,
  }));
}

export async function getLowSellSuggestions(
  search: string,
  limit = 25,
): Promise<ItemRow[]> {
  const db = await getDb();
  const pattern = `%${search}%`;
  const rows = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.deleted, false),
        or(like(items.name, pattern), like(items.itemNumber, pattern))!,
      ),
    )
    .limit(limit);
  return rows.map((row) => rowToItem(row));
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(items)
    .where(eq(items.deleted, false));
  return Number(rows[0]?.value ?? 0);
}

export async function getItemKitById(itemKitId: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(itemKits)
    .where(eq(itemKits.itemKitId, itemKitId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getItemKitItems(itemKitId: number) {
  const db = await getDb();
  return db
    .select({
      itemId: itemKitItems.itemId,
      quantity: itemKitItems.quantity,
      kitSequence: itemKitItems.kitSequence,
    })
    .from(itemKitItems)
    .where(eq(itemKitItems.itemKitId, itemKitId))
    .orderBy(asc(itemKitItems.kitSequence));
}

export async function getAttributesForItem(
  itemId: number,
  saleId: number | null,
  flags: number,
): Promise<{ attributeValues: string; attributeDtvalues: string }> {
  const db = await getDb();
  const conditions = [
    eq(attributeLinks.itemId, itemId),
    eq(attributeDefinitions.deleted, false),
    ne(attributeDefinitions.definitionType, "GROUP"),
    sql`(${attributeDefinitions.definitionFlags} & ${flags}) = ${flags}`,
  ];
  if (saleId !== null && saleId > 0) {
    conditions.push(eq(attributeLinks.saleId, saleId));
  } else {
    conditions.push(isNull(attributeLinks.saleId), isNull(attributeLinks.receivingId));
  }
  const rows = await db
    .select({
      attributeValue: attributeValues.attributeValue,
      attributeDate: attributeValues.attributeDate,
      definitionId: attributeLinks.definitionId,
    })
    .from(attributeLinks)
    .innerJoin(attributeValues, eq(attributeValues.attributeId, attributeLinks.attributeId))
    .innerJoin(
      attributeDefinitions,
      eq(attributeDefinitions.definitionId, attributeLinks.definitionId),
    )
    .where(and(...conditions))
    .orderBy(asc(attributeLinks.definitionId));
  const values = rows
    .map((row) => row.attributeValue)
    .filter((value): value is string => value !== null);
  const dates = rows
    .map((row) => (row.attributeDate ? formatDb(row.attributeDate, dateFormat()) : null))
    .filter((value): value is string => value !== null);
  return {
    attributeValues: values.join(", "),
    attributeDtvalues: dates.join(", "),
  };
}

export async function getItemSupplierPeople() {
  const db = await getDb();
  return db.select().from(people).limit(1);
}
