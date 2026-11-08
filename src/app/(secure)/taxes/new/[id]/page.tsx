import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { taxRates, taxCodes, taxCategories, taxJurisdictions } from "@/db/schema";
import TaxRateForm from "@/components/taxes/tax-rate-form";

export default async function TaxRateEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const taxRateId = parseInt(id, 10);
  const db = await getDb();
  const rateRows = taxRateId > 0
    ? await db.select().from(taxRates).where(eq(taxRates.taxRateId, taxRateId)).limit(1)
    : [];
  const rate = rateRows[0] ?? null;
  const codes = await db.select({ taxCodeId: taxCodes.taxCodeId, taxCode: taxCodes.taxCode, taxCodeName: taxCodes.taxCodeName })
    .from(taxCodes).where(eq(taxCodes.deleted, false));
  const cats = await db.select({ taxCategoryId: taxCategories.taxCategoryId, taxCategory: taxCategories.taxCategory })
    .from(taxCategories).where(eq(taxCategories.deleted, false));
  const jurs = await db.select({ jurisdictionId: taxJurisdictions.jurisdictionId, jurisdictionName: taxJurisdictions.jurisdictionName })
    .from(taxJurisdictions).where(eq(taxJurisdictions.deleted, false));
  const jurisdictionRows = rate
    ? await db.select({ cascadeSequence: taxJurisdictions.cascadeSequence })
        .from(taxJurisdictions)
        .where(eq(taxJurisdictions.jurisdictionId, rate.rateJurisdictionId))
        .limit(1)
    : [];
  const initial = rate
    ? {
        taxCodeLinkId: rate.taxRateId,
        taxCodeId: rate.rateTaxCodeId,
        taxCategoryId: rate.rateTaxCategoryId,
        jurisdictionId: rate.rateJurisdictionId,
        taxRate: Number(rate.taxRate),
        roundCode: rate.taxRoundingCode,
        cascadeSequence: jurisdictionRows[0]?.cascadeSequence ?? 0,
      }
    : null;
  return (
    <TaxRateForm
      initial={initial}
      codes={codes}
      categories={cats}
      jurisdictions={jurs.map((j) => ({ jurisdictionId: j.jurisdictionId, jurisdictionName: j.jurisdictionName ?? "" }))}
    />
  );
}
