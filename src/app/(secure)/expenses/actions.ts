"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { expenses } from "@/db/schema";
import { toDbDecimal } from "@/lib/money";

export async function saveExpenseAction(formData: FormData) {
  const session = await requirePermission("expenses");
  const db = await getDb();
  const id = formData.get("expenseId") as string;
  const amount = parseFloat((formData.get("amount") as string) || "0") || 0;
  if (amount <= 0) throw new Error("Amount must be positive");
  const expenseCategoryId =
    parseInt((formData.get("expenseCategoryId") as string) || "0", 10) || 0;
  if (!expenseCategoryId) throw new Error("Expense category is required");
  const data: typeof expenses.$inferInsert = {
    amount: toDbDecimal(amount, 2),
    paymentType: (formData.get("paymentType") as string) || "cash",
    expenseCategoryId,
    description: (formData.get("description") as string) || "",
    employeeId: session!.user.personId as number,
  };
  if (id && parseInt(id, 10) > 0) {
    await db.update(expenses).set(data).where(eq(expenses.expenseId, parseInt(id, 10)));
  } else {
    await db.insert(expenses).values(data);
  }
  revalidatePath("/expenses");
  redirect("/expenses");
}

export async function deleteExpenseAction(expenseId: number) {
  await requirePermission("expenses");
  const db = await getDb();
  await db.update(expenses).set({ deleted: true }).where(eq(expenses.expenseId, expenseId));
  revalidatePath("/expenses");
}

export async function listExpensesAction() {
  await requirePermission("expenses");
  const db = await getDb();
  return db.select().from(expenses).where(eq(expenses.deleted, false));
}
import { getAll, getInfo as info, search, getTotalRows, getEmptyRow } from "@/lib/expenses/repository";
export async function searchExpensesAction(filters: Parameters<typeof search>[1]) { await requirePermission("expenses"); return search("", filters); }
export async function getExpenseRowAction(expenseId: number) { await requirePermission("expenses"); return info(expenseId); }
export async function getExpenseTotalRowsAction() { return getTotalRows(); }
export { getAll, getEmptyRow };
