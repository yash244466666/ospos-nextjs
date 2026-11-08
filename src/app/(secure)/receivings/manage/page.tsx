import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { receivings, receivingsItems, suppliers } from "@/db/schema";
import { dateFormat, loadConfig, timeFormat } from "@/lib/config";
import { formatDb } from "@/lib/datetime";
import { bcAdd, bcMul, abs } from "@/lib/money";
import { toCurrency } from "@/lib/i18n/format";

export default async function ReceivingsManagePage() {
  await requirePermission("reports", "reports_receivings");
  await loadConfig();
  const db = await getDb();
  const rows = await db
    .select()
    .from(receivings)
    .orderBy(desc(receivings.receivingTime));
  const table = [];
  for (const row of rows) {
    const items = await db
      .select()
      .from(receivingsItems)
      .where(eq(receivingsItems.receivingId, row.receivingId));
    const supplier = row.supplierId
      ? (
          await db
            .select({ companyName: suppliers.companyName })
            .from(suppliers)
            .where(eq(suppliers.personId, row.supplierId))
            .limit(1)
        )[0]?.companyName
      : "";
    const total = items.reduce<string>(
      (sum, item) =>
        bcAdd(sum, bcMul(item.itemCostPrice, abs(item.quantityPurchased))).toFixed(),
      "0",
    );
    table.push({ row, supplier, total, date: row.receivingTime ? formatDb(row.receivingTime, `${dateFormat()} ${timeFormat()}`) : "" });
  }
  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl">Receivings History</h1>
      <table className="w-full border text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Reference</th>
            <th className="p-2 text-left">Supplier</th>
            <th className="p-2 text-left">Comment</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {table.map(({ row, supplier, total, date }) => (
            <tr key={row.receivingId} className="border-t">
              <td className="p-2">{row.receivingId}</td>
              <td className="p-2">{date}</td>
              <td className="p-2">{row.reference ?? ""}</td>
              <td className="p-2">{supplier ?? ""}</td>
              <td className="p-2">{row.comment ?? ""}</td>
              <td className="p-2 text-right">{toCurrency(total)}</td>
              <td className="p-2">
                <Link href={`/receivings/receipt/${row.receivingId}`} className="text-blue-600">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
