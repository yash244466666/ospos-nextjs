import { requirePermission } from "@/lib/auth/with-permission";
import { getAllTaxCategories } from "@/lib/taxes/repository";
import TaxCategoryTable from "@/components/taxes/tax-category-table";
import Link from "next/link";

export default async function TaxCategoriesPage() {
  await requirePermission("taxes");
  const rows = await getAllTaxCategories();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Tax Categories</h1>
        <Link href="/tax_categories/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">New</Link>
      </div>
      <TaxCategoryTable rows={rows} />
    </div>
  );
}