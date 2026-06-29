"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { taxCategories } from "@/db/schema";

export async function saveTaxCategoryAction(formData: FormData) {
  await requirePermission("taxes");
  const db = getDbSync();
  const id = parseInt((formData.get("taxCategoryId") as string) || "0", 10);
  const taxCategory = ((formData.get("taxCategory") as string) || "").trim();
  const taxGroupSeq = (formData.get("taxGroupSeq") as string) || null;
  if (!taxCategory) throw new Error("Name required");
  const data = { taxCategory, taxGroupSeq };
  let outId: number;
  if (id > 0) {
    db.update(taxCategories).set(data).where(eq(taxCategories.taxCategoryId, id)).run();
    outId = id;
  } else {
    outId = db.insert(taxCategories).values({ ...data, deleted: false }).returning({ id: taxCategories.taxCategoryId }).get().id;
  }
  revalidatePath("/tax_categories");
  redirect(`/tax_categories/new/${outId}`);
}

export async function deleteTaxCategoryAction(taxCategoryId: number) {
  await requirePermission("taxes");
  const db = getDbSync();
  db.update(taxCategories).set({ deleted: true }).where(eq(taxCategories.taxCategoryId, taxCategoryId)).run();
  revalidatePath("/tax_categories");
}