"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { expenseCategories } from "@/db/schema";

export async function saveCategoryAction(formData: FormData) {
  await requirePermission("expenses_categories");
  const db = await getDb();
  const id = formData.get("expenseCategoryId") as string;
  const category = (formData.get("category") as string)?.trim();
  if (!category) throw new Error("Category name required");
  const data = {
    categoryName: category,
    categoryDescription: (formData.get("description") as string) || "",
  };
  if (id && parseInt(id, 10) > 0) {
    await db.update(expenseCategories).set(data).where(eq(expenseCategories.expenseCategoryId, parseInt(id, 10)));
  } else {
    await db.insert(expenseCategories).values(data);
  }
  revalidatePath("/expenses_categories");
  redirect("/expenses_categories");
}

export async function deleteCategoryAction(id: number) {
  await requirePermission("expenses_categories");
  const db = await getDb();
  await db.update(expenseCategories).set({ deleted: true }).where(eq(expenseCategories.expenseCategoryId, id));
  revalidatePath("/expenses_categories");
}
import { getAll as listAll, getInfo as info, search, getTotalRows } from "@/lib/expenses_categories/repository";
export async function searchCategoriesAction(term: string) { await requirePermission("expense_categories"); return search(term); }
export async function getCategoryRowAction(id: number) { await requirePermission("expense_categories"); return info(id); }
export async function getCategoryTotalRowsAction() { return getTotalRows(); }
export { listAll };
