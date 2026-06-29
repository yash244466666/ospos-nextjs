import { and, eq, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { receivings, receivingsItems, inventory, itemQuantities, items, stockLocations } from "@/db/schema";
import { render } from "@/lib/token";
import { getConfig } from "@/lib/config";
import type { ReceivingCart } from "./receiving-store";

export interface CompleteReceivingInput {
  cart: ReceivingCart;
  employeeId: number;
  paymentType: string;
}

export async function completeReceiving(input: CompleteReceivingInput): Promise<{ receivingId: number; invoiceNumber: string | null }> {
  const db = getDbSync();
  const { cart, employeeId, paymentType } = input;

  let invoiceNumber: string | null = null;
  if (cart.invoiceNumber) {
    invoiceNumber = cart.invoiceNumber;
  } else {
    const fmt = getConfig("recv_invoice_format", "{CO}");
    if (fmt && fmt.trim()) invoiceNumber = await render(fmt, { save: true });
  }

  return db.transaction((tx) => {
    const inserted = tx.insert(receivings).values({
      receivingTime: Math.floor(Date.now() / 1000),
      supplierId: cart.supplierId,
      employeeId,
      comment: cart.comment,
      paymentType,
      invoiceNumber,
      receivingLocation: cart.locationId,
    }).returning({ id: receivings.receivingId }).get();
    const receivingId = inserted.id;

    for (const line of cart.cart) {
      const signedQty = cart.mode === "return" ? -line.quantity : line.quantity;
      tx.insert(receivingsItems).values({
        receivingId,
        itemId: line.itemId,
        line: line.line,
        description: line.description,
        quantityPurchased: signedQty,
        itemCostPrice: line.costPrice,
        itemUnitPrice: line.price,
        discount: line.discount,
        discountType: line.discountType,
        itemLocation: line.itemLocation,
        receivingQuantity: 1,
      }).run();

      const existing = tx.select().from(itemQuantities)
        .where(and(eq(itemQuantities.itemId, line.itemId), eq(itemQuantities.locationId, line.itemLocation)))
        .get();
      const delta = signedQty;
      if (existing) {
        tx.update(itemQuantities).set({ quantity: existing.quantity + delta })
          .where(and(eq(itemQuantities.itemId, line.itemId), eq(itemQuantities.locationId, line.itemLocation)))
          .run();
      } else {
        tx.insert(itemQuantities).values({
          itemId: line.itemId,
          locationId: line.itemLocation,
          quantity: delta,
        }).run();
      }

      tx.insert(inventory).values({
        transItems: line.itemId,
        transUser: employeeId,
        transLocation: line.itemLocation,
        transInventory: delta,
        transComment: cart.mode === "return" ? "Receiving return" : "Receiving",
      }).run();

      if (cart.mode === "receive" && line.price > 0 && line.quantity > 0) {
        const item = tx.select().from(items).where(eq(items.itemId, line.itemId)).get();
        if (item) {
          const oldPrice = item.costPrice;
          const sumRow = tx.select({ total: sql<number>`COALESCE(SUM(${itemQuantities.quantity}), 0)` })
            .from(itemQuantities)
            .innerJoin(stockLocations, eq(stockLocations.locationId, itemQuantities.locationId))
            .where(and(eq(itemQuantities.itemId, line.itemId), eq(stockLocations.deleted, false)))
            .get();
          const oldTotal = sumRow?.total ?? 0;
          const newTotal = oldTotal + line.quantity;
          if (newTotal > 0) {
            const avg = (line.quantity * line.price + oldTotal * oldPrice) / newTotal;
            tx.update(items).set({ costPrice: Math.round(avg * 10000) / 10000 })
              .where(eq(items.itemId, line.itemId))
              .run();
          }
        }
      }
    }

    return { receivingId, invoiceNumber };
  });
}

export function getReceiving(receivingId: number) {
  const db = getDbSync();
  return db.select().from(receivings).where(eq(receivings.receivingId, receivingId)).get();
}

export function getReceivingItems(receivingId: number) {
  const db = getDbSync();
  return db.select().from(receivingsItems).where(eq(receivingsItems.receivingId, receivingId)).all();
}
import { desc, like } from "drizzle-orm";

export function getReceivings(limit = 25, offset = 0) {
  return getDbSync().select().from(receivings)
    .orderBy(desc(receivings.receivingId))
    .limit(limit).offset(offset).all();
}

export function searchReceivings(filters: { startDate?: number; endDate?: number; supplierId?: number; invoiceNumber?: string }, limit = 25, offset = 0) {
  const db = getDbSync();
  const conditions: any[] = [];
  if (filters.startDate) conditions.push(sql`${receivings.receivingTime} >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(sql`${receivings.receivingTime} <= ${filters.endDate}`);
  if (filters.supplierId) conditions.push(eq(receivings.supplierId, filters.supplierId));
  if (filters.invoiceNumber) conditions.push(like(receivings.invoiceNumber, `%${filters.invoiceNumber}%`));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(receivings)
    .where(where)
    .orderBy(desc(receivings.receivingId))
    .limit(limit).offset(offset).all();
}

export function cancelReceiving(receivingId: number, employeeId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const lines = tx.select().from(receivingsItems).where(eq(receivingsItems.receivingId, receivingId)).all();
    for (const line of lines) {
      const existing = tx.select().from(itemQuantities)
        .where(and(eq(itemQuantities.itemId, line.itemId), eq(itemQuantities.locationId, line.itemLocation ?? 1)))
        .get();
      if (existing) {
        tx.update(itemQuantities).set({ quantity: existing.quantity - line.quantityPurchased })
          .where(and(eq(itemQuantities.itemId, line.itemId), eq(itemQuantities.locationId, line.itemLocation ?? 1)))
          .run();
      }
      tx.insert(inventory).values({
        transItems: line.itemId,
        transUser: employeeId,
        transLocation: line.itemLocation ?? 1,
        transInventory: -line.quantityPurchased,
        transComment: "Receiving cancelled",
      }).run();
    }
    tx.delete(receivings).where(eq(receivings.receivingId, receivingId)).run();
  });
}
