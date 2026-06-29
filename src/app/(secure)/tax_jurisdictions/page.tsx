import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { taxJurisdictions } from "@/db/schema";
import TaxJurisdictionTable from "@/components/taxes/tax-jurisdiction-table";
import Link from "next/link";

export default async function TaxJurisdictionsPage() {
  await requirePermission("taxes");
  const db = getDbSync();
  const rows = db.select().from(taxJurisdictions).where(eq(taxJurisdictions.deleted, false)).all();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Tax Jurisdictions</h1>
        <Link href="/tax_jurisdictions/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">New</Link>
      </div>
      <TaxJurisdictionTable rows={rows} />
    </div>
  );
}