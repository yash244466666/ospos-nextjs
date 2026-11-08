import { requirePermission } from "@/lib/auth/with-permission";
import { getAll as listCategories } from "@/lib/expenses_categories/repository";
import CategoriesTable from "@/components/expenses/categories-table";
import Link from "next/link";

export default async function ExpensesCategoriesPage() {
  await requirePermission("expenses_categories");
  const rows = await listCategories();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Expense Categories</h1>
        <Link href="/expenses_categories/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New</Link>
      </div>
      <div data-testid="data-table">
        <CategoriesTable rows={rows} />
      </div>
    </div>
  );
}