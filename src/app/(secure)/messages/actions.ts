"use server";

import { requirePermission } from "@/lib/auth/with-permission";

export async function sendSmsAction(formData: FormData) {
  await requirePermission("messages");
  const phone = (formData.get("phone") as string) || "";
  const message = (formData.get("message") as string) || "";
  // SMS provider stub: log and report success. Wire to a real provider in production.
  console.log("[SMS stub]", { phone, message });
  return { success: true, message: `Queued SMS to ${phone}` };
}