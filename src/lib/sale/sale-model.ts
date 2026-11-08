import { and, asc, desc, eq, gte, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { affectedRows } from "@/lib/db/execute";
import { IS_SQLITE, type Db } from "@/lib/db";
import {
  attributeLinks,
  customers,
  customerPackages,
  dinnerTables,
  employees,
  giftcards,
  itemQuantities,
  items,
  people,
  sales,
  salesItems,
  salesItemsTaxes,
  salesPayments,
  salesRewardPoints,
  salesTaxes,
} from "@/db/schema";
import {
  SALE_STATUS,
  SALE_TYPE,
  STOCK_TYPE,
  CASH_ADJUSTMENT,
  NEW_ITEM,
} from "@/lib/constants";
import { getConfig, getConfigBool, loadConfig, timezone } from "@/lib/config";
import { nowDb } from "@/lib/datetime";
import { bcAdd, bcMul, dec, toDbDecimal } from "@/lib/money";
import type { CartLine, SalePayment } from "./types";
import type { ItemTaxDetail, SaleTaxGroup } from "@/lib/tax";
import { lang } from "@/lib/i18n/lang";
import { getTaxes } from "@/lib/tax";

export const EMPTY_CART = -1;
export const INSUFFICIENT_GIFTCARD_BALANCE = -2;
export const INSUFFICIENT_REWARD_POINTS = -3;
export const INSUFFICIENT_STOCK = -4;

export interface CompleteSaleInput {
  cart: CartLine[];
  status: number;
  customerId: number | null;
  employeeId: number;
  comment: string;
  invoiceNumber: string | null;
  quoteNumber: string | null;
  workOrderNumber: string | null;
  saleType: number;
  payments: SalePayment[];
  dinnerTableId: number | null;
  saleId?: number;
  taxes?: SaleTaxGroup[];
  itemTaxes?: ItemTaxDetail[];
}

function characterLimiter(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const slice = value.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
}

async function customerExists(customerId: number | null): Promise<boolean> {
  if (customerId === null || customerId === NEW_ITEM) return false;
  const db = await getDb();
  const rows = await db
    .select({ personId: customers.personId })
    .from(customers)
    .where(eq(customers.personId, customerId))
    .limit(1);
  return rows.length === 1;
}

async function releaseDinnerTable(tx: Db, dinnerTableId: number | null): Promise<void> {
  if (dinnerTableId === null || dinnerTableId <= 2) return;
  await tx
    .update(dinnerTables)
    .set({ status: 0 })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId));
}

async function occupyDinnerTable(tx: Db, dinnerTableId: number | null): Promise<void> {
  if (dinnerTableId === null || dinnerTableId <= 2) return;
  await tx
    .update(dinnerTables)
    .set({ status: 1 })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId));
}

async function applyGiftcardPayment(
  tx: Db,
  giftcardNumber: string | null,
  amount: number,
  saleType: number,
  saleStatus: number,
): Promise<boolean> {
  const isReturnCredit = saleType === SALE_TYPE.RETURN && amount < 0;
  if (isReturnCredit && saleStatus !== SALE_STATUS.COMPLETED) return true;
  if (!giftcardNumber) return false;

  if (isReturnCredit) {
    if (amount >= 0) return false;
    const affected = await affectedRows(
      tx,
      sql`UPDATE ospos_giftcards SET value = value + ${Math.abs(amount)}
          WHERE giftcard_number = ${giftcardNumber} AND deleted = 0`,
    );
    return affected > 0;
  }
  if (amount <= 0) return false;
  const affected = await affectedRows(
    tx,
    sql`UPDATE ospos_giftcards SET value = value - ${amount}
        WHERE giftcard_number = ${giftcardNumber} AND deleted = 0 AND value >= ${amount}`,
  );
  return affected > 0;
}

async function adjustRewardPoints(tx: Db, customerId: number, delta: number): Promise<boolean> {
  const query =
    delta < 0
      ? sql`UPDATE ospos_customers SET points = points - ${Math.abs(delta)}
            WHERE person_id = ${customerId} AND points >= ${Math.abs(delta)}`
      : sql`UPDATE ospos_customers SET points = points + ${Math.abs(delta)}
            WHERE person_id = ${customerId}`;
  return (await affectedRows(tx, query)) > 0;
}

async function saveCustomerRewards(
  tx: Db,
  customerId: number | null,
  saleId: number,
  totalAmount: number,
  totalAmountUsed: number,
): Promise<void> {
  if (customerId === null || customerId === NEW_ITEM) return;
  if (!getConfigBool("customer_reward_enable", false)) return;
  const rows = await tx
    .select({ packageId: customers.packageId })
    .from(customers)
    .where(eq(customers.personId, customerId))
    .limit(1);
  const packageId = rows[0]?.packageId;
  if (packageId === null || packageId === undefined) return;
  const packageRows = await tx
    .select({ pointsPercent: customerPackages.pointsPercent })
    .from(customerPackages)
    .where(eq(customerPackages.packageId, packageId))
    .limit(1);
  const pointsPercent = packageRows[0]?.pointsPercent ?? 0;
  const earned = (totalAmount * pointsPercent) / 100;
  await adjustRewardPoints(tx, customerId, earned);
  await insertReturning(tx, salesRewardPoints, { saleId, earned, used: totalAmountUsed });
}

export async function clearSuspendedSaleDetail(
  tx: Awaited<ReturnType<typeof getDb>>,
  saleId: number,
): Promise<void> {
  if (getConfigBool("dinner_table_enable", false)) {
    const rows = await tx
      .select({ dinnerTableId: sales.dinnerTableId })
      .from(sales)
      .where(eq(sales.saleId, saleId))
      .limit(1);
    const tableId = rows[0]?.dinnerTableId ?? null;
    if (tableId !== null && tableId > 2) {
      await tx
        .update(dinnerTables)
        .set({ status: 0 })
        .where(eq(dinnerTables.dinnerTableId, tableId));
    }
  }
  await tx.delete(salesPayments).where(eq(salesPayments.saleId, saleId));
  await tx.delete(salesItemsTaxes).where(eq(salesItemsTaxes.saleId, saleId));
  await tx.delete(salesItems).where(eq(salesItems.saleId, saleId));
  await tx.delete(salesTaxes).where(eq(salesTaxes.saleId, saleId));
}

/** `Sale::save_value` — the central write transaction (O9). */
export async function saveSale(input: CompleteSaleInput): Promise<number> {
  await loadConfig();
  if (input.cart.length === 0) return EMPTY_CART;

  const customerId = (await customerExists(input.customerId)) ? input.customerId : null;
  const saleTime = nowDb(timezone());

  return withTransaction(async (tx) => {
    let saleId = input.saleId ?? -1;
    if (saleId !== -1) {
      await clearSuspendedSaleDetail(tx, saleId);
    }

    const header = {
      saleTime,
      customerId,
      employeeId: input.employeeId,
      comment: input.comment,
      saleStatus: input.status,
      invoiceNumber: input.invoiceNumber,
      quoteNumber: input.quoteNumber,
      workOrderNumber: input.workOrderNumber,
      dinnerTableId: input.dinnerTableId,
      saleType: input.saleType,
    };

    if (saleId === -1) {
      const inserted = await insertReturning(tx, sales, header, sales.saleId);
      const result = Array.isArray(inserted) ? inserted[0] : inserted;
      saleId = result.id;
    } else {
      await tx.update(sales).set(header).where(eq(sales.saleId, saleId));
    }

    let totalAmount = 0;
    let totalAmountUsed = 0;

    for (const payment of input.payments) {
      const [paymentPrefix, giftcardNumber] = payment.paymentType.split(":", 2);
      const amount = Number(payment.paymentAmount);
      if (paymentPrefix === lang("Sales.giftcard")) {
        const ok = await applyGiftcardPayment(
          tx,
          giftcardNumber ?? null,
          amount,
          input.saleType,
          input.status,
        );
        if (!ok) {
          throw new SaleSaveError(INSUFFICIENT_GIFTCARD_BALANCE);
        }
      } else if (paymentPrefix === lang("Sales.rewards")) {
        if (customerId === null || !(await adjustRewardPoints(tx, customerId, -amount))) {
          throw new SaleSaveError(INSUFFICIENT_REWARD_POINTS);
        }
        totalAmountUsed += amount;
      }

      await tx.insert(salesPayments).values({
        saleId,
        paymentType: payment.paymentType,
        paymentAmount: payment.paymentAmount,
        cashRefund: payment.cashRefund || "0",
        cashAdjustment: Boolean(payment.cashAdjustment),
        employeeId: input.employeeId,
        referenceCode: payment.referenceCode ?? "",
      });
      totalAmount += amount - Number(payment.cashRefund || 0);
    }

    await saveCustomerRewards(tx, customerId, saleId, totalAmount, totalAmountUsed);

    const taxIncluded = getConfigBool("tax_included", false);
    void taxIncluded;

    for (const line of input.cart) {
      const lineDiscount = dec(line.price).isZero() ? "0" : line.discount;
      await tx.insert(salesItems).values({
        saleId,
        itemId: line.itemId,
        line: line.line,
        description: characterLimiter(line.description ?? "", 255),
        serialnumber: characterLimiter(line.serialnumber ?? "", 30),
        quantityPurchased: toDbDecimal(line.quantity, 3),
        discount: toDbDecimal(lineDiscount, 2),
        discountType: line.discountType,
        itemCostPrice: toDbDecimal(line.costPrice, 2),
        itemUnitPrice: toDbDecimal(line.price, 2),
        itemLocation: line.itemLocation,
        printOption: line.printOption,
      });

      const itemRows = await tx
        .select({ stockType: items.stockType })
        .from(items)
        .where(eq(items.itemId, line.itemId))
        .limit(1);
      const stockType = itemRows[0]?.stockType;

      if (stockType === STOCK_TYPE.HAS_STOCK && input.status === SALE_STATUS.COMPLETED) {
        const delta = -Number(line.quantity);
        const affected = await affectedRows(
          tx,
          IS_SQLITE
            ? sql`INSERT INTO ospos_item_quantities (item_id, location_id, quantity)
                  VALUES (${line.itemId}, ${line.itemLocation}, ${delta})
                  ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = quantity + ${delta}`
            : sql`INSERT INTO ospos_item_quantities (item_id, location_id, quantity)
                  VALUES (${line.itemId}, ${line.itemLocation}, ${delta})
                  ON DUPLICATE KEY UPDATE quantity = quantity + ${delta}`,
        );
        if (affected === 0) throw new SaleSaveError(INSUFFICIENT_STOCK);

        if (Number(line.quantity) < 0) {
          await tx.update(items).set({ deleted: false }).where(eq(items.itemId, line.itemId));
        }

        await affectedRows(tx, sqliteOrMysqlInventory(tx, {
          transDate: nowDb(timezone()),
          transItems: line.itemId,
          transUser: input.employeeId,
          transLocation: line.itemLocation,
          transComment: `POS ${saleId}`,
          transInventory: toDbDecimal(bcMul(line.quantity, "-1"), 3),
        }));
      }

      await copyAttributeLinks(tx, line.itemId, saleId);
    }

    const customerTaxable = await isCustomerTaxable(tx, customerId);
    if (customerTaxable) {
      for (const tax of input.taxes ?? []) {
        await tx.insert(salesTaxes).values({
          saleId,
          jurisdictionId: tax.jurisdictionId,
          taxCategoryId: tax.taxCategoryId,
          taxType: tax.taxType,
          taxGroup: tax.taxGroup,
          saleTaxBasis: tax.saleTaxBasis,
          saleTaxAmount: tax.saleTaxAmount,
          printSequence: tax.printSequence,
          name: tax.name,
          taxRate: tax.taxRate,
          salesTaxCodeId: tax.salesTaxCodeId,
          roundingCode: tax.roundingCode,
        });
      }
      for (const tax of input.itemTaxes ?? []) {
        await tx.insert(salesItemsTaxes).values({
          saleId,
          itemId: tax.itemId,
          line: tax.line,
          name: tax.name,
          percent: tax.percent,
          taxType: tax.taxType,
          roundingCode: tax.roundingCode,
          cascadeSequence: tax.cascadeSequence,
          itemTaxAmount: tax.itemTaxAmount,
          salesTaxCodeId: tax.salesTaxCodeId,
          jurisdictionId: tax.jurisdictionId,
          taxCategoryId: tax.taxCategoryId,
        });
      }
    }

    if (getConfigBool("dinner_table_enable", false)) {
      if (input.status === SALE_STATUS.COMPLETED) {
        await releaseDinnerTable(tx, input.dinnerTableId);
      } else {
        await occupyDinnerTable(tx, input.dinnerTableId);
      }
    }

    return saleId;
  }).catch((error: unknown) => {
    if (error instanceof SaleSaveError) return error.code;
    throw error;
  });
}

class SaleSaveError extends Error {
  constructor(public readonly code: number) {
    super(`sale save sentinel ${code}`);
  }
}

async function isCustomerTaxable(
  tx: Awaited<ReturnType<typeof getDb>>,
  customerId: number | null,
): Promise<boolean> {
  if (customerId === null || customerId === NEW_ITEM) return true;
  const rows = await tx
    .select({ taxable: customers.taxable })
    .from(customers)
    .where(eq(customers.personId, customerId))
    .limit(1);
  return rows[0]?.taxable ?? false;
}

async function copyAttributeLinks(
  tx: Awaited<ReturnType<typeof getDb>>,
  itemId: number,
  saleId: number,
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
      .select({ definitionId: attributeLinks.definitionId })
      .from(attributeLinks)
      .where(
        and(
          eq(attributeLinks.definitionId, link.definitionId),
          eq(attributeLinks.saleId, saleId),
          eq(attributeLinks.itemId, itemId),
        ),
      )
      .limit(1);
    if (exists.length === 0) {
      await tx.insert(attributeLinks).values({
        attributeId: link.attributeId,
        definitionId: link.definitionId,
        itemId,
        saleId,
      });
    }
  }
}

function sqliteOrMysqlInventory(
  tx: Awaited<ReturnType<typeof getDb>>,
  data: {
    transDate: string;
    transItems: number;
    transUser: number;
    transLocation: number;
    transComment: string;
    transInventory: string;
  },
) {
  void tx;
  return sql`INSERT INTO ospos_inventory
    (trans_date, trans_items, trans_user, trans_location, trans_comment, trans_inventory)
    VALUES (${data.transDate}, ${data.transItems}, ${data.transUser}, ${data.transLocation}, ${data.transComment}, ${data.transInventory})`;
}

export async function completeSale(input: CompleteSaleInput): Promise<number> {
  return saveSale(input);
}

export async function suspendSale(input: CompleteSaleInput): Promise<number> {
  return saveSale(input);
}

export interface SuspendedSale {
  saleId: number;
  docId: string;
  saleStatus: number;
  saleTime: string;
  dinnerTableId: number | null;
  customerId: number | null;
  employeeId: number;
  comment: string;
}

/** `Sale::get_all_suspended`; `undefined`/`-1` means all customers. */
export async function getAllSuspended(customerId?: number): Promise<SuspendedSale[]> {
  const db = await getDb();
  const conditions = [eq(sales.saleStatus, SALE_STATUS.SUSPENDED)];
  if (customerId !== undefined && customerId !== NEW_ITEM) {
    conditions.push(eq(sales.customerId, customerId));
  }
  const rows = await db
    .select()
    .from(sales)
    .where(and(...conditions))
    .orderBy(desc(sales.saleId));
  return rows.map((row) => ({
    saleId: row.saleId,
    docId:
      row.saleType === SALE_TYPE.QUOTE
        ? (row.quoteNumber ?? String(row.saleId))
        : row.saleType === SALE_TYPE.WORK_ORDER
          ? (row.workOrderNumber ?? String(row.saleId))
          : String(row.saleId),
    saleStatus: row.saleStatus,
    saleTime: row.saleTime,
    dinnerTableId: row.dinnerTableId,
    customerId: row.customerId,
    employeeId: row.employeeId,
    comment: row.comment,
  }));
}

export async function getSuspendedSales(): Promise<SuspendedSale[]> {
  return getAllSuspended(undefined);
}

export async function getSuspendedSaleInfo(saleId: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.saleId, saleId), eq(sales.saleStatus, SALE_STATUS.SUSPENDED)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSale(saleId: number) {
  const db = await getDb();
  const rows = await db.select().from(sales).where(eq(sales.saleId, saleId)).limit(1);
  return rows[0] ?? null;
}

export async function getSaleItems(saleId: number) {
  const db = await getDb();
  return db.select().from(salesItems).where(eq(salesItems.saleId, saleId));
}

export async function getSaleItemsOrdered(saleId: number) {
  const db = await getDb();
  return db
    .select({
      saleItem: salesItems,
      name: items.name,
      category: items.category,
      itemType: items.itemType,
      stockType: items.stockType,
    })
    .from(salesItems)
    .innerJoin(items, eq(items.itemId, salesItems.itemId))
    .where(eq(salesItems.saleId, saleId))
    .orderBy(asc(salesItems.line));
}

export async function getSalePayments(saleId: number) {
  const db = await getDb();
  return db
    .select()
    .from(salesPayments)
    .where(eq(salesPayments.saleId, saleId))
    .orderBy(asc(salesPayments.paymentId));
}

export async function getSaleTaxes(saleId: number) {
  const db = await getDb();
  return db
    .select()
    .from(salesTaxes)
    .where(eq(salesTaxes.saleId, saleId))
    .orderBy(asc(salesTaxes.printSequence));
}

export async function getSaleItemTaxes(saleId: number, itemId?: number) {
  const db = await getDb();
  const conditions = [eq(salesItemsTaxes.saleId, saleId)];
  if (itemId !== undefined) conditions.push(eq(salesItemsTaxes.itemId, itemId));
  return db.select().from(salesItemsTaxes).where(and(...conditions));
}

export async function getInvoiceCount(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(sales)
    .where(isNotNull(sales.invoiceNumber));
  return Number(rows[0]?.value ?? 0);
}

export async function getSuspendedInvoiceCount(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(sales)
    .where(and(isNotNull(sales.invoiceNumber), eq(sales.saleStatus, SALE_STATUS.SUSPENDED)));
  return Number(rows[0]?.value ?? 0);
}

function yearExpression(year: string) {
  return IS_SQLITE
    ? sql`strftime('%Y', ${sales.saleTime}) = ${year}`
    : sql`DATE_FORMAT(${sales.saleTime}, '%Y') = ${year}`;
}

export async function getInvoiceNumberForYear(
  year = String(new Date().getFullYear()),
  startFrom = 0,
): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(sales)
    .where(and(isNotNull(sales.invoiceNumber), yearExpression(year)));
  return startFrom + Number(rows[0]?.value ?? 0);
}

export async function getQuoteNumberForYear(
  year = String(new Date().getFullYear()),
  startFrom = 0,
): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(sales)
    .where(and(isNotNull(sales.quoteNumber), yearExpression(year)));
  return startFrom + Number(rows[0]?.value ?? 0);
}

export async function getSaleByInvoiceNumber(invoiceNumber: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(sales)
    .where(eq(sales.invoiceNumber, invoiceNumber))
    .limit(1);
  return rows[0] ?? null;
}

export async function checkInvoiceNumberExists(
  invoiceNumber: string,
  excludeSaleId: number | null = null,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ saleId: sales.saleId })
    .from(sales)
    .where(eq(sales.invoiceNumber, invoiceNumber));
  return rows.some((row) => row.saleId !== excludeSaleId);
}

export async function checkQuoteNumberExists(
  quoteNumber: string,
  excludeSaleId: number | null = null,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ saleId: sales.saleId })
    .from(sales)
    .where(eq(sales.quoteNumber, quoteNumber));
  return rows.some((row) => row.saleId !== excludeSaleId);
}

export async function checkWorkOrderNumberExists(
  workOrderNumber: string,
  excludeSaleId: number | null = null,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ saleId: sales.saleId })
    .from(sales)
    .where(eq(sales.workOrderNumber, workOrderNumber));
  return rows.some((row) => row.saleId !== excludeSaleId);
}

export async function updateSaleStatus(saleId: number, status: number): Promise<void> {
  const db = await getDb();
  await db.update(sales).set({ saleStatus: status }).where(eq(sales.saleId, saleId));
}

export async function cancelSale(
  saleId: number,
  employeeId: number,
  updateInventory = true,
): Promise<void> {
  const db = await getDb();
  const sale = await getSale(saleId);
  if (!sale) return;
  if (updateInventory && sale.saleStatus === SALE_STATUS.COMPLETED) {
    const lines = await getSaleItems(saleId);
    const transDate = nowDb(timezone());
    for (const line of lines) {
      const itemRows = await db
        .select({ stockType: items.stockType })
        .from(items)
        .where(eq(items.itemId, line.itemId))
        .limit(1);
      if (itemRows[0]?.stockType !== STOCK_TYPE.HAS_STOCK) continue;
      await affectedRows(db, sqliteOrMysqlInventory(db, {
        transDate,
        transItems: line.itemId,
        transUser: employeeId,
        transLocation: line.itemLocation,
        transComment: `Deleting sale ${saleId}`,
        transInventory: toDbDecimal(line.quantityPurchased, 3),
      }));
      const restoreDelta = Number(line.quantityPurchased);
      await affectedRows(
        db,
        IS_SQLITE
          ? sql`INSERT INTO ospos_item_quantities (item_id, location_id, quantity)
                VALUES (${line.itemId}, ${line.itemLocation}, ${restoreDelta})
                ON CONFLICT(item_id, location_id) DO UPDATE SET quantity = quantity + ${restoreDelta}`
          : sql`INSERT INTO ospos_item_quantities (item_id, location_id, quantity)
                VALUES (${line.itemId}, ${line.itemLocation}, ${restoreDelta})
                ON DUPLICATE KEY UPDATE quantity = quantity + ${restoreDelta}`,
      );
    }
  }
  await updateSaleStatus(saleId, SALE_STATUS.CANCELED);
}

export async function restoreSale(saleId: number): Promise<void> {
  await updateSaleStatus(saleId, SALE_STATUS.SUSPENDED);
}

export async function deleteSuspendedSale(saleId: number): Promise<void> {
  if (getConfigBool("dinner_table_enable", false)) {
    const sale = await getSale(saleId);
    const db = await getDb();
    await releaseDinnerTable(db, sale?.dinnerTableId ?? null);
  }
  await updateSaleStatus(saleId, SALE_STATUS.CANCELED);
}

/** `Sale::get_payment_options` — localized types, giftcard/rewards/deposits. */
export async function getPaymentOptions(
  giftcard = true,
  rewardPoints = true,
  mode?: string,
): Promise<string[]> {
  const order = getConfig("payment_options_order", "cashdebitcredit");
  const cash = lang("Sales.cash");
  const debit = lang("Sales.debit");
  const credit = lang("Sales.credit");
  const base: string[] = [];
  switch (order) {
    case "debitcreditcash":
      base.push(debit, credit, cash);
      break;
    case "debitcashcredit":
      base.push(debit, cash, credit);
      break;
    case "creditdebitcash":
      base.push(credit, debit, cash);
      break;
    case "creditcashdebit":
      base.push(credit, cash, debit);
      break;
    default:
      base.push(cash, debit, credit);
  }
  base.push(lang("Sales.due"), lang("Sales.check"));
  if (getConfig("country_codes", "").toLowerCase().includes("in")) {
    base.push(lang("Sales.upi"));
  }
  base.push(lang("Sales.bank_transfer"), lang("Sales.wallet"));
  if (giftcard) base.push(lang("Sales.giftcard"));
  if (rewardPoints) base.push(lang("Sales.rewards"));
  if ((mode ?? (await getRegisterMode())) === "sale_work_order") {
    base.push(lang("Sales.cash_deposit"), lang("Sales.credit_deposit"));
  }
  return Array.from(new Set(base));
}

async function getRegisterMode(): Promise<string> {
  const { getSessionData } = await import("@/lib/session");
  const data = await getSessionData().catch(() => ({} as Record<string, unknown>));
  return typeof data.sales_mode === "string" ? data.sales_mode : "sale";
}

/** `Sale::isValidReceipt` — `POS #` or an existing invoice number. */
export async function isValidReceipt(
  receipt: string | null,
): Promise<{ type: "RECV" | "POS" | "ITEM"; id: number } | null> {
  if (!receipt) return null;
  const trimmed = receipt.trim();
  const pieces = trimmed.split(" ");
  if (pieces.length === 2 && pieces[0].toUpperCase() === "POS" && /^\d+$/.test(pieces[1])) {
    const sale = await getSale(Number(pieces[1]));
    return sale ? { type: "POS", id: Number(pieces[1]) } : null;
  }
  if (getConfigBool("invoice_enable", true)) {
    const sale = await getSaleByInvoiceNumber(trimmed);
    if (sale) return { type: "POS", id: sale.saleId };
  }
  return null;
}

export async function copySaleToCart(saleId: number) {
  const sale = await getSale(saleId);
  if (!sale) return null;
  const lines = await getSaleItems(saleId);
  const payments = await getSalePayments(saleId);
  return { sale, lines, payments };
}

void gte;
void inArray;
void like;
void or;
void employees;
void people;
void bcAdd;
void getTaxes;
