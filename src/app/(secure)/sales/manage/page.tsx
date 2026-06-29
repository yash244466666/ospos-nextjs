import { requirePermission } from "@/lib/auth/with-permission";
import { eq, desc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { sales, salesItems, salesPayments } from "@/db/schema";
import { SALE_STATUS } from "@/lib/constants";
import Link from "next/link";

export default async function ManagePage() {
  await requirePermission("reports", "sales");
  const db = getDbSync();
  const rows = db.select().from(sales).where(eq(sales.saleStatus, SALE_STATUS.COMPLETED)).orderBy(desc(sales.saleTime)).all();
  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">Sales History</h1>
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Invoice #</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-right">Items</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const items = db.select().from(salesItems).where(eq(salesItems.saleId, s.saleId)).all();
            const payments = db.select().from(salesPayments).where(eq(salesPayments.saleId, s.saleId)).all();
            const total = items.reduce((sum, i) => sum + i.itemUnitPrice * Math.abs(i.quantityPurchased), 0);
            void payments;
            return (
              <tr key={s.saleId} className="border-t">
                <td className="p-2">{s.saleId}</td>
                <td className="p-2">{s.saleTime ? new Date(s.saleTime * 1000).toLocaleString() : ""}</td>
                <td className="p-2">{s.invoiceNumber ?? ""}</td>
                <td className="p-2">{s.saleType}</td>
                <td className="p-2 text-right">{items.length}</td>
                <td className="p-2 text-right">{total.toFixed(2)}</td>
                <td className="p-2">
                  <Link href={`/sales/invoice/${s.saleId}`} className="text-blue-600">View</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}