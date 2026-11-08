"use server";

import { revalidatePath } from "next/cache";
import { insertReturning } from "@/lib/db/insert";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { taxJurisdictions } from "@/db/schema";

export async function saveTaxJurisdictionAction(formData: FormData) {
  await requirePermission("taxes");
  const db = await getDb();
  const id = parseInt((formData.get("jurisdictionId") as string) || "0", 10);
  const jurisdictionName = ((formData.get("jurisdictionName") as string) || "").trim();
  const taxType = Number((formData.get("taxType") as string) || "0") || 0;
  const reportingAuthority = (formData.get("reportingAuthority") as string) || null;
  const taxGroup = (formData.get("taxGroup") as string) || "";
  const cascadeSequence = parseInt((formData.get("cascadeSequence") as string) || "0", 10) || 0;
  if (!jurisdictionName || !taxType) throw new Error("Name and tax type required");
  const data = { jurisdictionName, taxType, reportingAuthority, taxGroup, cascadeSequence };
  let outId: number;
  if (id > 0) {
    await db.update(taxJurisdictions).set(data).where(eq(taxJurisdictions.jurisdictionId, id));
    outId = id;
  } else {
    const inserted = await insertReturning(db, taxJurisdictions, { ...data, deleted: false }, taxJurisdictions.jurisdictionId);
    outId = inserted[0].id;
  }
  revalidatePath("/tax_jurisdictions");
  redirect(`/tax_jurisdictions/new/${outId}`);
}

export async function deleteTaxJurisdictionAction(jurisdictionId: number) {
  await requirePermission("taxes");
  const db = await getDb();
  await db.update(taxJurisdictions).set({ deleted: true }).where(eq(taxJurisdictions.jurisdictionId, jurisdictionId));
  revalidatePath("/tax_jurisdictions");
}
import { getAllJurisdictions, getJurisdiction, saveJurisdiction } from "@/lib/taxes/repository";
export async function getJurisdictionRowAction(id: number) { await requirePermission("tax_jurisdictions"); return getJurisdiction(id); }
export async function saveJurisdictionAction(input: Parameters<typeof saveJurisdiction>[0]) { await requirePermission("tax_jurisdictions"); return saveJurisdiction(input); }
export { getAllJurisdictions };
