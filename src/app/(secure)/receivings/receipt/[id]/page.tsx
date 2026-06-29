import { requirePermission } from "@/lib/auth/with-permission";
import { getReceiving, getReceivingItems } from "@/lib/receiving/receiving-model";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { people, suppliers } from "@/db/schema";
import Link from "next/link";

export default async function ReceivingReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("receivings");
  const { id } = await params;
  const receivingId = parseInt(id, 10);
  const receiving = getReceiving(receivingId);
  if (!receiving) return <div className="p-4">Receiving not found</div>;
  const items = getReceivingItems(receivingId);
  const db = getDbSync();
  let supplierName = "";
  if (receiving.supplierId) {
    const s = db.select({ first: people.firstName, last: people.lastName, company: suppliers.companyName })
      .from(suppliers).innerJoin(people, eq(people.personId, suppliers.personId))
      .where(eq(suppliers.personId, receiving.supplierId)).get();
    if (s) supplierName = s.company || `${s.first} ${s.last ?? ""}`.trim();
  }
  const total = items.reduce((s, i) => s + i.itemCostPrice * Math.abs(i.quantityPurchased), 0);
  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="text-center mb-2 font-bold">Receiving Receipt</div>
      <div className="text-sm mb-2">
        <div>#{receiving.receivingId}</div>
        <div>Date: {receiving.receivingTime ? new Date(receiving.receivingTime * 1000).toLocaleString() : ""}</div>
        <div>Supplier: {supplierName || "—"}</div>
        {receiving.invoiceNumber && <div>Invoice #: {receiving.invoiceNumber}</div>}
        {receiving.comment && <div>Comment: {receiving.comment}</div>}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="py-1">{it.description} × {Math.abs(it.quantityPurchased)}</td>
              <td className="py-1 text-right">{(it.itemCostPrice * Math.abs(it.quantityPurchased)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t mt-2 pt-2 flex justify-between font-bold text-sm">
        <span>Total</span><span>{total.toFixed(2)}</span>
      </div>
      <div className="mt-4 text-center">
        <Link href="/receivings/register" className="text-blue-600">New receiving</Link>
      </div>
    </div>
  );
}