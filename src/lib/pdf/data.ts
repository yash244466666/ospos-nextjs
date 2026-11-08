import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people, customers, items } from "@/db/schema";
import { getSale, getSaleItems, getSalePayments, getSaleTaxes } from "@/lib/sale/sale-model";
import { dateFormat, getConfig, getConfigBool, loadConfig, timeFormat } from "@/lib/config";
import { getItemDiscount, getItemTotal } from "@/lib/sale/types";
import { formatDb } from "@/lib/datetime";
import { abs, bcMul, bcSum, dec } from "@/lib/money";
import type { ReceiptData } from "./receipt";

export async function buildReceiptData(saleId: number): Promise<ReceiptData | null> {
  await loadConfig();
  const sale = await getSale(saleId);
  if (!sale) return null;
  const saleItems = await getSaleItems(saleId);
  const payments = await getSalePayments(saleId);
  const taxes = await getSaleTaxes(saleId);
  const db = await getDb();
  let customerName = "Walk-in";
  if (sale.customerId) {
    const rows = await db
      .select({ first: people.firstName, last: people.lastName, company: customers.companyName })
      .from(customers)
      .innerJoin(people, eq(people.personId, customers.personId))
      .where(eq(customers.personId, sale.customerId))
      .limit(1);
    const c = rows[0];
    if (c) customerName = c.company || `${c.first} ${c.last}`.trim();
  }
  const itemRows = await db
    .select({ itemId: items.itemId, name: items.name, itemNumber: items.itemNumber })
    .from(items);
  const itemById = new Map(itemRows.map((item) => [item.itemId, item]));

  let base = "0";
  let includedTax = "0";
  let excludedTax = "0";
  for (const item of saleItems) {
    base = bcSum([base, getItemTotal(item.quantityPurchased, item.itemUnitPrice, item.discount, item.discountType, true)]).toFixed();
  }
  for (const tax of taxes) {
    if (tax.taxType === 0) includedTax = bcSum([includedTax, tax.saleTaxAmount]).toFixed();
    else excludedTax = bcSum([excludedTax, tax.saleTaxAmount]).toFixed();
  }
  const taxIncluded = getConfigBool("tax_included", false);
  const subtotal = taxIncluded ? Number(base) - Number(includedTax) : Number(base);
  const total = taxIncluded ? Number(base) : Number(base) + Number(excludedTax);
  const paid = Number(
    bcSum(
      payments
        .filter((payment) => !payment.cashAdjustment)
        .map((payment) => bcSum([payment.paymentAmount, bcMul(payment.cashRefund, "-1")])),
    ).toFixed(),
  );

  return {
    company: getConfig("company", ""),
    address: getConfig("address", ""),
    phone: getConfig("phone", ""),
    saleId: sale.saleId,
    saleTime: sale.saleTime ? formatDb(sale.saleTime, `${dateFormat()} ${timeFormat()}`) : "",
    customerName,
    lines: saleItems.map((it) => {
      const item = itemById.get(it.itemId);
      return {
        name: item?.name ?? it.description ?? "",
        description: it.description ?? "",
        serialnumber: it.serialnumber ?? "",
        itemNumber: item?.itemNumber ?? "",
        quantity: Number(it.quantityPurchased),
        unitPrice: Number(it.itemUnitPrice),
        discount: Number(getItemDiscount(it.quantityPurchased, it.itemUnitPrice, it.discount, it.discountType)),
        total: Number(getItemTotal(it.quantityPurchased, it.itemUnitPrice, it.discount, it.discountType, true)),
      };
    }),
    taxes: taxes.map((tax) => ({
      name: tax.taxGroup,
      amount: Number(tax.saleTaxAmount),
      taxType: tax.taxType,
    })),
    subtotal,
    total,
    payments: payments.map((payment) => ({
      type: payment.paymentType,
      amount: -Number(bcSum([payment.paymentAmount, bcMul(payment.cashRefund, "-1")])),
    })),
    change: paid - total,
  };
}
