import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { taxRates, taxCodes, taxCategories, taxJurisdictions } from "@/db/schema";
import TaxRateTable from "@/components/taxes/tax-rate-table";
import Link from "next/link";

export default async function TaxesPage() {
  await requirePermission("taxes");
  const db = await getDb();
  const rates = await db.select({
    taxCodeLinkId: taxRates.taxRateId,
    taxRate: taxRates.taxRate,
    roundCode: taxRates.taxRoundingCode,
    cascadeSequence: taxJurisdictions.cascadeSequence,
    taxCode: taxCodes.taxCode,
    taxCodeName: taxCodes.taxCodeName,
    taxCategory: taxCategories.taxCategory,
    jurisdictionName: taxJurisdictions.jurisdictionName,
  })
    .from(taxRates)
    .innerJoin(taxCodes, eq(taxCodes.taxCodeId, taxRates.rateTaxCodeId))
    .innerJoin(taxCategories, eq(taxCategories.taxCategoryId, taxRates.rateTaxCategoryId))
    .innerJoin(taxJurisdictions, eq(taxJurisdictions.jurisdictionId, taxRates.rateJurisdictionId));
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Tax Rates</h1>
        <Link href="/taxes/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New</Link>
      </div>
      <div data-testid="data-table">
        <TaxRateTable rows={rates} />
      </div>
    </div>
  );
}
