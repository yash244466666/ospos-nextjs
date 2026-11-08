import { eq } from "drizzle-orm";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/with-permission";
import { getReceiving, getReceivingItems } from "@/lib/receiving/receiving-model";
import { getDb } from "@/lib/db";
import { people, suppliers } from "@/db/schema";
import { dateFormat, loadConfig, timeFormat } from "@/lib/config";
import { formatDb } from "@/lib/datetime";
import { bcAdd, bcMul, abs } from "@/lib/money";
import { toCurrency } from "@/lib/i18n/format";

export default async function ReceivingReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("reports", "reports_receivings");
  await loadConfig();
  const { id } = await params;
  const receivingId = Number(id);
  const receiving = await getReceiving(receivingId);
  if (!receiving) return <div className="p-4">Receiving not found</div>;
  const items = await getReceivingItems(receivingId);
  const db = await getDb();
  let supplierName = "";
  if (receiving.supplierId) {
    const rows = await db
      .select({
        first: people.firstName,
        last: people.lastName,
        company: suppliers.companyName,
      })
      .from(suppliers)
      .innerJoin(people, eq(people.personId, suppliers.personId))
      .where(eq(suppliers.personId, receiving.supplierId))
      .limit(1);
    const supplier = rows[0];
    if (supplier) {
      supplierName =
        supplier.company || `${supplier.first} ${supplier.last ?? ""}`.trim();
    }
  }
  const total = items.reduce<string>(
    (sum, item) =>
      bcAdd(sum, bcMul(item.itemCostPrice, abs(item.quantityPurchased))).toFixed(),
    "0",
  );
  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-2 text-center font-bold">Receiving Receipt</div>
      <div className="mb-2 text-sm">
        <div>#{receiving.receivingId}</div>
        <div>
          Date:{" "}
          {receiving.receivingTime
            ? formatDb(receiving.receivingTime, `${dateFormat()} ${timeFormat()}`)
            : ""}
        </div>
        <div>Supplier: {supplierName || "—"}</div>
        {receiving.reference ? <div>Reference: {receiving.reference}</div> : null}
        {receiving.comment ? <div>Comment: {receiving.comment}</div> : null}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td className="py-1">
                {item.description} × {abs(item.quantityPurchased).toString()} ×{" "}
                {item.receivingQuantity}
              </td>
              <td className="py-1 text-right">
                {toCurrency(
                  bcMul(item.itemCostPrice, abs(item.quantityPurchased)).toFixed(),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold">
        <span>Total</span>
        <span>{toCurrency(total)}</span>
      </div>
      <div className="mt-4 text-center">
        <Link href="/receivings/register" className="text-blue-600">
          New receiving
        </Link>
      </div>
    </div>
  );
}
