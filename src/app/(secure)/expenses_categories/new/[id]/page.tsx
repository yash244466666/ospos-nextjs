import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { expenseCategories } from "@/db/schema";
import CategoryForm from "@/components/expenses/category-form";

export default async function CategoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("expenses_categories");
  const { id } = await params;
  const catId = parseInt(id, 10);
  const db = getDbSync();
  const cat = catId > 0 ? (db.select().from(expenseCategories).where(eq(expenseCategories.expenseCategoryId, catId)).get() ?? null) : null;
  return <CategoryForm initial={cat} />;
}
