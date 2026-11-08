"use server";

import { revalidatePath } from "next/cache";
import { insertReturning } from "@/lib/db/insert";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { taxCategories } from "@/db/schema";

export async function saveTaxCategoryAction(formData: FormData) {
  await requirePermission("taxes");
  const db = await getDb();
  const id = parseInt((formData.get("taxCategoryId") as string) || "0", 10);
  const taxCategory = ((formData.get("taxCategory") as string) || "").trim();
  const taxGroupSequence = parseInt((formData.get("taxGroupSeq") as string) || "0", 10) || 0;
  if (!taxCategory) throw new Error("Name required");
  const data = { taxCategory, taxGroupSequence };
  let outId: number;
  if (id > 0) {
    await db.update(taxCategories).set(data).where(eq(taxCategories.taxCategoryId, id));
    outId = id;
  } else {
    const inserted = await insertReturning(db, taxCategories, { ...data, deleted: false }, taxCategories.taxCategoryId);
    outId = inserted[0].id;
  }
  revalidatePath("/tax_categories");
  redirect(`/tax_categories/new/${outId}`);
}

export async function deleteTaxCategoryAction(taxCategoryId: number) {
  await requirePermission("taxes");
  const db = await getDb();
  await db.update(taxCategories).set({ deleted: true }).where(eq(taxCategories.taxCategoryId, taxCategoryId));
  revalidatePath("/tax_categories");
}
import { getAllTaxCategories, getTaxCategory, getTaxCategorySuggestions } from "@/lib/taxes/repository";
export async function suggestTaxCategoriesAction(term: string) { await requirePermission("tax_categories"); return getTaxCategorySuggestions(term); }
export async function getTaxCategoryRowAction(id: number) { await requirePermission("tax_categories"); return getTaxCategory(id); }
export { getAllTaxCategories };
