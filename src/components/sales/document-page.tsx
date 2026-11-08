import Link from "next/link";
import { getSale } from "@/lib/sale/sale-model";
import { buildSaleDocumentData } from "@/lib/pdf/data";
import { getConfig, loadConfig } from "@/lib/config";
import { lang } from "@/lib/i18n/lang";
import { toCurrency, toCurrencyTax, toDecimals, toQuantityDecimals } from "@/lib/i18n/format";
import { DISCOUNT_TYPE } from "@/lib/constants";

export type DocumentKind = "receipt" | "invoice" | "tax_invoice" | "quote" | "work_order";

const TITLE_KEYS: Record<DocumentKind, string> = {
  receipt: "Sales.receipt",
  invoice: "Sales.invoice",
  tax_invoice: "Sales.invoice",
  quote: "Sales.quote",
  work_order: "Sales.work_order",
};

function isZero(value: string): boolean {
  return Number(value) === 0;
}

export async function SaleDocument({
  saleId,
  kind,
}: {
  saleId: number;
  kind: DocumentKind;
}) {
  await loadConfig();
  const sale = await getSale(saleId);
  const data = await buildSaleDocumentData(saleId);
  if (!sale || !data) {
    return (
      <div className="p-4">
        {lang("Sales.id")}: {saleId}
      </div>
    );
  }

  const number =
    kind === "invoice" || kind === "tax_invoice"
      ? (data.invoiceNumber ?? String(data.saleId))
      : kind === "quote"
        ? (data.quoteNumber ?? String(data.saleId))
        : kind === "work_order"
          ? (data.workOrderNumber ?? String(data.saleId))
          : String(data.saleId);
  const { flags } = data;
  const title = lang(TITLE_KEYS[kind]);
  const printableLines = data.lines.filter((line) => line.printOption === 0);
  const rowClassName = "border-t border-slate-200";
  // Sale_lib::get_all_receipt_templates / _load_sale_data: unknown templates
  // fall back to receipt_default.
  const short = kind === "receipt" && flags.template === "receipt_short";

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-2 flex justify-between border-b pb-2">
        <div>
          {flags.showCompanyName ? (
            <div className="text-lg font-bold">{getConfig("company", "")}</div>
          ) : null}
          <div className="text-sm whitespace-pre-line">{getConfig("address", "")}</div>
          <div className="text-sm">{getConfig("phone", "")}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{title}</div>
          <div className="text-sm">
            {lang("Sales.id")}: POS {data.saleId}
          </div>
          {data.invoiceNumber ? (
            <div className="text-sm">
              {lang("Sales.invoice_number")}: {data.invoiceNumber}
            </div>
          ) : null}
          <div className="text-sm">{data.saleTime}</div>
        </div>
      </div>

      <div className="mb-2 space-y-0.5 text-sm">
        {data.customerName ? (
          <div>
            {lang("Customers.customer")}: <span className="font-medium">{data.customerName}</span>
          </div>
        ) : null}
        {data.employeeName ? (
          <div>
            {lang("Employees.employee")}: {data.employeeName}
          </div>
        ) : null}
        {data.comment ? <div className="text-slate-600">{data.comment}</div> : null}
      </div>

      <table className="w-full border text-xs" style={{ fontSize: flags.receiptFontSize }}>
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">{lang("Sales.description_abbrv")}</th>
            {!short ? <th className="p-2 text-right">{lang("Sales.price")}</th> : null}
            <th className="p-2 text-right">{lang("Sales.quantity")}</th>
            <th className="p-2 text-right">{lang("Sales.total")}</th>
            {!short && flags.showTaxInd ? <th className="p-2 text-left">T</th> : null}
          </tr>
        </thead>
        <tbody>
          {printableLines.map((line) => (
            <tr key={`${line.line}`} className={rowClassName}>
              <td className="p-2">
                <div className="font-medium">
                  {line.name ? line.name.charAt(0).toUpperCase() + line.name.slice(1) : ""}{" "}
                  {line.attributeValues}
                </div>
                {flags.showDescription && line.description ? (
                  <div className="text-[11px] text-slate-500">{line.description}</div>
                ) : null}
                {flags.showSerialnumber && line.serialnumber ? (
                  <div className="text-[11px] text-slate-500">{line.serialnumber}</div>
                ) : null}
              </td>
              {!short ? <td className="p-2 text-right">{toCurrency(line.price)}</td> : null}
              <td className="p-2 text-right">{toQuantityDecimals(line.quantity)}</td>
              <td className="p-2 text-right">
                {toCurrency(flags.showTotalDiscount ? line.total : line.discountedTotal)}
              </td>
              {!short && flags.showTaxInd ? <td className="p-2">{line.taxedFlag}</td> : null}
            </tr>
          ))}
          {printableLines.map((line) =>
            Number(line.discountAmount) > 0 ? (
              <tr key={`discount-${line.line}`} className={rowClassName}>
                <td className="p-2 text-slate-600" colSpan={short ? 2 : 3}>
                  {line.discountType === DISCOUNT_TYPE.FIXED
                    ? `${toCurrency(line.discount)} ${lang("Sales.discount")}`
                    : `${toDecimals(line.discount)} ${lang("Sales.discount_included")}`}
                </td>
                <td className="p-2 text-right">{toCurrency(line.discountedTotal)}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>

      <div className="mt-2 flex justify-end text-sm">
        <div className="w-64 space-y-1">
          {flags.showTotalDiscount && !isZero(data.discountTotal) ? (
            <>
              <div className="flex justify-between">
                <span>{lang("Sales.sub_total")}</span>
                <span>{toCurrency(data.prediscountSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>{lang("Sales.customer_discount")}:</span>
                <span>{toCurrency(`-${data.discountTotal}`)}</span>
              </div>
            </>
          ) : null}
          {flags.showTaxes ? (
            <>
              <div className="flex justify-between">
                <span>{lang("Sales.sub_total")}</span>
                <span>{toCurrency(data.subtotal)}</span>
              </div>
              {data.taxes.map((tax, index) => (
                <div key={index} className="flex justify-between">
                  <span>
                    {Number(tax.rate)}% {tax.name}:
                  </span>
                  <span>{toCurrencyTax(tax.amount)}</span>
                </div>
              ))}
            </>
          ) : null}
          <div className="flex justify-between border-t pt-1 font-bold">
            <span>{lang("Sales.total")}</span>
            <span>{toCurrency(data.total)}</span>
          </div>
          {data.payments.map((payment, index) => (
            <div key={index} className="flex justify-between">
              <span>
                {payment.type}
                {payment.referenceCode ? ` (${payment.referenceCode})` : ""}
              </span>
              <span>{toCurrency(`-${payment.amount}`)}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span>
              {Number(data.change) >= 0 ? lang("Sales.change_due") : lang("Sales.amount_due")}
            </span>
            <span>{toCurrency(data.change)}</span>
          </div>
        </div>
      </div>

      {kind === "invoice" || kind === "tax_invoice" ? (
        flags.invoiceDefaultComments ? (
          <div className="mt-4 whitespace-pre-line text-xs text-slate-600">
            {flags.invoiceDefaultComments}
          </div>
        ) : null
      ) : null}
      <div className="mt-6 text-center text-sm text-slate-600">
        {flags.printFooter || getConfig("return_policy", "")}
      </div>
      <div className="mt-4 text-center">
        <Link href="/sales/register" className="text-blue-600">
          {lang("Sales.register")}
        </Link>
      </div>
    </div>
  );
}
