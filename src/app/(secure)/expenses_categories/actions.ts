"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { expenseCategories } from "@/db/schema";

export async function saveCategoryAction(formData: FormData) {
  await requirePermission("expenses_categories");
  const db = getDbSync();
  const id = formData.get("expenseCategoryId") as string;
  const category = (formData.get("category") as string)?.trim();
  if (!category) throw new Error("Category name required");
  const data = {
    category,
    description: (formData.get("description") as string) || null,
  };
  if (id && parseInt(id, 10) > 0) {
    db.update(expenseCategories).set(data).where(eq(expenseCategories.expenseCategoryId, parseInt(id, 10))).run();
  } else {
    db.insert(expenseCategories).values(data).run();
  }
  revalidatePath("/expenses_categories");
  redirect("/expenses_categories");
}

export async function deleteCategoryAction(id: number) {
  await requirePermission("expenses_categories");
  const db = getDbSync();
  db.update(expenseCategories).set({ deleted: true }).where(eq(expenseCategories.expenseCategoryId, id)).run();
  revalidatePath("/expenses_categories");
}