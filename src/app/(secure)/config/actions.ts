"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/with-permission";
import { setConfig, setConfigBatch, getConfig, loadConfig } from "@/lib/config";
import { CONFIG_TABS, ENCRYPTED_KEYS } from "@/lib/config/tabs";
import { encrypt, decrypt } from "@/lib/encryption";
import { getDb } from "@/lib/db";
import { attributeDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function saveConfigTabAction(tabKey: string, formData: FormData) {
  await requirePermission("config");
  await loadConfig();
  const tab = CONFIG_TABS.find((t) => t.key === tabKey);
  if (!tab) throw new Error("Unknown tab");
  const updates: Record<string, string> = {};
  for (const field of tab.fields) {
    let value: string;
    if (field.type === "checkbox") {
      value = formData.get(field.key) === "on" ? "1" : "0";
    } else {
      value = (formData.get(field.key) as string) ?? "";
    }
    if (ENCRYPTED_KEYS.has(field.key)) {
      // Skip encryption when empty — preserve existing ciphertext
      if (value === "") continue;
      const currentCipher = getConfig(field.key, "");
      try {
        if (currentCipher && decrypt(currentCipher) === value) continue;
      } catch { /* re-encrypt on failure */ }
      value = encrypt(value);
    }
    updates[field.key] = value;
  }
  await setConfigBatch(updates);

  if (tabKey === "general") {
    const db = await getDb();
    if (updates.category_dropdown === "1") {
      await db
        .insert(attributeDefinitions)
        .values({
          definitionId: -1,
          definitionName: "ospos_category",
          definitionType: "DROPDOWN",
          definitionFlags: 0,
          deleted: false,
        })
        .onConflictDoUpdate({
          target: attributeDefinitions.definitionId,
          set: { definitionName: "ospos_category", definitionType: "DROPDOWN", deleted: false },
        });
    } else {
      await db
        .update(attributeDefinitions)
        .set({ deleted: true })
        .where(eq(attributeDefinitions.definitionId, -1));
    }
  }

  revalidatePath("/config");
  return { ok: true, tab: tabKey };
}

export async function testEmailAction(to: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("config");
  const { sendEmail } = await import("@/lib/email");
  return sendEmail(to, "OSPOS Test Email", "<p>This is a test email from OSPOS.</p>");
}

export async function saveInfoAction(formData: FormData) { return saveConfigTabAction("info", formData); }
export async function saveGeneralAction(formData: FormData) { return saveConfigTabAction("general", formData); }
export async function saveLocaleAction(formData: FormData) { return saveConfigTabAction("locale", formData); }
export async function saveEmailAction(formData: FormData) { return saveConfigTabAction("email", formData); }
export async function saveMessageAction(formData: FormData) { return saveConfigTabAction("system_message", formData); }
export async function saveMailchimpAction(formData: FormData) { return saveConfigTabAction("system_integrations", formData); }
export async function saveTaxAction(formData: FormData) { return saveConfigTabAction("tax", formData); }
export async function saveLocationsAction(formData: FormData) { return saveConfigTabAction("stock_locations", formData); }
export async function saveTablesAction(formData: FormData) { return saveConfigTabAction("dinner_tables", formData); }
export async function saveRewardsAction(formData: FormData) { return saveConfigTabAction("rewards", formData); }
export async function saveBarcodeAction(formData: FormData) { return saveConfigTabAction("barcode", formData); }
export async function saveReceiptAction(formData: FormData) { return saveConfigTabAction("receipt", formData); }
export async function saveInvoiceAction(formData: FormData) { return saveConfigTabAction("invoice", formData); }
export async function saveShortcutsAction(formData: FormData) { return saveConfigTabAction("shortcuts", formData); }
export async function removeLogoAction() {
  await requirePermission("config");
  await setConfig("company_logo", "");
  revalidatePath("/config");
  return { ok: true };
}
export async function checkMailchimpApiKeyAction(apiKey: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("config");
  return { ok: !!apiKey, message: apiKey ? "API key accepted" : "Empty API key" };
}
export async function checkNumberLocaleAction(locale: string): Promise<{ ok: boolean }> {
  await requirePermission("config");
  return { ok: /^[a-zA-Z]{2,3}(_[A-Z]{2})?$/.test(locale) };
}