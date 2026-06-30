import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { expenses, expenseCategories } from "@/db/schema";
import ExpensesTable from "@/components/expenses/expenses-table";
import Link from "next/link";

export default async function ExpensesPage() {
  await requirePermission("expenses");
  const db = getDbSync();
  const rows = db.select().from(expenses).where(eq(expenses.deleted, false)).all();
  const cats = db.select().from(expenseCategories).where(eq(expenseCategories.deleted, false)).all();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Expenses</h1>
        <Link href="/expenses/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New Expense</Link>
      </div>
      <div data-testid="data-table">
        <ExpensesTable rows={rows} categories={cats} />
      </div>
    </div>
  );
}