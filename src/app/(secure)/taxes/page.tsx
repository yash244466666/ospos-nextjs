import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { taxCodeLinks, taxCodes, taxCategories, taxJurisdictions } from "@/db/schema";
import TaxRateTable from "@/components/taxes/tax-rate-table";
import Link from "next/link";

export default async function TaxesPage() {
  await requirePermission("taxes");
  const db = getDbSync();
  const rates = db.select({
    taxCodeLinkId: taxCodeLinks.taxCodeLinkId,
    taxRate: taxCodeLinks.taxRate,
    roundCode: taxCodeLinks.roundCode,
    cascadeSequence: taxCodeLinks.cascadeSequence,
    taxCode: taxCodes.taxCode,
    taxCodeName: taxCodes.taxCodeName,
    taxCategory: taxCategories.taxCategory,
    jurisdictionName: taxJurisdictions.jurisdictionName,
  })
    .from(taxCodeLinks)
    .innerJoin(taxCodes, eq(taxCodes.taxCodeId, taxCodeLinks.taxCodeId))
    .innerJoin(taxCategories, eq(taxCategories.taxCategoryId, taxCodeLinks.taxCategoryId))
    .innerJoin(taxJurisdictions, eq(taxJurisdictions.jurisdictionId, taxCodeLinks.jurisdictionId))
    .all();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Tax Rates</h1>
        <Link href="/taxes/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">New</Link>
      </div>
      <TaxRateTable rows={rates} />
    </div>
  );
}