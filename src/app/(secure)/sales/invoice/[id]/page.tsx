import { requirePermission } from "@/lib/auth/with-permission";
import { getSale, getSaleItems, getSalePayments, getSaleTaxes } from "@/lib/sale/sale-model";
import { getConfig } from "@/lib/config";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { people, customers } from "@/db/schema";
import Link from "next/link";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
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
  const subtotal = items.reduce((s, i) => s + i.itemUnitPrice * Math.abs(i.quantityPurchased), 0);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  const total = subtotal + taxTotal;
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex justify-between border-b pb-2 mb-2">
        <div>
          <div className="font-bold text-lg">{getConfig("company", "")}</div>
          <div className="text-sm">{getConfig("address", "")}</div>
          <div className="text-sm">{getConfig("phone", "")} · {getConfig("email", "")}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg">INVOICE</div>
          <div className="text-sm">#{sale.invoiceNumber ?? sale.saleId}</div>
          <div className="text-sm">{sale.saleTime ? new Date(sale.saleTime * 1000).toLocaleDateString() : ""}</div>
        </div>
      </div>
      <div className="mb-2 text-sm">
        <div>Bill To: <span className="font-medium">{customerName}</span></div>
        {sale.comment && <div className="text-gray-600">{sale.comment}</div>}
      </div>
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Price</th>
            <th className="p-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.itemId}-${it.line}-${i}`} className="border-t">
              <td className="p-2">{it.description}</td>
              <td className="p-2 text-right">{Math.abs(it.quantityPurchased)}</td>
              <td className="p-2 text-right">{it.itemUnitPrice.toFixed(2)}</td>
              <td className="p-2 text-right">{(it.itemUnitPrice * Math.abs(it.quantityPurchased)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end mt-2 text-sm">
        <div className="w-48 space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{subtotal.toFixed(2)}</span></div>
          {taxes.map((t, i) => (
            <div key={`${t.taxGroup}-${i}`} className="flex justify-between"><span>Tax {t.taxGroup}</span><span>{t.saleTaxAmount.toFixed(2)}</span></div>
          ))}
          <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{total.toFixed(2)}</span></div>
          {payments.map((p, i) => (
            <div key={`${p.paymentType}-${i}`} className="flex justify-between"><span>Paid ({p.paymentType})</span><span>{p.paymentAmount.toFixed(2)}</span></div>
          ))}
        </div>
      </div>
      <div className="mt-6 text-center text-sm text-gray-600">{getConfig("return_policy", "")}</div>
      <div className="mt-4 text-center">
        <Link href="/sales/register" className="text-blue-600">Back to register</Link>
      </div>
    </div>
  );
}