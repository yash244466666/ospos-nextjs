"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/with-permission";
import { sendSMS } from "@/lib/sms";

export async function sendSmsAction(formData: FormData) {
  await requirePermission("messages");
  const phone = (formData.get("phone") as string) || "";
  const message = (formData.get("message") as string) || "";
  if (!phone || !message) return { ok: false, message: "Phone and message required" };
  const result = await sendSMS(phone, message);
  revalidatePath("/messages");
  return result;
}

export async function getMessageHistoryAction(_term?: string, limit = 50) {
  await requirePermission("messages");
  // In-memory log only; no persisted messages table at present.
  return [];
}
