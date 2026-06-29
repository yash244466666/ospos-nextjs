import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { taxCategories } from "@/db/schema";
import TaxCategoryForm from "@/components/taxes/tax-category-form";

export default async function TaxCategoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const taxCategoryId = parseInt(id, 10);
  const db = getDbSync();
  const row = taxCategoryId > 0 ? (db.select().from(taxCategories).where(eq(taxCategories.taxCategoryId, taxCategoryId)).get() ?? null) : null;
  return <TaxCategoryForm initial={row} />;
}