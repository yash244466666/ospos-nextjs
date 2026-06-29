import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { people, customers } from "@/db/schema";
import { getSale, getSaleItems, getSalePayments, getSaleTaxes } from "@/lib/sale/sale-model";
import { getConfig } from "@/lib/config";
import type { ReceiptData } from "./receipt";

export function buildReceiptData(saleId: number): ReceiptData | null {
  const sale = getSale(saleId);
  if (!sale) return null;
  const items = getSaleItems(saleId);
  const payments = getSalePayments(saleId);
  const taxes = getSaleTaxes(saleId);
  const db = getDbSync();
  let customerName = "Walk-in";
  if (sale.customerId) {
    const c = db.select({ first: people.firstName, last: people.lastName, company: customers.companyName })
      .from(customers).innerJoin(people, eq(people.personId, customers.personId))
      .where(eq(customers.personId, sale.customerId)).get();
    if (c) customerName = c.company || `${c.first} ${c.last ?? ""}`.trim();
  }
  const total = items.reduce((s, i) => s + i.itemUnitPrice * Math.abs(i.quantityPurchased), 0);
  const paid = payments.reduce((s, p) => s + p.paymentAmount, 0);
  return {
    company: getConfig("company", ""),
    address: getConfig("address", ""),
    phone: getConfig("phone", ""),
    saleId: sale.saleId,
    saleTime: sale.saleTime ? new Date(sale.saleTime * 1000).toLocaleString() : "",
    customerName,
    lines: items.map((it) => ({
      description: it.description ?? "",
      quantity: Math.abs(it.quantityPurchased),
      unitPrice: it.itemUnitPrice,
    })),
    taxes: taxes.map((t) => ({ name: t.taxGroup, amount: t.saleTaxAmount })),
    total,
    payments: payments.map((p) => ({ type: p.paymentType, amount: p.paymentAmount })),
    change: paid - total,
  };
}