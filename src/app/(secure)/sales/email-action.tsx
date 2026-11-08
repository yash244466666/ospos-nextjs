"use server";

import { requirePermission } from "@/lib/auth/with-permission";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReceiptDocument } from "@/lib/pdf/receipt";
import { ReceiptDefaultDocument } from "@/lib/pdf/receipt_default";
import { InvoiceDocument } from "@/lib/pdf/invoice";
import { TaxInvoiceDocument } from "@/lib/pdf/tax_invoice";
import { QuoteDocument } from "@/lib/pdf/quote";
import { WorkOrderDocument } from "@/lib/pdf/work_order";
import { buildReceiptData } from "@/lib/pdf/data";
import { getConfig } from "@/lib/config";
import { decrypt } from "@/lib/encryption";

type DocKind = "receipt" | "receipt_default" | "invoice" | "tax_invoice" | "quote" | "work_order";

function pickDoc(kind: DocKind) {
  switch (kind) {
    case "receipt": return ReceiptDocument;
    case "receipt_default": return ReceiptDefaultDocument;
    case "invoice": return InvoiceDocument;
    case "tax_invoice": return TaxInvoiceDocument;
    case "quote": return QuoteDocument;
    case "work_order": return WorkOrderDocument;
  }
}

function subjectFor(kind: DocKind, saleId: number): string {
  const company = getConfig("company", "");
  switch (kind) {
    case "receipt": return `Receipt #${saleId} from ${company}`;
    case "receipt_default": return `Receipt #${saleId} from ${company}`;
    case "invoice": return `Invoice #${saleId} from ${company}`;
    case "tax_invoice": return `Tax Invoice #${saleId} from ${company}`;
    case "quote": return `Quote #${saleId} from ${company}`;
    case "work_order": return `Work Order #${saleId} from ${company}`;
  }
}

function fileNameFor(kind: DocKind, saleId: number): string {
  switch (kind) {
    case "receipt": return `receipt-${saleId}.pdf`;
    case "receipt_default": return `receipt-${saleId}.pdf`;
    case "invoice": return `invoice-${saleId}.pdf`;
    case "tax_invoice": return `tax-invoice-${saleId}.pdf`;
    case "quote": return `quote-${saleId}.pdf`;
    case "work_order": return `work-order-${saleId}.pdf`;
  }
}

async function sendSaleEmail(kind: DocKind, saleId: number, emailAddress: string) {
  await requirePermission("sales");
  const nodemailer = await import("nodemailer");
  const data = await buildReceiptData(saleId);
  if (!data) throw new Error("Sale not found");
  const Doc = pickDoc(kind);
  const buffer = await renderToBuffer(<Doc data={data} />);

  const smtpHost = getConfig("smtp_host", "");
  const smtpPort = parseInt(getConfig("smtp_port", "587"), 10) || 587;
  const smtpUser = getConfig("smtp_user", "");
  const smtpPassRaw = getConfig("smtp_pass", "");
  let smtpPass = "";
  try { smtpPass = smtpPassRaw ? decrypt(smtpPassRaw) : ""; } catch { smtpPass = ""; }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  await transporter.sendMail({
    from: getConfig("email", "noreply@example.com"),
    to: emailAddress,
    subject: subjectFor(kind, saleId),
    text: getConfig("invoice_email_message", "Thank you for your purchase."),
    attachments: [{ filename: fileNameFor(kind, saleId), content: buffer }],
  });
  return { ok: true };
}

export async function sendInvoiceEmailAction(saleId: number, emailAddress: string) {
  return sendSaleEmail("invoice", saleId, emailAddress);
}
export async function sendReceiptEmailAction(saleId: number, emailAddress: string) {
  return sendSaleEmail("receipt", saleId, emailAddress);
}
export async function sendTaxInvoiceEmailAction(saleId: number, emailAddress: string) {
  return sendSaleEmail("tax_invoice", saleId, emailAddress);
}
export async function sendQuoteEmailAction(saleId: number, emailAddress: string) {
  return sendSaleEmail("quote", saleId, emailAddress);
}
export async function sendWorkOrderEmailAction(saleId: number, emailAddress: string) {
  return sendSaleEmail("work_order", saleId, emailAddress);
}