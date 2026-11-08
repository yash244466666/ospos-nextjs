import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people, customers, items } from "@/db/schema";
import {
  getSale,
  getSaleItemTaxes,
  getSaleItems,
  getSalePayments,
  getSaleTaxes,
} from "@/lib/sale/sale-model";
import { dateFormat, getConfig, getConfigBool, getConfigNumber, loadConfig, timeFormat } from "@/lib/config";
import { getItemDiscount, getItemTotal } from "@/lib/sale/types";
import { formatDb } from "@/lib/datetime";
import { bcMul, bcSub, bcSum, dec } from "@/lib/money";
import type { ReceiptData } from "./receipt";

export interface DocumentFlags {
  showCompanyName: boolean;
  showDescription: boolean;
  showSerialnumber: boolean;
  showTaxes: boolean;
  showTaxInd: boolean;
  showTotalDiscount: boolean;
  template: string;
  receiptFontSize: number;
  companyLogo: string;
  printFooter: string;
  invoiceDefaultComments: string;
}

export interface DocumentLine {
  line: number;
  name: string;
  description: string;
  serialnumber: string;
  itemNumber: string;
  attributeValues: string;
  price: string;
  quantity: string;
  total: string;
  discountedTotal: string;
  discount: string;
  discountType: number;
  taxedFlag: string;
  printOption: number;
}

export interface DocumentTax {
  name: string;
  rate: string;
  amount: string;
  taxType: number;
}

export interface DocumentPayment {
  type: string;
  amount: string;
  referenceCode: string;
}

/** Fields the OSPOS receipt/invoice/quote/work-order views consume. */
export interface SaleDocumentData {
  saleId: number;
  invoiceNumber: string | null;
  quoteNumber: string | null;
  workOrderNumber: string | null;
  saleStatus: number;
  saleType: number;
  saleTime: string;
  employeeName: string;
  customerName: string;
  customerAddress: string;
  customerTaxId: string;
  comment: string;
  lines: DocumentLine[];
  taxes: DocumentTax[];
  prediscountSubtotal: string;
  subtotal: string;
  discountTotal: string;
  total: string;
  amountDue: string;
  change: string;
  payments: DocumentPayment[];
  flags: DocumentFlags;
}

function moneyString(value: string, decimals: number): string {
  return dec(value).toFixed(decimals);
}

export async function buildSaleDocumentData(saleId: number): Promise<SaleDocumentData | null> {
  await loadConfig();
  const sale = await getSale(saleId);
  if (!sale) return null;
  const saleItems = await getSaleItems(saleId);
  const payments = await getSalePayments(saleId);
  const taxes = await getSaleTaxes(saleId);
  const itemTaxes = await getSaleItemTaxes(saleId);
  const taxedLines = new Set(itemTaxes.map((tax) => `${tax.itemId}:${tax.line}`));
  const db = await getDb();

  let customerName = "";
  let customerAddress = "";
  let customerTaxId = "";
  if (sale.customerId) {
    const rows = await db
      .select({
        first: people.firstName,
        last: people.lastName,
        address1: people.address1,
        address2: people.address2,
        city: people.city,
        state: people.state,
        zip: people.zip,
        company: customers.companyName,
        taxId: customers.taxId,
      })
      .from(customers)
      .innerJoin(people, eq(people.personId, customers.personId))
      .where(eq(customers.personId, sale.customerId))
      .limit(1);
    const c = rows[0];
    if (c) {
      customerName = c.company || `${c.first} ${c.last}`.trim();
      customerAddress = [c.address1, c.address2, c.city, c.state, c.zip]
        .filter((part) => part && part.length > 0)
        .join("\n");
      customerTaxId = c.taxId ?? "";
    }
  }

  let employeeName = "";
  if (sale.employeeId) {
    const rows = await db
      .select({ first: people.firstName, last: people.lastName })
      .from(people)
      .where(eq(people.personId, sale.employeeId))
      .limit(1);
    const e = rows[0];
    if (e) employeeName = `${e.first} ${(e.last ?? "").slice(0, 1)}`.trim();
  }

  const itemRows = await db
    .select({ itemId: items.itemId, name: items.name, itemNumber: items.itemNumber })
    .from(items);
  const itemById = new Map(itemRows.map((item) => [item.itemId, item]));

  const totalsDecimals = getConfigNumber("currency_decimals", 2) + getConfigNumber("tax_decimals", 2);
  let prediscount = "0";
  let subtotal = "0";
  let discountTotal = "0";
  let includedTax = "0";
  let excludedTax = "0";

  for (const item of saleItems) {
    const gross = getItemTotal(
      item.quantityPurchased,
      item.itemUnitPrice,
      item.discount,
      item.discountType,
      false,
    );
    const net = getItemTotal(
      item.quantityPurchased,
      item.itemUnitPrice,
      item.discount,
      item.discountType,
      true,
    );
    const discount = getItemDiscount(
      item.quantityPurchased,
      item.itemUnitPrice,
      item.discount,
      item.discountType,
    );
    prediscount = bcSum([prediscount, gross]).toFixed();
    subtotal = bcSum([subtotal, net]).toFixed();
    discountTotal = bcSum([discountTotal, discount]).toFixed();
  }

  for (const tax of taxes) {
    if (tax.taxType === 0) includedTax = bcSum([includedTax, tax.saleTaxAmount]).toFixed();
    else excludedTax = bcSum([excludedTax, tax.saleTaxAmount]).toFixed();
  }

  // Sale_lib::get_totals: subtotal excludes included tax; total adds excluded tax.
  const subtotalNet = bcSub(subtotal, includedTax).toFixed();
  const total = bcSum([subtotalNet, excludedTax]).toFixed();

  const paid = bcSum(
    payments
      .filter((payment) => !payment.cashAdjustment)
      .map((payment) => bcSum([payment.paymentAmount, bcMul(payment.cashRefund, "-1")])),
  ).toFixed();
  const amountDue = bcSub(total, paid).toFixed();
  const change = bcMul(amountDue, "-1").toFixed();

  const document: SaleDocumentData = {
    saleId: sale.saleId,
    invoiceNumber: sale.invoiceNumber,
    quoteNumber: sale.quoteNumber,
    workOrderNumber: sale.workOrderNumber,
    saleStatus: sale.saleStatus,
    saleType: sale.saleType,
    saleTime: sale.saleTime
      ? formatDb(sale.saleTime, `${dateFormat()} ${timeFormat()}`)
      : "",
    employeeName,
    customerName,
    customerAddress,
    customerTaxId,
    comment: sale.comment ?? "",
    lines: saleItems.map((item) => {
      const itemInfo = itemById.get(item.itemId);
      return {
        line: item.line,
        name: itemInfo?.name ?? item.description ?? "",
        description: item.description ?? "",
        serialnumber: item.serialnumber ?? "",
        itemNumber: itemInfo?.itemNumber ?? "",
        attributeValues: "",
        price: moneyString(item.itemUnitPrice, 2),
        quantity: dec(item.quantityPurchased).toFixed(3),
        total: moneyString(
          getItemTotal(item.quantityPurchased, item.itemUnitPrice, item.discount, item.discountType, false),
          totalsDecimals,
        ),
        discountedTotal: moneyString(
          getItemTotal(item.quantityPurchased, item.itemUnitPrice, item.discount, item.discountType, true),
          totalsDecimals,
        ),
        discount: moneyString(
          getItemDiscount(item.quantityPurchased, item.itemUnitPrice, item.discount, item.discountType),
          totalsDecimals,
        ),
        discountType: item.discountType,
        taxedFlag: taxedLines.has(`${item.itemId}:${item.line}`) ? "T" : "F",
        printOption: item.printOption ?? 0,
      };
    }),
    taxes: taxes.map((tax) => ({
      name: tax.taxGroup || tax.name,
      rate: dec(tax.taxRate ?? "0").toFixed(2),
      amount: moneyString(tax.saleTaxAmount, totalsDecimals),
      taxType: tax.taxType,
    })),
    prediscountSubtotal: moneyString(prediscount, totalsDecimals),
    subtotal: moneyString(subtotalNet, totalsDecimals),
    discountTotal: moneyString(discountTotal, totalsDecimals),
    total: moneyString(total, totalsDecimals),
    amountDue: moneyString(amountDue, totalsDecimals),
    change: moneyString(change, totalsDecimals),
    // The upstream receipt prints `payment_amount * -1` (quirk kept for parity)
    // and splits `Gift Card:1234` to show only the payment type.
    payments: payments.map((payment) => ({
      type: payment.paymentType.split(":")[0] ?? payment.paymentType,
      amount: moneyString(payment.paymentAmount, totalsDecimals),
      referenceCode: payment.referenceCode ?? "",
    })),
    flags: {
      showCompanyName: getConfigBool("receipt_show_company_name", false),
      showDescription: getConfigBool("receipt_show_description", true),
      showSerialnumber: getConfigBool("receipt_show_serialnumber", true),
      showTaxes: getConfigBool("receipt_show_taxes", false),
      showTaxInd: getConfigBool("receipt_show_tax_ind", false),
      showTotalDiscount: getConfigBool("receipt_show_total_discount", false),
      template: getConfig("receipt_template", "receipt_default"),
      receiptFontSize: getConfigNumber("receipt_font_size", 14),
      companyLogo: getConfig("company_logo", ""),
      printFooter: getConfig("print_footer", ""),
      invoiceDefaultComments: getConfig("invoice_default_comments", ""),
    },
  };
  return document;
}

/**
 * Legacy shape consumed by the @react-pdf documents. Kept in sync with
 * `buildSaleDocumentData` so the HTML and PDF renderers agree.
 */
export async function buildReceiptData(saleId: number): Promise<ReceiptData | null> {
  const document = await buildSaleDocumentData(saleId);
  if (!document) return null;
  return {
    company: getConfig("company", ""),
    address: getConfig("address", ""),
    phone: getConfig("phone", ""),
    saleId: document.saleId,
    saleTime: document.saleTime,
    customerName: document.customerName || "Walk-in",
    lines: document.lines.map((line) => ({
      name: line.name,
      description: line.description,
      itemNumber: line.itemNumber,
      serialnumber: line.serialnumber,
      quantity: Number(line.quantity),
      unitPrice: Number(line.price),
      discount: Number(line.discount),
      total: Number(line.discountedTotal),
      taxedFlag: line.taxedFlag,
    })),
    taxes: document.taxes.map((tax) => ({
      name: tax.name,
      amount: Number(tax.amount),
      taxType: tax.taxType,
    })),
    subtotal: Number(document.subtotal),
    total: Number(document.total),
    payments: document.payments.map((payment) => ({
      type: payment.type,
      amount: -Number(payment.amount),
    })),
    change: Number(document.change),
  };
}
