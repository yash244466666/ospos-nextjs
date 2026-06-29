"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { auth } from "@/lib/auth/options";
import { getDbSync } from "@/lib/db";
import { expenses } from "@/db/schema";

export async function saveExpenseAction(formData: FormData) {
  const session = await requirePermission("expenses");
  const db = getDbSync();
  const id = formData.get("expenseId") as string;
  const amount = parseFloat((formData.get("amount") as string) || "0") || 0;
  if (amount <= 0) throw new Error("Amount must be positive");
  const data: typeof expenses.$inferInsert = {
    amount,
    paymentType: (formData.get("paymentType") as string) || "cash",
    expenseCategoryId: parseInt((formData.get("expenseCategoryId") as string) || "0", 10) || null,
    description: (formData.get("description") as string) || null,
    employeeId: session!.user.personId as number,
  };
  if (id && parseInt(id, 10) > 0) {
    db.update(expenses).set(data).where(eq(expenses.expenseId, parseInt(id, 10))).run();
  } else {
    const inserted = db.insert(expenses).values(data).returning({ id: expenses.expenseId }).get();
    void inserted;
  }
  revalidatePath("/expenses");
  redirect("/expenses");
}

export async function deleteExpenseAction(expenseId: number) {
  await requirePermission("expenses");
  const db = getDbSync();
  db.update(expenses).set({ deleted: true }).where(eq(expenses.expenseId, expenseId)).run();
  revalidatePath("/expenses");
}

export async function listExpensesAction() {
  await requirePermission("expenses");
  const db = getDbSync();
  return db.select().from(expenses).where(eq(expenses.deleted, false)).all();
}