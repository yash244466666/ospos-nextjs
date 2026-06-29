import nodemailer from "nodemailer";
import { getConfig, getConfigDecrypted } from "@/lib/config";
import { getDbSync } from "@/lib/db";
import { sales, salesItems, salesPayments, salesTaxes, salesItemsTaxes, customers, employees, stockLocations, people } from "@/db/schema";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/lib/pdf/invoice";
import { QuoteDocument } from "@/lib/pdf/quote";
import { WorkOrderDocument } from "@/lib/pdf/work_order";
import { ReceiptDefaultDocument } from "@/lib/pdf/receipt_default";
import { ReceiptShortDocument } from "@/lib/pdf/receipt_short";
import { buildReceiptData } from "@/lib/pdf/data";

export interface EmailResult { ok: boolean; message: string; }

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
  return `<img src="cid:company_logo" alt="logo" style="max-width:200px;"/>`;
}

export async function sendEmail(to: string, subject: string, html: string, attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = []): Promise<EmailResult> {
  const host = getConfig("smtp_host", "");
  if (!host) return { ok: false, message: "SMTP host not configured" };
  const port = parseInt(getConfig("smtp_port", "587"), 10);
  const user = getConfig("smtp_user", "");
  const pass = getConfigDecrypted("smtp_pass", "");
  const crypto = getConfig("smtp_crypto", "tls");
  const fromEmail = getConfig("email", "noreply@example.com");
  const fromName = getConfig("company", "OSPOS");
  const timeoutMs = parseInt(getConfig("smtp_timeout", "10"), 10) * 1000;
  try {
    const transporter = nodemailer.createTransport({
      host, port, secure: crypto === "ssl", requireTLS: crypto === "tls",
      auth: user ? { user, pass } : undefined,
      connectionTimeout: timeoutMs,
    });
    const logo = getConfig("company_logo", "");
    const logoAttachment = logo ? [{ filename: logo, path: `public/uploads/${logo}`, cid: "company_logo" }] : [];
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to, subject, html, attachments: [...attachments, ...logoAttachment] as any,
    });
    return { ok: true, message: "Email sent" };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "Email send failed" };
  }
}

export async function loadSaleContext(saleId: number) {
  const db = getDbSync();
  const sale = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
  if (!sale) return null;
  let customer: any = null;
  if (sale.customerId) {
    const cust = db.select().from(customers).where(eq(customers.personId, sale.customerId)).get();
    if (cust) {
      const person = db.select().from(people).where(eq(people.personId, cust.personId)).get();
      customer = { ...cust, firstName: person?.firstName, lastName: person?.lastName, email: person?.email };
    }
  }
  const items = db.select().from(salesItems).where(eq(salesItems.saleId, saleId)).all();
  const payments = db.select().from(salesPayments).where(eq(salesPayments.saleId, saleId)).all();
  const taxes = db.select().from(salesTaxes).where(eq(salesTaxes.saleId, saleId)).all();
  const itemTaxes = db.select().from(salesItemsTaxes).where(eq(salesItemsTaxes.saleId, saleId)).all();
  const employee = sale.employeeId
    ? db.select().from(employees).where(eq(employees.personId, sale.employeeId)).get()
    : null;
  const location = sale.saleLocation
    ? db.select().from(stockLocations).where(eq(stockLocations.locationId, sale.saleLocation)).get()
    : null;
  return { sale, customer, items, payments, taxes, itemTaxes, employee, location };
}

export async function sendSaleEmail(saleId: number, kind: "invoice" | "quote" | "work_order" | "receipt"): Promise<EmailResult> {
  const ctx = await loadSaleContext(saleId);
  if (!ctx) return { ok: false, message: "Sale not found" };
  if (!ctx.customer?.email) return { ok: false, message: "Customer email not set" };

  const company = getConfig("company", "OSPOS");
  let pdfBuffer: Buffer;
  let subject: string;
  let filename: string;
  if (kind === "invoice") {
    pdfBuffer = await renderToBuffer(<InvoiceDocument data={ctx as any} />);
    subject = `Invoice from ${company}`;
    filename = `invoice_${saleId}.pdf`;
  } else if (kind === "quote") {
    pdfBuffer = await renderToBuffer(<QuoteDocument data={ctx as any} />);
    subject = `Quote from ${company}`;
    filename = `quote_${saleId}.pdf`;
  } else if (kind === "work_order") {
    pdfBuffer = await renderToBuffer(<WorkOrderDocument data={ctx as any} />);
    subject = `Work Order from ${company}`;
    filename = `work_order_${saleId}.pdf`;
  } else {
    pdfBuffer = await renderToBuffer(<ReceiptDefaultDocument data={ctx as any} />);
    subject = `Receipt from ${company}`;
    filename = `receipt_${saleId}.pdf`;
  }

  const defaultMsg = kind === "invoice" ? getConfig("invoice_email_message", "Thank you for your business.") : "Please find attached.";
  const logo = await buildLogoImgTag();
  const html = `<html><body>${logo}<p>Dear ${(ctx.customer as any).firstName ?? "Customer"},</p><p>${defaultMsg}</p><p>${company}</p></body></html>`;
  return sendEmail((ctx.customer as any).email, subject, html, [{ filename, content: pdfBuffer, contentType: "application/pdf" }]);
}

export { getLogoMimeType, buildLogoImgTag };
