import nodemailer, { type SendMailOptions } from "nodemailer";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { getConfig, getConfigDecrypted, loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import {
  customers,
  employees,
  itemQuantities,
  people,
  sales,
  salesItems,
  salesItemsTaxes,
  salesPayments,
  salesTaxes,
} from "@/db/schema";
import { InvoiceDocument } from "@/lib/pdf/invoice";
import { TaxInvoiceDocument } from "@/lib/pdf/tax_invoice";
import { QuoteDocument } from "@/lib/pdf/quote";
import { WorkOrderDocument } from "@/lib/pdf/work_order";
import { ReceiptDefaultDocument } from "@/lib/pdf/receipt_default";
import { ReceiptShortDocument } from "@/lib/pdf/receipt_short";
import { buildReceiptData } from "@/lib/pdf/data";
import { render } from "@/lib/token";
import { lang } from "@/lib/i18n/lang";

export interface EmailResult {
  ok: boolean;
  message: string;
}

export type DocumentKind =
  | "receipt"
  | "receipt_default"
  | "receipt_short"
  | "invoice"
  | "tax_invoice"
  | "custom_invoice"
  | "custom_tax_invoice"
  | "quote"
  | "work_order";

function getLogoMimeType(filename: string | null): string {
  if (!filename) return "image/png";
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
}

async function buildLogoImgTag(): Promise<string> {
  const logo = getConfig("company_logo", "");
  if (!logo) return "";
  return '<img src="cid:company_logo" alt="logo" style="max-width:200px;"/>';
}

/**
 * `Email_lib`: protocol `smtp` uses SMTP; `mail` and `sendmail` both use the
 * configured sendmail path because Node has no PHP `mail()` equivalent.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [],
): Promise<EmailResult> {
  await loadConfig();
  const protocol = getConfig("protocol", "mail");
  const fromEmail = getConfig("email", "noreply@example.com");
  const fromName = getConfig("company", "OSPOS");
  const timeoutMs = Number(getConfig("smtp_timeout", "5")) * 1000;

  try {
    let transporter: nodemailer.Transporter;
    if (protocol === "smtp") {
      const crypto = getConfig("smtp_crypto", "");
      transporter = nodemailer.createTransport({
        host: getConfig("smtp_host", ""),
        port: Number(getConfig("smtp_port", "465")),
        secure: crypto === "ssl",
        requireTLS: crypto === "tls",
        auth: getConfig("smtp_user", "")
          ? {
              user: getConfig("smtp_user", ""),
              pass: getConfigDecrypted("smtp_pass", ""),
            }
          : undefined,
        connectionTimeout: timeoutMs,
      });
    } else {
      transporter = nodemailer.createTransport({
        sendmail: true,
        newline: "unix",
        path: getConfig("mailpath", "/usr/sbin/sendmail"),
      });
    }

    const logo = getConfig("company_logo", "");
    const logoAttachment = logo
      ? [
          {
            filename: logo,
            path: `${process.cwd()}/public/uploads/${logo}`,
            cid: "company_logo",
          },
        ]
      : [];

    const mail: SendMailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      attachments: [...attachments, ...logoAttachment],
    };
    await transporter.sendMail(mail);
    return { ok: true, message: lang("Common.success") };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function loadSaleContext(saleId: number) {
  await loadConfig();
  const db = await getDb();
  const saleRows = await db.select().from(sales).where(eq(sales.saleId, saleId)).limit(1);
  const sale = saleRows[0];
  if (!sale) return null;

  let customer: {
    personId: number;
    firstName: string;
    lastName: string;
    email: string;
    companyName: string | null;
  } | null = null;
  if (sale.customerId) {
    const rows = await db
      .select({
        personId: customers.personId,
        firstName: people.firstName,
        lastName: people.lastName,
        email: people.email,
        companyName: customers.companyName,
      })
      .from(customers)
      .innerJoin(people, eq(people.personId, customers.personId))
      .where(eq(customers.personId, sale.customerId))
      .limit(1);
    customer = rows[0] ?? null;
  }

  const employeeRows = await db
    .select({ firstName: people.firstName, lastName: people.lastName })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(eq(employees.personId, sale.employeeId))
    .limit(1);

  const items = await db.select().from(salesItems).where(eq(salesItems.saleId, saleId));
  const payments = await db
    .select()
    .from(salesPayments)
    .where(eq(salesPayments.saleId, saleId));
  const taxes = await db.select().from(salesTaxes).where(eq(salesTaxes.saleId, saleId));
  const itemTaxes = await db
    .select()
    .from(salesItemsTaxes)
    .where(eq(salesItemsTaxes.saleId, saleId));

  let locationId: number | null = null;
  if (items[0]?.itemLocation) {
    const quantityRows = await db
      .select({ locationId: itemQuantities.locationId })
      .from(itemQuantities)
      .where(eq(itemQuantities.itemId, items[0].itemId))
      .limit(1);
    locationId = quantityRows[0]?.locationId ?? items[0].itemLocation;
  }

  return {
    sale,
    customer,
    employee: employeeRows[0] ?? null,
    items,
    payments,
    taxes,
    itemTaxes,
    locationId,
  };
}

function documentFor(kind: DocumentKind) {
  switch (kind) {
    case "tax_invoice":
    case "custom_tax_invoice":
      return TaxInvoiceDocument;
    case "invoice":
    case "custom_invoice":
      return InvoiceDocument;
    case "quote":
      return QuoteDocument;
    case "work_order":
      return WorkOrderDocument;
    case "receipt_short":
      return ReceiptShortDocument;
    default:
      return ReceiptDefaultDocument;
  }
}

export async function sendSaleEmail(
  saleId: number,
  kind: DocumentKind,
): Promise<EmailResult> {
  const context = await loadSaleContext(saleId);
  if (!context) return { ok: false, message: lang("Sales.transaction_failed") };
  if (!context.customer?.email) {
    return { ok: false, message: lang("Sales.email_receipt_no_email") };
  }

  const data = await buildReceiptData(saleId);
  if (!data) return { ok: false, message: lang("Sales.transaction_failed") };

  const Document = documentFor(kind);
  const pdf = await renderToBuffer(Document({ data }) as never);
  const company = getConfig("company", "OSPOS");
  const subject = `${company} — ${kind.replace(/_/g, " ")} #${
    context.sale.invoiceNumber ?? context.sale.saleId
  }`;

  const customerName =
    context.customer.companyName ||
    `${context.customer.firstName} ${context.customer.lastName}`.trim();
  const messageTemplate = getConfig(
    "invoice_email_message",
    "Dear {CU}, In attachment the receipt for sale {ISEQ}",
  );
  const message = await render(messageTemplate, {
    customerInfoProvided: true,
    overrides: {
      CU: customerName,
      ISEQ: context.sale.invoiceNumber ?? String(context.sale.saleId),
    },
  });
  const logo = await buildLogoImgTag();
  const html = `<html><body>${logo}<p>${message}</p><p>${company}</p></body></html>`;

  return sendEmail(context.customer.email, subject, html, [
    { filename: `${kind}_${saleId}.pdf`, content: pdf, contentType: "application/pdf" },
  ]);
}

export { getLogoMimeType, buildLogoImgTag };
