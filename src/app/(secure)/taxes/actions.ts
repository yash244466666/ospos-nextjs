"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { taxCodeLinks } from "@/db/schema";

export async function saveTaxRateAction(formData: FormData) {
  await requirePermission("taxes");
  const db = getDbSync();
  const id = parseInt((formData.get("taxCodeLinkId") as string) || "0", 10);
  const taxCodeId = parseInt((formData.get("taxCodeId") as string) || "0", 10);
  const taxCategoryId = parseInt((formData.get("taxCategoryId") as string) || "0", 10);
  const jurisdictionId = parseInt((formData.get("jurisdictionId") as string) || "0", 10);
  const taxRate = parseFloat((formData.get("taxRate") as string) || "0") || 0;
  const roundCode = parseInt((formData.get("roundCode") as string) || "1", 10) || 1;
  const cascadeSequence = parseInt((formData.get("cascadeSequence") as string) || "0", 10) || 0;
  if (!taxCodeId || !taxCategoryId || !jurisdictionId) throw new Error("Code, category, and jurisdiction required");
  const data = { taxCodeId, taxCategoryId, jurisdictionId, taxRate, roundCode, cascadeSequence };
  let outId: number;
  if (id > 0) {
    db.update(taxCodeLinks).set(data).where(eq(taxCodeLinks.taxCodeLinkId, id)).run();
    outId = id;
  } else {
    outId = db.insert(taxCodeLinks).values(data).returning({ id: taxCodeLinks.taxCodeLinkId }).get().id;
  }
  revalidatePath("/taxes");
  redirect(`/taxes/new/${outId}`);
}

export async function deleteTaxRateAction(taxCodeLinkId: number) {
  await requirePermission("taxes");
  const db = getDbSync();
  db.delete(taxCodeLinks).where(eq(taxCodeLinks.taxCodeLinkId, taxCodeLinkId)).run();
  revalidatePath("/taxes");
}