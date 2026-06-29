import { and, eq, isNotNull, sql, desc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { sales, salesItems, salesItemsTaxes, salesTaxes, salesPayments, inventory, itemQuantities, dinnerTables } from "@/db/schema";
import { SALE_STATUS, SALE_TYPE } from "@/lib/constants";
import { render } from "@/lib/token";
import { getConfig } from "@/lib/config";
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

export async function completeSale(input: CompleteSaleInput): Promise<{ saleId: number; invoiceNumber: string | null }> {
  const db = getDbSync();
  const { cart, taxes, itemTaxes, saleStatus, employeeId, subtotal, total, taxTotal } = input;

  let invoiceNumber: string | null = null;
  let quoteNumber: string | null = null;
  let workOrderNumber: string | null = null;

  if (cart.mode === "sale_invoice" && saleStatus === SALE_STATUS.COMPLETED) {
    invoiceNumber = cart.invoiceNumber || await render(getConfig("sales_invoice_format", "{CO}"), { save: true });
  } else if (cart.mode === "sale_quote") {
    quoteNumber = cart.quoteNumber || `Q-${Date.now()}`;
  } else if (cart.mode === "sale_work_order") {
    workOrderNumber = cart.workOrderNumber || `WO-${Date.now()}`;
  }

  return db.transaction((tx) => {
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
    const inserted = tx.insert(sales).values(saleInsert).returning({ id: sales.saleId }).get();
    const saleId = inserted.id;

    for (const payment of cart.payments) {
      tx.insert(salesPayments).values({
        saleId,
        paymentType: payment.paymentType,
        paymentAmount: payment.paymentAmount,
        cashRefund: payment.cashRefund,
        cashAdjustment: payment.cashAdjustment,
        employeeId,
      }).run();
    }

    for (const line of cart.cart) {
      tx.insert(salesItems).values({
        saleId,
        itemId: line.itemId,
        line: line.line,
        description: line.description,
        serialnumber: line.serialnumber,
        quantityPurchased: cart.mode === "return" ? -line.quantity : line.quantity,
        discount: line.discount,
        discountType: line.discountType,
        itemCostPrice: line.costPrice,
        itemUnitPrice: line.price,
        itemLocation: line.itemLocation,
        printOption: line.printOption,
      }).run();

      if (saleStatus === SALE_STATUS.COMPLETED) {
        const existing = tx.select().from(itemQuantities)
          .where(and(eq(itemQuantities.itemId, line.itemId), eq(itemQuantities.locationId, line.itemLocation)))
          .get();
        const delta = cart.mode === "return" ? line.quantity : -line.quantity;
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
          transComment: cart.mode === "return" ? "Return of sale" : "Sale",
        }).run();
      }
    }

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

    if (cart.dinnerTableId && saleStatus === SALE_STATUS.COMPLETED) {
      tx.update(dinnerTables).set({ status: 0 }).where(eq(dinnerTables.dinnerTableId, cart.dinnerTableId)).run();
    }

    void subtotal;
    void total;
    void taxTotal;

    return { saleId, invoiceNumber };
  });
}

export async function suspendSale(input: CompleteSaleInput): Promise<number> {
  return (await completeSale({ ...input, saleStatus: SALE_STATUS.SUSPENDED })).saleId;
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

export function getSalePayments(saleId: number) {
  const db = getDbSync();
  return db.select().from(salesPayments).where(eq(salesPayments.saleId, saleId)).all();
}

export function getSaleTaxes(saleId: number) {
  const db = getDbSync();
  return db.select().from(salesTaxes).where(eq(salesTaxes.saleId, saleId)).all();
}

export function getInvoiceCount(): number {
  const db = getDbSync();
  const row = db.select({ c: sql<number>`count(*)` })
    .from(sales)
    .where(isNotNull(sales.invoiceNumber))
    .get();
  return row?.c ?? 0;
}

export function cancelSale(saleId: number, employeeId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const sale = tx.select().from(sales).where(eq(sales.saleId, saleId)).get();
    if (!sale) throw new Error("Sale not found");
    if (sale.saleStatus === SALE_STATUS.COMPLETED) {
      tx.update(sales).set({ saleStatus: SALE_STATUS.CANCELED }).where(eq(sales.saleId, saleId)).run();
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
          transComment: "Cancelled sale",
        }).run();
      }
    } else {
      tx.delete(sales).where(eq(sales.saleId, saleId)).run();
    }
  });
}

export function copySaleToCart(saleId: number): { items: CartLine[]; payments: SalePayment[]; saleType: number } {
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
    description: r.description ?? "",
    serialnumber: r.serialnumber ?? "",
    quantity: Math.abs(r.quantityPurchased),
    discount: r.discount,
    discountType: r.discountType,
    price: r.itemUnitPrice,
    costPrice: r.itemCostPrice,
    stockType: 0,
    taxCategoryId: null,
    taxedFlag: "",
    printOption: r.printOption,
    isSerialized: false,
    total: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
    discountedTotal: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
  }));
  const payments: SalePayment[] = paymentsRows.map((p) => ({
    paymentId: `${p.paymentType}-${p.paymentTime}`,
    paymentType: p.paymentType,
    paymentAmount: p.paymentAmount,
    cashRefund: p.cashRefund,
    cashAdjustment: p.cashAdjustment,
  }));
  return { items: cart, payments, saleType: sale?.saleType ?? SALE_TYPE.POS };
}

void getInvoiceCount;