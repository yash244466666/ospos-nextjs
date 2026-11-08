import Link from "next/link";
import { getSale } from "@/lib/sale/sale-model";
import { buildReceiptData } from "@/lib/pdf/data";
import { getConfig, loadConfig } from "@/lib/config";
import { toCurrency } from "@/lib/i18n/format";

export type DocumentKind = "receipt" | "invoice" | "tax_invoice" | "quote" | "work_order";

const TITLES: Record<DocumentKind, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  tax_invoice: "Tax Invoice",
  quote: "Quote",
  work_order: "Work Order",
};

export async function SaleDocument({
  saleId,
  kind,
}: {
  saleId: number;
  kind: DocumentKind;
}) {
  await loadConfig();
  const sale = await getSale(saleId);
  const data = await buildReceiptData(saleId);
  if (!sale || !data) return <div className="p-4">{TITLES[kind]} not found</div>;

  const number =
    kind === "invoice" || kind === "tax_invoice"
      ? (sale.invoiceNumber ?? String(sale.saleId))
      : kind === "quote"
        ? (sale.quoteNumber ?? String(sale.saleId))
        : kind === "work_order"
          ? (sale.workOrderNumber ?? String(sale.saleId))
          : String(sale.saleId);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-2 flex justify-between border-b pb-2">
        <div>
          <div className="text-lg font-bold">{data.company}</div>
          <div className="text-sm">{data.address}</div>
          <div className="text-sm">{data.phone}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{TITLES[kind]}</div>
          <div className="text-sm">#{number}</div>
          <div className="text-sm">{data.saleTime}</div>
        </div>
      </div>
      <div className="mb-2 text-sm">
        <div>
          Customer: <span className="font-medium">{data.customerName}</span>
        </div>
        {sale.comment ? <div className="text-slate-600">{sale.comment}</div> : null}
      </div>
      <table className="w-full border text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Price</th>
            <th className="p-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, index) => (
            <tr key={index} className="border-t">
              <td className="p-2">{line.description}</td>
              <td className="p-2 text-right">{line.quantity}</td>
              <td className="p-2 text-right">{toCurrency(String(line.unitPrice))}</td>
              <td className="p-2 text-right">
                {toCurrency(String(line.total ?? line.unitPrice * line.quantity))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-end text-sm">
        <div className="w-56 space-y-1">
          {data.subtotal !== undefined ? (
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{toCurrency(String(data.subtotal))}</span>
            </div>
          ) : null}
          {data.lines.some((line) => (line.discount ?? 0) > 0) ? (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>
                {toCurrency(
                  String(data.lines.reduce((total, line) => total + (line.discount ?? 0), 0)),
                )}
              </span>
            </div>
          ) : null}
          {data.taxes.map((tax, index) => (
            <div key={index} className="flex justify-between">
              <span>{tax.name}</span>
              <span>{toCurrency(String(tax.amount))}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-1 font-bold">
            <span>Total</span>
            <span>{toCurrency(String(data.total))}</span>
          </div>
          {data.payments.map((payment, index) => (
            <div key={index} className="flex justify-between">
              <span>Paid ({payment.type})</span>
              <span>{toCurrency(String(payment.amount))}</span>
            </div>
          ))}
          {data.change !== 0 ? (
            <div className="flex justify-between">
              <span>Change</span>
              <span>{toCurrency(String(data.change))}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-6 text-center text-sm text-slate-600">
        {getConfig("return_policy", "")}
      </div>
      <div className="mt-4 text-center">
        <Link href="/sales/register" className="text-blue-600">
          Back to register
        </Link>
      </div>
    </div>
  );
}
