"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { taxJurisdictions } from "@/db/schema";

export async function saveTaxJurisdictionAction(formData: FormData) {
  await requirePermission("taxes");
  const db = getDbSync();
  const id = parseInt((formData.get("jurisdictionId") as string) || "0", 10);
  const jurisdictionName = ((formData.get("jurisdictionName") as string) || "").trim();
  const taxType = ((formData.get("taxType") as string) || "").trim();
  const reportingAuthority = (formData.get("reportingAuthority") as string) || null;
  const taxableAmount = parseFloat((formData.get("taxableAmount") as string) || "0") || 0;
  const taxRate = parseFloat((formData.get("taxRate") as string) || "0") || 0;
  const taxGroup = (formData.get("taxGroup") as string) || null;
  const roundCode = parseInt((formData.get("roundCode") as string) || "1", 10) || 1;
  const cascadeSequence = parseInt((formData.get("cascadeSequence") as string) || "0", 10) || 0;
  if (!jurisdictionName || !taxType) throw new Error("Name and tax type required");
  const data = { jurisdictionName, taxType, reportingAuthority, taxableAmount, taxRate, taxGroup, roundCode, cascadeSequence };
  let outId: number;
  if (id > 0) {
    db.update(taxJurisdictions).set(data).where(eq(taxJurisdictions.jurisdictionId, id)).run();
    outId = id;
  } else {
    outId = db.insert(taxJurisdictions).values({ ...data, deleted: false }).returning({ id: taxJurisdictions.jurisdictionId }).get().id;
  }
  revalidatePath("/tax_jurisdictions");
  redirect(`/tax_jurisdictions/new/${outId}`);
}

export async function deleteTaxJurisdictionAction(jurisdictionId: number) {
  await requirePermission("taxes");
  const db = getDbSync();
  db.update(taxJurisdictions).set({ deleted: true }).where(eq(taxJurisdictions.jurisdictionId, jurisdictionId)).run();
  revalidatePath("/tax_jurisdictions");
}
import { getAllJurisdictions, getJurisdiction, saveJurisdiction } from "@/lib/taxes/repository";
export async function getJurisdictionRowAction(id: number) { await requirePermission("tax_jurisdictions"); return getJurisdiction(id); }
export async function saveJurisdictionAction(input: any) { await requirePermission("tax_jurisdictions"); return saveJurisdiction(input); }
export { getAllJurisdictions };
