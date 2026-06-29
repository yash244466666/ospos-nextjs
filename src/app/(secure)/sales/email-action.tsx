"use server";

import { requirePermission } from "@/lib/auth/with-permission";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReceiptDocument } from "@/lib/pdf/receipt";
import { buildReceiptData } from "@/lib/pdf/data";
import { getConfig } from "@/lib/config";
import { decrypt } from "@/lib/encryption";

export async function sendInvoiceEmailAction(saleId: number, emailAddress: string) {
  await requirePermission("sales");
  const nodemailer = await import("nodemailer");
  const data = buildReceiptData(saleId);
  if (!data) throw new Error("Sale not found");
  const buffer = await renderToBuffer(<ReceiptDocument data={data} />);

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
    subject: `Invoice #${saleId} from ${getConfig("company", "")}`,
    text: getConfig("invoice_email_message", "Thank you for your purchase."),
    attachments: [{ filename: `invoice-${saleId}.pdf`, content: buffer }],
  });
  return { ok: true };
}