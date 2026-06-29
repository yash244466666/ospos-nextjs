import { requirePermission } from "@/lib/auth/with-permission";
import { eq, desc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { receivings, receivingsItems } from "@/db/schema";
import Link from "next/link";

export default async function ReceivingsManagePage() {
  await requirePermission("receivings");
  const db = getDbSync();
  const rows = db.select().from(receivings).orderBy(desc(receivings.receivingTime)).all();
  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">Receivings History</h1>
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Invoice #</th>
            <th className="p-2 text-left">Supplier</th>
            <th className="p-2 text-left">Comment</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const items = db.select().from(receivingsItems).where(eq(receivingsItems.receivingId, r.receivingId)).all();
            void items;
            return (
              <tr key={r.receivingId} className="border-t">
                <td className="p-2">{r.receivingId}</td>
                <td className="p-2">{r.receivingTime ? new Date(r.receivingTime * 1000).toLocaleString() : ""}</td>
                <td className="p-2">{r.invoiceNumber ?? ""}</td>
                <td className="p-2">{r.supplierId ?? ""}</td>
                <td className="p-2">{r.comment ?? ""}</td>
                <td className="p-2"><Link href={`/receivings/receipt/${r.receivingId}`} className="text-blue-600">View</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}