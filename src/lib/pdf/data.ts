import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people, customers } from "@/db/schema";
import { getSale, getSaleItems, getSalePayments, getSaleTaxes } from "@/lib/sale/sale-model";
import { dateFormat, getConfig, loadConfig, timeFormat } from "@/lib/config";
import { formatDb } from "@/lib/datetime";
import { abs, bcMul, bcSum } from "@/lib/money";
import type { ReceiptData } from "./receipt";

export async function buildReceiptData(saleId: number): Promise<ReceiptData | null> {
  await loadConfig();
  const sale = await getSale(saleId);
  if (!sale) return null;
  const items = await getSaleItems(saleId);
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
  const total = Number(
    bcSum(items.map((i) => bcMul(i.itemUnitPrice, abs(i.quantityPurchased)))).toFixed(),
  );
  const paid = Number(bcSum(payments.map((p) => p.paymentAmount)).toFixed());
  return {
    company: getConfig("company", ""),
    address: getConfig("address", ""),
    phone: getConfig("phone", ""),
    saleId: sale.saleId,
    saleTime: sale.saleTime ? formatDb(sale.saleTime, `${dateFormat()} ${timeFormat()}`) : "",
    customerName,
    lines: items.map((it) => ({
      description: it.description ?? "",
      quantity: Number(abs(it.quantityPurchased)),
      unitPrice: Number(it.itemUnitPrice),
    })),
    taxes: taxes.map((t) => ({ name: t.taxGroup, amount: Number(t.saleTaxAmount) })),
    total,
    payments: payments.map((p) => ({ type: p.paymentType, amount: Number(p.paymentAmount) })),
    change: paid - total,
  };
}
