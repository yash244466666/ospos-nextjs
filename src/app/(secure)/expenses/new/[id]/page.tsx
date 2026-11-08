import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { expenses, expenseCategories, suppliers, people } from "@/db/schema";
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
  const supplierRows = await db
    .select({
      personId: suppliers.personId,
      companyName: suppliers.companyName,
      firstName: people.firstName,
      lastName: people.lastName,
    })
    .from(suppliers)
    .innerJoin(people, eq(people.personId, suppliers.personId))
    .where(eq(suppliers.deleted, false));
  return (
    <ExpenseForm
      initial={expense}
      categories={cats.map((c) => ({ expenseCategoryId: c.expenseCategoryId, category: c.categoryName ?? "" }))}
      suppliers={supplierRows.map((supplier) => ({
        personId: supplier.personId,
        label: supplier.companyName || `${supplier.firstName} ${supplier.lastName}`.trim(),
      }))}
    />
  );
}