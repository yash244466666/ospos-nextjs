import { requirePermission } from "@/lib/auth/with-permission";
import { getTaxCategory } from "@/lib/taxes/repository";
import TaxCategoryForm from "@/components/taxes/tax-category-form";

export default async function TaxCategoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const taxCategoryId = parseInt(id, 10);
  const row = taxCategoryId > 0 ? await getTaxCategory(taxCategoryId) : null;
  return <TaxCategoryForm initial={row} />;
}