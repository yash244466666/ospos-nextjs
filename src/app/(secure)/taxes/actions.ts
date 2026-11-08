"use server";

import { revalidatePath } from "next/cache";
import { insertReturning } from "@/lib/db/insert";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { taxRates } from "@/db/schema";
import { toDbDecimal } from "@/lib/money";

export async function saveTaxRateAction(formData: FormData) {
  await requirePermission("taxes");
  const db = await getDb();
  const id = parseInt((formData.get("taxCodeLinkId") as string) || "0", 10);
  const taxCodeId = parseInt((formData.get("taxCodeId") as string) || "0", 10);
  const taxCategoryId = parseInt((formData.get("taxCategoryId") as string) || "0", 10);
  const jurisdictionId = parseInt((formData.get("jurisdictionId") as string) || "0", 10);
  const taxRate = toDbDecimal(parseFloat((formData.get("taxRate") as string) || "0") || 0, 4);
  const roundCode = parseInt((formData.get("roundCode") as string) || "1", 10) || 1;
  if (!taxCodeId || !taxCategoryId || !jurisdictionId) throw new Error("Code, category, and jurisdiction required");
  const data = {
    rateTaxCodeId: taxCodeId,
    rateTaxCategoryId: taxCategoryId,
    rateJurisdictionId: jurisdictionId,
    taxRate,
    taxRoundingCode: roundCode,
  };
  let outId: number;
  if (id > 0) {
    await db.update(taxRates).set(data).where(eq(taxRates.taxRateId, id));
    outId = id;
  } else {
    const inserted = await insertReturning(db, taxRates, data, taxRates.taxRateId);
    outId = inserted[0].id;
  }
  revalidatePath("/taxes");
  redirect(`/taxes/new/${outId}`);
}

export async function deleteTaxRateAction(taxCodeLinkId: number) {
  await requirePermission("taxes");
  const db = await getDb();
  await db.delete(taxRates).where(eq(taxRates.taxRateId, taxCodeLinkId));
  revalidatePath("/taxes");
}