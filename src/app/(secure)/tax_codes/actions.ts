"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { taxCodes } from "@/db/schema";

export async function saveTaxCodeAction(formData: FormData) {
  await requirePermission("taxes");
  const db = getDbSync();
  const id = parseInt((formData.get("taxCodeId") as string) || "0", 10);
  const taxCode = ((formData.get("taxCode") as string) || "").trim();
  const taxCodeName = ((formData.get("taxCodeName") as string) || "").trim();
  const city = (formData.get("city") as string) || null;
  const state = (formData.get("state") as string) || null;
  if (!taxCode || !taxCodeName) throw new Error("Code and name required");
  const data = { taxCode, taxCodeName, city, state };
  let outId: number;
  if (id > 0) {
    db.update(taxCodes).set(data).where(eq(taxCodes.taxCodeId, id)).run();
    outId = id;
  } else {
    outId = db.insert(taxCodes).values({ ...data, deleted: false }).returning({ id: taxCodes.taxCodeId }).get().id;
  }
  revalidatePath("/tax_codes");
  redirect(`/tax_codes/new/${outId}`);
}

export async function deleteTaxCodeAction(taxCodeId: number) {
  await requirePermission("taxes");
  const db = getDbSync();
  db.update(taxCodes).set({ deleted: true }).where(eq(taxCodes.taxCodeId, taxCodeId)).run();
  revalidatePath("/tax_codes");
}