import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { expenses, expenseCategories } from "@/db/schema";
import ExpenseForm from "@/components/expenses/expense-form";

export default async function ExpenseEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("expenses");
  const { id } = await params;
  const expenseId = parseInt(id, 10);
  const db = await getDb();
  const expenseRows = expenseId > 0
    ? await db.select().from(expenses).where(eq(expenses.expenseId, expenseId)).limit(1)
    : [];
  const expense = expenseRows[0] ?? null;
  const cats = await db.select().from(expenseCategories).where(eq(expenseCategories.deleted, false));
  return (
    <ExpenseForm
      initial={expense}
      categories={cats.map((c) => ({ expenseCategoryId: c.expenseCategoryId, category: c.categoryName ?? "" }))}
    />
  );
}