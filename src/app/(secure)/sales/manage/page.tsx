import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb, IS_SQLITE } from "@/lib/db";
import { sales, salesItems, salesPayments, salesTaxes } from "@/db/schema";
import { SALE_STATUS } from "@/lib/constants";
import { dateFormat, loadConfig, timeFormat } from "@/lib/config";
import { formatDb } from "@/lib/datetime";
import { bcAdd, bcMul, toDbDecimal } from "@/lib/money";
import { getItemTotal } from "@/lib/sale/types";
import { toCurrency } from "@/lib/i18n/format";

export default async function ManagePage() {
  await requirePermission("reports", "reports_sales");
  await loadConfig();
  const db = await getDb();
  const rows = await db
    .select()
    .from(sales)
    .where(eq(sales.saleStatus, SALE_STATUS.COMPLETED))
    .orderBy(desc(sales.saleTime));
  void IS_SQLITE;

  const table = [];
  for (const sale of rows) {
    const items = await db.select().from(salesItems).where(eq(salesItems.saleId, sale.saleId));
    const taxes = await db.select().from(salesTaxes).where(eq(salesTaxes.saleId, sale.saleId));
    const payments = await db
      .select()
      .from(salesPayments)
      .where(eq(salesPayments.saleId, sale.saleId));
    let total = "0";
    for (const item of items) {
      total = bcAdd(
        total,
        getItemTotal(
          item.quantityPurchased,
          item.itemUnitPrice,
          item.discount,
          item.discountType,
          true,
        ),
      ).toFixed();
    }
    for (const tax of taxes) {
      if (tax.taxType === 1) total = bcAdd(total, tax.saleTaxAmount).toFixed();
    }
    const paid = payments
      .filter((payment) => !payment.cashAdjustment)
      .reduce<string>((sum, payment) => bcAdd(sum, payment.paymentAmount).toFixed(), "0");
    table.push({
      sale,
      items: items.length,
      total: toDbDecimal(total, 2),
      paid: toDbDecimal(paid, 2),
      date: sale.saleTime
        ? formatDb(sale.saleTime, `${dateFormat()} ${timeFormat()}`)
        : "",
    });
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl">Sales History</h1>
      <table className="w-full border text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Invoice #</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-right">Items</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2 text-right">Paid</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {table.map(({ sale, items, total, paid, date }) => (
            <tr key={sale.saleId} className="border-t">
              <td className="p-2">{sale.saleId}</td>
              <td className="p-2">{date}</td>
              <td className="p-2">{sale.invoiceNumber ?? ""}</td>
              <td className="p-2">{sale.saleType}</td>
              <td className="p-2 text-right">{items}</td>
              <td className="p-2 text-right">{toCurrency(total)}</td>
              <td className="p-2 text-right">{toCurrency(paid)}</td>
              <td className="p-2">
                <Link href={`/sales/receipt/${sale.saleId}`} className="text-blue-600">
                  Receipt
                </Link>
                {sale.invoiceNumber ? (
                  <>
                    {" · "}
                    <Link href={`/sales/invoice/${sale.saleId}`} className="text-blue-600">
                      Invoice
                    </Link>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
