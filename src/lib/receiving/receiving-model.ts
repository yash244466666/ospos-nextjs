import { and, asc, eq, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb, IS_SQLITE, type Db } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { affectedRows } from "@/lib/db/execute";
import {
  attributeLinks,
  itemQuantities,
  items,
  receivings,
  receivingsItems,
  stockLocations,
  suppliers,
} from "@/db/schema";
import {
  getConfigBool,
  loadConfig,
  timezone,
} from "@/lib/config";
import { nowDb } from "@/lib/datetime";
import {
  bcMul,
  dec,
  phpRound,
  toDbDecimal,
  type DecimalInput,
} from "@/lib/money";
import { ROUNDING_MODE } from "@/lib/constants";
import { getTotal, type ReceivingCart } from "./receiving-lib";
import { lang } from "@/lib/i18n/lang";

export interface CompleteReceivingInput {
  cart: ReceivingCart;
  employeeId: number;
  paymentType: string;
}

export interface ReceivingRow {
  receivingId: number;
  receivingTime: string;
  supplierId: number | null;
  employeeId: number;
  comment: string;
  paymentType: string | null;
  reference: string | null;
}

async function supplierExists(supplierId: number): Promise<boolean> {
  if (supplierId === -1) return false;
  const db = await getDb();
  const rows = await db
    .select({ personId: suppliers.personId })
    .from(suppliers)
    .where(and(eq(suppliers.personId, supplierId), eq(suppliers.deleted, false)))
    .limit(1);
  return rows.length === 1;
}

async function changeQuantity(
  tx: Db,
  itemId: number,
  locationId: number,
  delta: DecimalInput,
): Promise<void> {
  const value = toDbDecimal(delta, 3);
  await affectedRows(
    tx,
    IS_SQLITE
      ? sql`INSERT INTO ospos_item_quantities (item_id, location_id, quantity)
            VALUES (${itemId}, ${locationId}, ${value})
            ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = quantity + ${value}`
      : sql`INSERT INTO ospos_item_quantities (item_id, location_id, quantity)
            VALUES (${itemId}, ${locationId}, ${value})
            ON DUPLICATE KEY UPDATE quantity = quantity + ${value}`,
  );
}

async function copyReceivingAttributeLinks(
  tx: Db,
  itemId: number,
  receivingId: number,
): Promise<void> {
  const links = await tx
    .select({
      attributeId: attributeLinks.attributeId,
      definitionId: attributeLinks.definitionId,
    })
    .from(attributeLinks)
    .where(
      and(
        eq(attributeLinks.itemId, itemId),
        sql`${attributeLinks.saleId} IS NULL`,
        sql`${attributeLinks.receivingId} IS NULL`,
      ),
    );
  for (const link of links) {
    const exists = await tx
      .select({ id: attributeLinks.definitionId })
      .from(attributeLinks)
      .where(
        and(
          eq(attributeLinks.definitionId, link.definitionId),
          eq(attributeLinks.receivingId, receivingId),
          eq(attributeLinks.itemId, itemId),
        ),
      )
      .limit(1);
    if (exists.length === 0) {
      await insertReturning(tx, attributeLinks, {
        attributeId: link.attributeId,
        definitionId: link.definitionId,
        itemId,
        receivingId,
      });
    }
  }
}

/** `Receiving::save_value` — cost average before quantity update (O-Receivings C). */
export async function completeReceiving(
  input: CompleteReceivingInput,
): Promise<{ receivingId: number; invoiceNumber: string | null }> {
  await loadConfig();
  if (input.cart.cart.length === 0) {
    return { receivingId: -1, invoiceNumber: null };
  }
  const supplierId = (await supplierExists(input.cart.supplierId))
    ? input.cart.supplierId
    : null;
  const receivingTime = nowDb(timezone());

  const receivingId = await withTransaction(async (tx) => {
    const inserted = await insertReturning(
      tx,
      receivings,
      {
        receivingTime,
        supplierId,
        employeeId: input.employeeId,
        paymentType: input.paymentType,
        comment: input.cart.comment,
        reference: input.cart.reference,
      },
      receivings.receivingId,
    );
    const id = inserted[0]!.id;

    for (const line of input.cart.cart) {
      const itemRows = await tx
        .select({ costPrice: items.costPrice })
        .from(items)
        .where(eq(items.itemId, line.itemId))
        .limit(1);
      const currentCostPrice = itemRows[0]?.costPrice ?? "0";

      await tx.insert(receivingsItems).values({
        receivingId: id,
        itemId: line.itemId,
        line: line.line,
        description: line.description,
        serialnumber: line.serialnumber,
        quantityPurchased: toDbDecimal(line.quantity, 3),
        receivingQuantity: toDbDecimal(line.receivingQuantity, 3),
        discount: toDbDecimal(line.discount, 2),
        discountType: line.discountType,
        itemCostPrice: toDbDecimal(currentCostPrice, 2),
        itemUnitPrice: toDbDecimal(line.price, 2),
        itemLocation: line.itemLocation,
      });

      const itemsReceived = dec(line.receivingQuantity).isZero()
        ? dec(line.quantity)
        : bcMul(line.quantity, line.receivingQuantity);

      if (
        !dec(currentCostPrice).eq(dec(line.price)) &&
        getConfigBool("receiving_calculate_average_price", false)
      ) {
        const oldTotalQuantity = await sumStockQuantities(tx, line.itemId);
        const totalQuantity = oldTotalQuantity.plus(itemsReceived);
        if (!totalQuantity.isZero()) {
          const numerator = bcMul(itemsReceived, line.price).plus(
            bcMul(oldTotalQuantity, currentCostPrice),
          );
          const average = numerator.dividedBy(totalQuantity).toDecimalPlaces(4, 1);
          await tx
            .update(items)
            .set({ costPrice: toDbDecimal(phpRound(average, 2, ROUNDING_MODE.HALF_UP), 2) })
            .where(eq(items.itemId, line.itemId));
        }
      }

      await changeQuantity(tx, line.itemId, line.itemLocation, itemsReceived);
      await affectedRows(tx, sqlInventory({
        transDate: nowDb(timezone()),
        transItems: line.itemId,
        transUser: input.employeeId,
        transLocation: line.itemLocation,
        transComment: `RECV ${id}`,
        transInventory: toDbDecimal(itemsReceived, 3),
      }));
      await copyReceivingAttributeLinks(tx, line.itemId, id);
    }
    return id;
  });

  return { receivingId, invoiceNumber: null };
}

function sqlInventory(data: {
  transDate: string;
  transItems: number;
  transUser: number;
  transLocation: number;
  transComment: string;
  transInventory: string;
}) {
  return sql`INSERT INTO ospos_inventory
    (trans_date, trans_items, trans_user, trans_location, trans_comment, trans_inventory)
    VALUES (${data.transDate}, ${data.transItems}, ${data.transUser}, ${data.transLocation}, ${data.transComment}, ${data.transInventory})`;
}

async function sumStockQuantities(tx: Db, itemId: number) {
  const rows = await tx
    .select({ quantity: itemQuantities.quantity })
    .from(itemQuantities)
    .innerJoin(stockLocations, eq(stockLocations.locationId, itemQuantities.locationId))
    .where(and(eq(itemQuantities.itemId, itemId), eq(stockLocations.deleted, false)));
  return rows.reduce((sum, row) => sum.plus(dec(row.quantity)), dec(0));
}

/** `Receiving::delete_value` — reverses `quantity × receiving_quantity`. */
export async function cancelReceiving(
  receivingId: number,
  employeeId: number,
  updateInventory = true,
): Promise<boolean> {
  const db = await getDb();
  const lines = await db
    .select()
    .from(receivingsItems)
    .where(eq(receivingsItems.receivingId, receivingId));
  await withTransaction(async (tx) => {
    if (updateInventory) {
      for (const line of lines) {
        const reversal = bcMul(line.quantityPurchased, line.receivingQuantity).negated();
        await affectedRows(tx, sqlInventory({
          transDate: nowDb(timezone()),
          transItems: line.itemId,
          transUser: employeeId,
          transLocation: line.itemLocation,
          transComment: `Deleting receiving ${receivingId}`,
          transInventory: toDbDecimal(reversal, 3),
        }));
        await changeQuantity(tx, line.itemId, line.itemLocation, reversal);
      }
    }
    await tx.delete(receivingsItems).where(eq(receivingsItems.receivingId, receivingId));
    await tx.delete(receivings).where(eq(receivings.receivingId, receivingId));
  });
  return true;
}

export async function getReceiving(receivingId: number): Promise<ReceivingRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(receivings)
    .where(eq(receivings.receivingId, receivingId))
    .limit(1);
  return rows[0] ? { ...rows[0] } : null;
}

export async function getReceivingItems(receivingId: number) {
  const db = await getDb();
  return db
    .select()
    .from(receivingsItems)
    .where(eq(receivingsItems.receivingId, receivingId))
    .orderBy(asc(receivingsItems.line));
}

export async function getReceivings(limit = 25, offset = 0) {
  const db = await getDb();
  return db
    .select()
    .from(receivings)
    .orderBy(asc(receivings.receivingId))
    .limit(limit)
    .offset(offset);
}

export async function getReceivingByReference(reference: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(receivings)
    .where(eq(receivings.reference, reference))
    .limit(1);
  return rows[0] ?? null;
}

/** `Receiving::is_valid_receipt`: `RECV #`, `KIT #`, or a reference match. */
export async function isValidReceipt(receipt: string): Promise<number | null> {
  const pieces = receipt.trim().split(" ");
  if (pieces.length === 2 && /^(RECV|KIT)$/i.test(pieces[0]) && /^\d+$/.test(pieces[1])) {
    return Number(pieces[1]);
  }
  const byReference = await getReceivingByReference(receipt);
  return byReference?.receivingId ?? null;
}

export async function searchReceivings(
  search: string,
  filters: { start_date?: string; end_date?: string; is_deleted?: boolean } = {},
  limit = 25,
  offset = 0,
) {
  const db = await getDb();
  const pattern = `%${search}%`;
  return db
    .select()
    .from(receivings)
    .where(
      and(
        search
          ? sql`(${receivings.receivingId} LIKE ${pattern} OR ${receivings.reference} LIKE ${pattern} OR ${receivings.comment} LIKE ${pattern})`
          : sql`1 = 1`,
      ),
    )
    .orderBy(asc(receivings.receivingId))
    .limit(limit)
    .offset(offset);
}

export function getReceivingTotals(cart: ReceivingCart): string {
  return getTotal(cart);
}

/** `Receiving::get_payment_options`. */
export function receivingPaymentOptions(): string[] {
  return [
    lang("Sales.cash"),
    lang("Sales.check"),
    lang("Sales.debit"),
    lang("Sales.credit"),
    lang("Sales.due"),
    lang("Sales.bank_transfer"),
    lang("Sales.wallet"),
  ];
}
