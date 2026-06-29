import { and, eq, isNotNull, isNull, sql, desc, like, or, ne, gte, lt } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import {
  sales, salesItems, salesItemsTaxes, salesTaxes, salesPayments,
  inventory, itemQuantities, dinnerTables, customers, people,
  giftcards, itemKits, itemKitItems, items, attributeLinks, attributeValues,
  customerRewards, rewards,
} from "@/db/schema";
import { SALE_STATUS, SALE_TYPE, NEW_ENTRY, GIFT_CARD_PREFIX, REWARDS_PREFIX, HAS_STOCK } from "@/lib/constants";
import { render } from "@/lib/token";
import { getConfig, acquireNextSequence } from "@/lib/config";
import type { SaleCart } from "./types";
import type { CartLine } from "./cart-store";
import type { SalePayment } from "./cart-store";

export interface CompleteSaleInput {
  cart: SaleCart;
  taxes: { taxType: number; roundCode: number; taxGroup: string; saleTaxBasis: number; saleTaxAmount: number }[];
  itemTaxes: { itemId: number; line: number; name: string; percent: number; taxType: number; roundCode: number; itemTaxAmount: number }[];
  saleStatus: number;
  employeeId: number;
  subtotal: number;
  total: number;
  taxTotal: number;
}

export interface SaleSearchFilters {
  searchText?: string;
  customerId?: number;
  employeeId?: number;
  saleType?: number;
  saleStatus?: number;
  startDate?: number;
  endDate?: number;
  locationId?: number;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: "asc" | "desc";
}

function isItemId(s: string): boolean {
  return /^\d+$/.test(s) && !s.startsWith("0");
}

export async function saveSale(input: CompleteSaleInput): Promise<{ saleId: number; invoiceNumber: string | null; quoteNumber: string | null; workOrderNumber: string | null }> {
  const db = getDbSync();
  const { cart, taxes, itemTaxes, saleStatus, employeeId } = input;

  let invoiceNumber: string | null = null;
  let quoteNumber: string | null = null;
  let workOrderNumber: string | null = null;

  if (cart.mode === "sale_invoice" && saleStatus === SALE_STATUS.COMPLETED) {
    invoiceNumber = cart.invoiceNumber || await render(getConfig("sales_invoice_format", "{CO}"), { save: true });
  } else if (cart.mode === "sale_quote") {
    quoteNumber = cart.quoteNumber || (await acquireNextSequence("last_used_quote_number")).toString();
  } else if (cart.mode === "sale_work_order") {
    workOrderNumber = cart.workOrderNumber || (await acquireNextSequence("last_used_work_order_number")).toString();
  }

  return db.transaction((tx) => {
    let saleId: number;
    const saleInsert: typeof sales.$inferInsert = {
      saleTime: Math.floor(Date.now() / 1000),
      customerId: cart.customerId,
      employeeId,
      comment: cart.comment,
      invoiceNumber,
      quoteNumber,
      saleStatus,
      saleType: cart.saleType,
      dinnerTableId: cart.dinnerTableId,
      workOrderNumber,
      saleLocation: cart.locationId,
    };
    if (cart.saleId > 0 && cart.saleId !== NEW_ENTRY) {
      const existing = tx.select().from(sales).where(eq(sales.saleId, cart.saleId)).get();
      if (existing) {
        tx.update(sales).set(saleInsert).where(eq(sales.saleId, cart.saleId)).run();
        saleId = cart.saleId;
        clearSuspendedSaleDetail(tx, saleId);
      } else {
        const inserted = tx.insert(sales).values(saleInsert).returning({ id: sales.saleId }).get();
        saleId = inserted.id;
      }
    } else {
      const inserted = tx.insert(sales).values(saleInsert).returning({ id: sales.saleId }).get();
      saleId = inserted.id;
    }

    let totalAmountUsed = 0;
    for (const payment of cart.payments) {
      let actualType = payment.paymentType;
      let actualAmount = payment.paymentAmount;
      if (actualType.startsWith(GIFT_CARD_PREFIX)) {
        const giftcardNumber = actualType.slice(GIFT_CARD_PREFIX.length);
        const gc = tx.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).get();
        if (gc) {
          tx.update(giftcards).set({ value: gc.value - actualAmount }).where(eq(giftcards.giftcardId, gc.giftcardId)).run();
        }
      } else if (actualType === REWARDS_PREFIX && cart.customerId) {
        const c = tx.select().from(customers).where(eq(customers.personId, cart.customerId)).get();
        if (c) {
          tx.update(customers).set({ points: c.points - actualAmount }).where(eq(customers.personId, cart.customerId)).run();
          totalAmountUsed += actualAmount;
        }
      }
      tx.insert(salesPayments).values({
        saleId,
        paymentType: actualType,
        paymentAmount: actualAmount,
        cashRefund: payment.cashRefund,
        cashAdjustment: payment.cashAdjustment,
        employeeId,
      }).run();
    }

    saveCustomerRewards(tx, cart.customerId, saleId, input.total, totalAmountUsed);

    for (const line of cart.cart) {
      const item = tx.select().from(items).where(eq(items.itemId, line.itemId)).get();
      const cost = item?.costPrice ?? line.costPrice;
      const qty = cart.mode === "return" ? -Math.abs(line.quantity) : line.quantity;
      tx.insert(salesItems).values({
        saleId,
        itemId: line.itemId,
        line: line.line,
        description: line.description,
        serialnumber: line.serialnumber,
        quantityPurchased: qty,
        discount: line.discount,
        discountType: line.discountType,
        itemCostPrice: cost,
        itemUnitPrice: line.price,
        itemLocation: line.itemLocation,
        printOption: line.printOption,
      }).run();

      if (saleStatus === SALE_STATUS.COMPLETED && (item?.stockType ?? HAS_STOCK) === HAS_STOCK) {
        const existing = tx.select().from(itemQuantities)
          .where(and(eq(itemQuantities.itemId, line.itemId), eq(itemQuantities.locationId, line.itemLocation)))
          .get();
        const delta = cart.mode === "return" ? Math.abs(line.quantity) : -line.quantity;
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
        if (delta < 0 && item?.deleted) {
          tx.update(items).set({ deleted: false }).where(eq(items.itemId, line.itemId)).run();
        }
        tx.insert(inventory).values({
          transItems: line.itemId,
          transUser: employeeId,
          transLocation: line.itemLocation,
          transInventory: delta,
          transComment: `${SALE_STATUS.COMPLETED === saleStatus ? "POS " : "SUSPEND "}${saleId}`,
        }).run();
      }

      try {
        tx.insert(attributeLinks).values({
          attributeId: null,
          definitionId: 0,
          itemId: line.itemId,
          saleId,
        }).onConflictDoNothing().run();
      } catch { /* ignore */ }
    }

    if (taxes.length > 0) {
      for (const t of taxes) {
        tx.insert(salesTaxes).values({
          saleId,
          taxType: t.taxType,
          roundCode: t.roundCode,
          taxGroup: t.taxGroup,
          saleTaxBasis: t.saleTaxBasis,
          saleTaxAmount: t.saleTaxAmount,
        }).run();
      }
    }
    if (itemTaxes.length > 0) {
      for (const it of itemTaxes) {
        tx.insert(salesItemsTaxes).values({
          saleId,
          itemId: it.itemId,
          line: it.line,
          name: it.name,
          percent: it.percent,
          itemTaxAmount: it.itemTaxAmount,
        }).run();
      }
    }

    if (cart.dinnerTableId) {
      if (saleStatus === SALE_STATUS.COMPLETED) {
        tx.update(dinnerTables).set({ status: 0 }).where(eq(dinnerTables.dinnerTableId, cart.dinnerTableId)).run();
      } else if (saleStatus === SALE_STATUS.SUSPENDED) {
        tx.update(dinnerTables).set({ status: 1 }).where(eq(dinnerTables.dinnerTableId, cart.dinnerTableId)).run();
      }
    }

    void input.subtotal; void input.total; void input.taxTotal;

    return { saleId, invoiceNumber, quoteNumber, workOrderNumber };
  });
}

export function saveCustomerRewards(tx: ReturnType<typeof getDbSync>, customerId: number | null, saleId: number, totalAmount: number, totalAmountUsed: number): void {
  if (!customerId) return;
  const rewardEnabled = getConfig("use_customer_rewards", "0") === "1";
  if (!rewardEnabled) return;
  const links = tx.select().from(customerRewards).where(eq(customerRewards.customerId, customerId)).all();
  if (links.length === 0) return;
  for (const link of links) {
    const rw = tx.select().from(rewards).where(eq(rewards.rewardId, link.rewardId)).get();
    if (!rw) continue;
    const points = (totalAmount - totalAmountUsed) * (rw.pointsPercent / 100);
    const c = tx.select().from(customers).where(eq(customers.personId, customerId)).get();
    if (c) {
      tx.update(customers).set({ points: (c.points ?? 0) + points }).where(eq(customers.personId, customerId)).run();
    }
  }
}

export function clearSuspendedSaleDetail(tx: ReturnType<typeof getDbSync>, saleId: number): void {
  tx.delete(salesPayments).where(eq(salesPayments.saleId, saleId)).run();
  tx.delete(salesItemsTaxes).where(eq(salesItemsTaxes.saleId, saleId)).run();
  tx.delete(salesItems).where(eq(salesItems.saleId, saleId)).run();
  tx.delete(salesTaxes).where(eq(salesTaxes.saleId, saleId)).run();
}

export function clearSuspendedSaleDetailById(saleId: number): void {
  const db = getDbSync();
  db.transaction((tx) => clearSuspendedSaleDetail(tx, saleId));
}

export async function suspendSale(input: CompleteSaleInput): Promise<number> {
  return (await saveSale({ ...input, saleStatus: SALE_STATUS.SUSPENDED })).saleId;
}

export async function completeSale(input: CompleteSaleInput): Promise<{ saleId: number; invoiceNumber: string | null; quoteNumber: string | null; workOrderNumber: string | null }> {
  return saveSale({ ...input, saleStatus: SALE_STATUS.COMPLETED });
}

export interface SuspendedSale {
  saleId: number;
  saleTime: number | null;
  customerId: number | null;
  comment: string | null;
  saleType: number;
  dinnerTableId: number | null;
  invoiceNumber: string | null;
  quoteNumber: string | null;
  workOrderNumber: string | null;
  total: number;
  itemCount: number;
}

export function getSuspendedSales(): SuspendedSale[] {
  const db = getDbSync();
  return db.select({
    saleId: sales.saleId,
    saleTime: sales.saleTime,
    customerId: sales.customerId,
    comment: sales.comment,
    saleType: sales.saleType,
    dinnerTableId: sales.dinnerTableId,
    invoiceNumber: sales.invoiceNumber,
    quoteNumber: sales.quoteNumber,
    workOrderNumber: sales.workOrderNumber,
  })
    .from(sales)
    .where(eq(sales.saleStatus, SALE_STATUS.SUSPENDED))
    .orderBy(desc(sales.saleTime))
    .all() as SuspendedSale[];
}

export function getSale(saleId: number) {
  const db = getDbSync();
  return db.select().from(sales).where(eq(sales.saleId, saleId)).get();
}

export function getSaleItems(saleId: number) {
  const db = getDbSync();
  return db.select().from(salesItems).where(eq(salesItems.saleId, saleId)).all();
}

export function getSaleItemsOrdered(saleId: number) {
  const db = getDbSync();
  return db.select().from(salesItems).where(eq(salesItems.saleId, saleId)).orderBy(salesItems.line).all();
}

export function getSalePayments(saleId: number) {
  const db = getDbSync();
  return db.select().from(salesPayments).where(eq(salesPayments.saleId, saleId)).all();
}

export function getSaleTaxes(saleId: number) {
  const db = getDbSync();
  return db.select().from(salesTaxes).where(eq(salesTaxes.saleId, saleId)).all();
}

export function getSaleItemTaxes(saleId: number, itemId?: number) {
  const db = getDbSync();
  if (itemId) {
    return db.select().from(salesItemsTaxes)
      .where(and(eq(salesItemsTaxes.saleId, saleId), eq(salesItemsTaxes.itemId, itemId))).all();
  }
  return db.select().from(salesItemsTaxes).where(eq(salesItemsTaxes.saleId, saleId)).all();
}

export function getInvoiceCount(): number {
  const db = getDbSync();
  const row = db.select({ c: sql<number>`count(*)` }).from(sales).where(isNotNull(sales.invoiceNumber)).get();
  return row?.c ?? 0;
}

export function getSuspendedInvoiceCount(): number {
  const db = getDbSync();
  const row = db.select({ c: sql<number>`count(*)` })
    .from(sales)
    .where(and(eq(sales.saleStatus, SALE_STATUS.SUSPENDED), isNotNull(sales.invoiceNumber)))
    .get();
  return row?.c ?? 0;
}

export function getInvoiceNumberForYear(year?: number): number {
  const y = year ?? new Date().getFullYear();
  const start = new Date(y, 0, 1).getTime() / 1000;
  const end = new Date(y + 1, 0, 1).getTime() / 1000;
  const db = getDbSync();
  const row = db.select({ c: sql<number>`count(*)` })
    .from(sales)
    .where(and(gte(sales.saleTime, start), lt(sales.saleTime, end), isNotNull(sales.invoiceNumber)))
    .get();
  return row?.c ?? 0;
}

export function getQuoteNumberForYear(year?: number): number {
  const y = year ?? new Date().getFullYear();
  const start = new Date(y, 0, 1).getTime() / 1000;
  const end = new Date(y + 1, 0, 1).getTime() / 1000;
  const db = getDbSync();
  const row = db.select({ c: sql<number>`count(*)` })
    .from(sales)
    .where(and(gte(sales.saleTime, start), lt(sales.saleTime, end), isNotNull(sales.quoteNumber)))
    .get();
  return row?.c ?? 0;
}

export function getSaleByInvoiceNumber(invoiceNumber: string) {
  const db = getDbSync();
  return db.select().from(sales).where(eq(sales.invoiceNumber, invoiceNumber)).get();
}

export function checkInvoiceNumberExists(invoiceNumber: string, excludeSaleId: number | null = null): boolean {
  if (!invoiceNumber) return false;
  const db = getDbSync();
  const conditions = [eq(sales.invoiceNumber, invoiceNumber)];
  if (excludeSaleId) conditions.push(sql`${sales.saleId} != ${excludeSaleId}`);
  const row = db.select({ id: sales.saleId }).from(sales).where(and(...conditions)).get();
  return !!row;
}

export function checkQuoteNumberExists(quoteNumber: string, excludeSaleId: number | null = null): boolean {
  if (!quoteNumber) return false;
  const db = getDbSync();
  const conditions = [eq(sales.quoteNumber, quoteNumber)];
  if (excludeSaleId) conditions.push(sql`${sales.saleId} != ${excludeSaleId}`);
  const row = db.select({ id: sales.saleId }).from(sales).where(and(...conditions)).get();
  return !!row;
}

export function checkWorkOrderNumberExists(workOrderNumber: string, excludeSaleId: number | null = null): boolean {
  if (!workOrderNumber) return false;
  const db = getDbSync();
  const conditions = [eq(sales.workOrderNumber, workOrderNumber)];
  if (excludeSaleId) conditions.push(sql`${sales.saleId} != ${excludeSaleId}`);
  const row = db.select({ id: sales.saleId }).from(sales).where(and(...conditions)).get();
  return !!row;
}

export function getDinnerTable(saleId: number) {
  const db = getDbSync();
  const row = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
  if (!row?.dinnerTableId) return null;
  return db.select().from(dinnerTables).where(eq(dinnerTables.dinnerTableId, row.dinnerTableId)).get();
}

export function getSaleType(saleId: number): number | null {
  const row = getSale(saleId);
  return row?.saleType ?? null;
}

export function getSaleStatus(saleId: number): number | null {
  const row = getSale(saleId);
  return row?.saleStatus ?? null;
}

export function updateSaleStatus(saleId: number, status: number): void {
  getDbSync().update(sales).set({ saleStatus: status }).where(eq(sales.saleId, saleId)).run();
}

export function getQuoteNumber(saleId: number): string | null {
  return getSale(saleId)?.quoteNumber ?? null;
}

export function getWorkOrderNumber(saleId: number): string | null {
  return getSale(saleId)?.workOrderNumber ?? null;
}

export function getComment(saleId: number): string | null {
  return getSale(saleId)?.comment ?? null;
}

export function getCustomer(saleId: number) {
  const db = getDbSync();
  const sale = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
  if (!sale?.customerId) return null;
  return db.select().from(people).where(eq(people.personId, sale.customerId)).get();
}

export function getEmployee(saleId: number) {
  const db = getDbSync();
  const sale = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
  if (!sale?.employeeId) return null;
  return db.select().from(people).where(eq(people.personId, sale.employeeId)).get();
}

export function getGiftcardValue(giftcardNumber: string): number {
  const db = getDbSync();
  const row = db.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).get();
  return row?.value ?? 0;
}

export function isValidReceipt(receipt: string): { type: "RECV" | "POS" | "ITEM"; id: number } | null {
  const trimmed = receipt.trim();
  const m1 = trimmed.match(/^POS\s+(\d+)$/i);
  if (m1) return { type: "POS", id: parseInt(m1[1], 10) };
  if (isItemId(trimmed)) return { type: "ITEM", id: parseInt(trimmed, 10) };
  return null;
}

export function getPaymentOptions(giftcard = false, rewardPoints = false): string[] {
  const opts: string[] = ["Cash", "Check", "Debit Card", "Credit Card", "Due"];
  if (giftcard) opts.push("Gift Card: ");
  if (rewardPoints) opts.push("Rewards");
  return opts;
}

export function getAllSuspended(customerId?: number) {
  const db = getDbSync();
  const conditions = [eq(sales.saleStatus, SALE_STATUS.SUSPENDED)];
  if (customerId) conditions.push(eq(sales.customerId, customerId));
  return db.select().from(sales).where(and(...conditions)).all();
}

export function getSuspendedSaleInfo(saleId: number) {
  const db = getDbSync();
  return db.select({
    saleId: sales.saleId,
    saleTime: sales.saleTime,
    customerId: sales.customerId,
    comment: sales.comment,
    saleType: sales.saleType,
    saleStatus: sales.saleStatus,
    invoiceNumber: sales.invoiceNumber,
    quoteNumber: sales.quoteNumber,
    workOrderNumber: sales.workOrderNumber,
    dinnerTableId: sales.dinnerTableId,
    firstName: people.firstName,
    lastName: people.lastName,
  })
    .from(sales)
    .leftJoin(people, eq(people.personId, sales.customerId))
    .where(eq(sales.saleId, saleId))
    .get();
}

export function deleteSuspendedSale(saleId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const sale = tx.select().from(sales).where(eq(sales.saleId, saleId)).get();
    if (!sale) return;
    if (sale.dinnerTableId) {
      tx.update(dinnerTables).set({ status: 0 }).where(eq(dinnerTables.dinnerTableId, sale.dinnerTableId)).run();
    }
    tx.update(sales).set({ saleStatus: SALE_STATUS.CANCELED }).where(eq(sales.saleId, saleId)).run();
  });
}

export function cancelSale(saleId: number, employeeId: number, updateInventory = true): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const sale = tx.select().from(sales).where(eq(sales.saleId, saleId)).get();
    if (!sale) throw new Error("Sale not found");
    if (sale.saleStatus === SALE_STATUS.COMPLETED) {
      tx.update(sales).set({ saleStatus: SALE_STATUS.CANCELED }).where(eq(sales.saleId, saleId)).run();
      if (updateInventory) {
        const items = tx.select().from(salesItems).where(eq(salesItems.saleId, saleId)).all();
        for (const item of items) {
          const delta = -item.quantityPurchased;
          const existing = tx.select().from(itemQuantities)
            .where(and(eq(itemQuantities.itemId, item.itemId), eq(itemQuantities.locationId, item.itemLocation ?? 0)))
            .get();
          if (existing) {
            tx.update(itemQuantities).set({ quantity: existing.quantity + delta })
              .where(and(eq(itemQuantities.itemId, item.itemId), eq(itemQuantities.locationId, item.itemLocation ?? 0)))
              .run();
          }
          tx.insert(inventory).values({
            transItems: item.itemId,
            transUser: employeeId,
            transLocation: item.itemLocation,
            transInventory: delta,
            transComment: `CANCEL ${saleId}`,
          }).run();
        }
      }
    } else {
      tx.delete(sales).where(eq(sales.saleId, saleId)).run();
    }
  });
}

export function deleteList(saleIds: number[], employeeId: number, updateInventory = true): void {
  for (const id of saleIds) cancelSale(id, employeeId, updateInventory);
}

export function restoreList(saleIds: number[]): void {
  for (const id of saleIds) updateSaleStatus(id, SALE_STATUS.SUSPENDED);
}

export function exists(saleId: number): boolean {
  return !!getSale(saleId);
}

export function search(filters: SaleSearchFilters): { rows: any[]; total: number } {
  const db = getDbSync();
  const conditions: any[] = [];
  if (filters.searchText) {
    const t = `%${filters.searchText}%`;
    conditions.push(or(like(sales.invoiceNumber, t), like(sales.quoteNumber, t), like(sales.comment, t))!);
  }
  if (filters.customerId) conditions.push(eq(sales.customerId, filters.customerId));
  if (filters.employeeId) conditions.push(eq(sales.employeeId, filters.employeeId));
  if (filters.saleType != null) conditions.push(eq(sales.saleType, filters.saleType));
  if (filters.saleStatus != null) conditions.push(eq(sales.saleStatus, filters.saleStatus));
  else conditions.push(ne(sales.saleStatus, SALE_STATUS.SUSPENDED));
  if (filters.startDate) conditions.push(gte(sales.saleTime, filters.startDate));
  if (filters.endDate) conditions.push(lt(sales.saleTime, filters.endDate));
  if (filters.locationId) conditions.push(eq(sales.saleLocation, filters.locationId));

  const where = conditions.length ? and(...conditions) : undefined;
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  const order = filters.order === "asc" ? sql`${sales.saleTime} ASC` : sql`${sales.saleTime} DESC`;

  const rows = db.select().from(sales).where(where).orderBy(order).limit(limit).offset(offset).all();
  const total = db.select({ c: sql<number>`count(*)` }).from(sales).where(where).get();
  return { rows, total: total?.c ?? 0 };
}

export function getFoundRows(filters: SaleSearchFilters): number {
  return search(filters).total;
}

export function getTotalRows(): number {
  const db = getDbSync();
  return db.select({ c: sql<number>`count(*)` }).from(sales).where(ne(sales.saleStatus, SALE_STATUS.SUSPENDED)).get()?.c ?? 0;
}

export function getPaymentsSummary(filters: SaleSearchFilters): { paymentType: string; count: number; total: number }[] {
  const db = getDbSync();
  const conditions: any[] = [];
  if (filters.startDate) conditions.push(gte(sales.saleTime, filters.startDate));
  if (filters.endDate) conditions.push(lt(sales.saleTime, filters.endDate));
  if (filters.locationId) conditions.push(eq(sales.saleLocation, filters.locationId));
  if (filters.saleType != null) conditions.push(eq(sales.saleType, filters.saleType));
  conditions.push(ne(sales.saleStatus, SALE_STATUS.SUSPENDED));
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select({
    paymentType: salesPayments.paymentType,
    count: sql<number>`count(*)`,
    total: sql<number>`COALESCE(SUM(${salesPayments.paymentAmount}), 0)`,
  })
    .from(salesPayments)
    .innerJoin(sales, eq(sales.saleId, salesPayments.saleId))
    .where(where)
    .groupBy(salesPayments.paymentType)
    .all();
}

export function getSearchSuggestions(search: string, limit = 25) {
  const db = getDbSync();
  const t = `%${search}%`;
  return db.select({
    saleId: sales.saleId,
    invoiceNumber: sales.invoiceNumber,
    quoteNumber: sales.quoteNumber,
    workOrderNumber: sales.workOrderNumber,
    customerId: sales.customerId,
  })
    .from(sales)
    .where(and(
      or(
        like(sales.invoiceNumber, t),
        like(sales.quoteNumber, t),
        like(sales.workOrderNumber, t)
      )!,
      ne(sales.saleStatus, SALE_STATUS.CANCELED)
    ))
    .limit(limit)
    .all();
}

export function copySaleToCart(saleId: number): { items: CartLine[]; payments: SalePayment[]; saleType: number; sale: typeof sales.$inferSelect | undefined } {
  const db = getDbSync();
  const itemsRows = db.select().from(salesItems).where(eq(salesItems.saleId, saleId)).all();
  const paymentsRows = db.select().from(salesPayments).where(eq(salesPayments.saleId, saleId)).all();
  const sale = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
  const cart: CartLine[] = itemsRows.map((r) => ({
    line: r.line,
    itemId: r.itemId,
    itemLocation: r.itemLocation ?? 1,
    itemName: "",
    itemNumber: null,
    stockName: "",
    attributeValues: "",
    attributeDtvalues: "",
    description: r.description ?? "",
    serialnumber: r.serialnumber ?? "",
    allowAltDescription: false,
    isSerialized: false,
    quantity: Math.abs(r.quantityPurchased),
    discount: r.discount,
    discountType: r.discountType,
    inStock: 0,
    price: r.itemUnitPrice,
    costPrice: r.itemCostPrice,
    total: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
    discountedTotal: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
    printOption: r.printOption,
    stockType: 0,
    itemType: 0,
    hsnCode: "",
    taxCategoryId: null,
    taxedFlag: "",
    promotionDiscount: 0,
    unitPriceBeforePromo: r.itemUnitPrice,
    promoQuantitySold: 0,
    printAfterPromo: false,
  }));
  const payments: SalePayment[] = paymentsRows.map((p) => ({
    paymentId: `${p.paymentType}-${p.paymentTime}`,
    paymentType: p.paymentType,
    paymentAmount: p.paymentAmount,
    cashRefund: p.cashRefund,
    cashAdjustment: p.cashAdjustment,
    employeeId: p.employeeId ?? 0,
    paymentTime: p.paymentTime ?? Math.floor(Date.now() / 1000),
  }));
  return { items: cart, payments, saleType: sale?.saleType ?? SALE_TYPE.POS, sale };
}

export function saveCustomerRewardPoints(customerId: number, saleId: number, totalAmount: number): void {
  const db = getDbSync();
  const links = db.select().from(customerRewards).where(eq(customerRewards.customerId, customerId)).all();
  for (const link of links) {
    const rw = db.select().from(rewards).where(eq(rewards.rewardId, link.rewardId)).get();
    if (!rw) continue;
    const points = totalAmount * (rw.pointsPercent / 100);
    const c = db.select().from(customers).where(eq(customers.personId, customerId)).get();
    if (c) {
      db.update(customers).set({ points: (c.points ?? 0) + points }).where(eq(customers.personId, customerId)).run();
    }
  }
}

export function update(saleId: number, data: {
  customerId?: number | null;
  employeeId?: number | null;
  comment?: string | null;
  saleTime?: number | null;
  payments?: { paymentType: string; paymentAmount: number; cashRefund?: number; cashAdjustment?: number; employeeId?: number; paymentId?: string | null }[];
}): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const updateData: any = {};
    if (data.customerId !== undefined) updateData.customerId = data.customerId;
    if (data.employeeId !== undefined) updateData.employeeId = data.employeeId;
    if (data.comment !== undefined) updateData.comment = data.comment;
    if (data.saleTime) updateData.saleTime = data.saleTime;
    if (Object.keys(updateData).length) {
      tx.update(sales).set(updateData).where(eq(sales.saleId, saleId)).run();
    }
    if (data.payments) {
      const existing = tx.select().from(salesPayments).where(eq(salesPayments.saleId, saleId)).all();
      for (const p of data.payments) {
        if (p.paymentAmount === 0) continue;
        if (p.paymentId) {
          tx.update(salesPayments).set({
            paymentType: p.paymentType,
            paymentAmount: p.paymentAmount,
            cashRefund: p.cashRefund ?? 0,
            cashAdjustment: p.cashAdjustment ?? 0,
          }).where(and(eq(salesPayments.saleId, saleId), eq(salesPayments.paymentType, p.paymentType))).run();
        } else {
          tx.insert(salesPayments).values({
            saleId,
            paymentType: p.paymentType,
            paymentAmount: p.paymentAmount,
            cashRefund: p.cashRefund ?? 0,
            cashAdjustment: p.cashAdjustment ?? 0,
            employeeId: p.employeeId ?? 0,
          }).run();
        }
      }
      void existing;
    }
  });
}

void isNull;
void attributeValues;
void itemKits;
void itemKitItems;
