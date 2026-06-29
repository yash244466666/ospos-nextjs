import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { taxCodeLinks, taxCodes, taxCategories, taxJurisdictions } from "@/db/schema";
import TaxRateForm from "@/components/taxes/tax-rate-form";

export default async function TaxRateEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const taxCodeLinkId = parseInt(id, 10);
  const db = getDbSync();
  const rate = taxCodeLinkId > 0 ? (db.select().from(taxCodeLinks).where(eq(taxCodeLinks.taxCodeLinkId, taxCodeLinkId)).get() ?? null) : null;
  const codes = db.select({ taxCodeId: taxCodes.taxCodeId, taxCode: taxCodes.taxCode, taxCodeName: taxCodes.taxCodeName })
    .from(taxCodes).where(eq(taxCodes.deleted, false)).all();
  const cats = db.select({ taxCategoryId: taxCategories.taxCategoryId, taxCategory: taxCategories.taxCategory })
    .from(taxCategories).where(eq(taxCategories.deleted, false)).all();
  const jurs = db.select({ jurisdictionId: taxJurisdictions.jurisdictionId, jurisdictionName: taxJurisdictions.jurisdictionName })
    .from(taxJurisdictions).where(eq(taxJurisdictions.deleted, false)).all();
  return <TaxRateForm initial={rate} codes={codes} categories={cats} jurisdictions={jurs} />;
}