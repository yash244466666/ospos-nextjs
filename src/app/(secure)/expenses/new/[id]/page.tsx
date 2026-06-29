import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { expenses, expenseCategories } from "@/db/schema";
import ExpenseForm from "@/components/expenses/expense-form";

export default async function ExpenseEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("expenses");
  const { id } = await params;
  const expenseId = parseInt(id, 10);
  const db = getDbSync();
  const expense = expenseId > 0 ? (db.select().from(expenses).where(eq(expenses.expenseId, expenseId)).get() ?? null) : null;
  const cats = db.select().from(expenseCategories).where(eq(expenseCategories.deleted, false)).all();
  return <ExpenseForm initial={expense} categories={cats} />;
}