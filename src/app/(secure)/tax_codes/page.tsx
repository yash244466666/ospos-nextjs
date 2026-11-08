import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { taxCodes } from "@/db/schema";
import TaxCodeTable from "@/components/taxes/tax-code-table";
import Link from "next/link";

export default async function TaxCodesPage() {
  await requirePermission("taxes");
  const db = await getDb();
  const rows = await db.select().from(taxCodes).where(eq(taxCodes.deleted, false));
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Tax Codes</h1>
        <Link href="/tax_codes/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">New</Link>
      </div>
      <TaxCodeTable rows={rows} />
    </div>
  );
}