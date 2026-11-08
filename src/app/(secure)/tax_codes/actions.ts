"use server";

import { revalidatePath } from "next/cache";
import { insertReturning } from "@/lib/db/insert";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { taxCodes } from "@/db/schema";

export async function saveTaxCodeAction(formData: FormData) {
  await requirePermission("taxes");
  const db = await getDb();
  const id = parseInt((formData.get("taxCodeId") as string) || "0", 10);
  const taxCode = ((formData.get("taxCode") as string) || "").trim();
  const taxCodeName = ((formData.get("taxCodeName") as string) || "").trim();
  const city = (formData.get("city") as string) || "";
  const state = (formData.get("state") as string) || "";
  if (!taxCode || !taxCodeName) throw new Error("Code and name required");
  const data = { taxCode, taxCodeName, city, state };
  let outId: number;
  if (id > 0) {
    await db.update(taxCodes).set(data).where(eq(taxCodes.taxCodeId, id));
    outId = id;
  } else {
    const inserted = await insertReturning(db, taxCodes, { ...data, deleted: false }, taxCodes.taxCodeId);
    outId = inserted[0].id;
  }
  revalidatePath("/tax_codes");
  redirect(`/tax_codes/new/${outId}`);
}

export async function deleteTaxCodeAction(taxCodeId: number) {
  await requirePermission("taxes");
  const db = await getDb();
  await db.update(taxCodes).set({ deleted: true }).where(eq(taxCodes.taxCodeId, taxCodeId));
  revalidatePath("/tax_codes");
}
import { getAllTaxCodes, getTaxCode, getTaxCodeSearchSuggestions, getTaxCodeLinks, saveTaxCode } from "@/lib/taxes/repository";
export async function suggestTaxCodesAction(term: string) { await requirePermission("tax_codes"); return getTaxCodeSearchSuggestions(term); }
export async function getTaxCodeRowAction(id: number) { await requirePermission("tax_codes"); return getTaxCode(id); }
export async function getTaxCodeLinksAction(taxCodeId: number) { await requirePermission("tax_codes"); return getTaxCodeLinks(taxCodeId); }
export async function saveTaxCodeWithLinksAction(input: Parameters<typeof saveTaxCode>[0]) { await requirePermission("tax_codes"); return saveTaxCode(input); }
export { getAllTaxCodes };
