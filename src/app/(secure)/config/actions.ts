"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/with-permission";
import { setConfig, getConfig } from "@/lib/config";
import { CONFIG_TABS, ENCRYPTED_KEYS } from "@/lib/config/tabs";
import { encrypt, decrypt } from "@/lib/encryption";

export async function saveConfigTabAction(tabKey: string, formData: FormData) {
  await requirePermission("config");
  const tab = CONFIG_TABS.find((t) => t.key === tabKey);
  if (!tab) throw new Error("Unknown tab");
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
    setConfig(field.key, value);
  }
  revalidatePath("/config");
  return { ok: true, tab: tabKey };
}

export async function testEmailAction(to: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("config");
  // Placeholder: nodemailer sendMail with configured smtp_* values.
  return { ok: false, message: "Test email not yet wired (Phase 11)." };
}