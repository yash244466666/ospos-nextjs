import { requirePermission } from "@/lib/auth/with-permission";
import { getInfo as getCategory } from "@/lib/expenses_categories/repository";
import CategoryForm from "@/components/expenses/category-form";

export default async function CategoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("expenses_categories");
  const { id } = await params;
  const catId = parseInt(id, 10);
  const cat = catId > 0 ? await getCategory(catId) : null;
  return <CategoryForm initial={cat} />;
}
