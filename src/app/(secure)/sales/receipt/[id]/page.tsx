import { requirePermission } from "@/lib/auth/with-permission";
import { getSale, getSaleItems, getSalePayments, getSaleTaxes } from "@/lib/sale/sale-model";
import { getConfig } from "@/lib/config";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { people, customers } from "@/db/schema";
import Link from "next/link";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("sales");
  const { id } = await params;
  const saleId = parseInt(id, 10);
  const sale = getSale(saleId);
  if (!sale) return <div className="p-4">Sale not found</div>;
  const items = getSaleItems(saleId);
  const payments = getSalePayments(saleId);
  const taxes = getSaleTaxes(saleId);
  const db = getDbSync();
  let customerName = "Walk-in";
  if (sale.customerId) {
    const c = db.select({ first: people.firstName, last: people.lastName, company: customers.companyName })
      .from(customers).innerJoin(people, eq(people.personId, customers.personId))
      .where(eq(customers.personId, sale.customerId)).get();
    if (c) customerName = c.company || `${c.first} ${c.last}`.trim();
  }
  const total = items.reduce((s, i) => s + i.itemUnitPrice * Math.abs(i.quantityPurchased), 0);
  const paid = payments.reduce((s, p) => s + p.paymentAmount, 0);
  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="text-center mb-2">
        <div className="font-bold">{getConfig("company", "")}</div>
        <div className="text-sm">{getConfig("address", "")}</div>
        <div className="text-sm">{getConfig("phone", "")}</div>
      </div>
      <div className="text-sm mb-2">
        <div>Receipt #{sale.saleId}</div>
        <div>Date: {sale.saleTime ? new Date(sale.saleTime * 1000).toLocaleString() : ""}</div>
        <div>Customer: {customerName}</div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.itemId}-${it.line}-${i}`}>
              <td className="py-1">{it.description} × {Math.abs(it.quantityPurchased)}</td>
              <td className="py-1 text-right">{(it.itemUnitPrice * Math.abs(it.quantityPurchased)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t mt-2 pt-2 text-sm">
        {taxes.map((t, i) => (
          <div key={`${t.taxGroup}-${i}`} className="flex justify-between"><span>Tax {t.taxGroup}</span><span>{t.saleTaxAmount.toFixed(2)}</span></div>
        ))}
        <div className="flex justify-between font-bold"><span>Total</span><span>{total.toFixed(2)}</span></div>
        {payments.map((p, i) => (
          <div key={`${p.paymentType}-${i}`} className="flex justify-between"><span>{p.paymentType}</span><span>{p.paymentAmount.toFixed(2)}</span></div>
        ))}
        <div className="flex justify-between"><span>Change</span><span>{(paid - total).toFixed(2)}</span></div>
      </div>
      <div className="mt-4 text-center">
        <Link href="/sales/register" className="text-blue-600">Back to register</Link>
      </div>
    </div>
  );
}