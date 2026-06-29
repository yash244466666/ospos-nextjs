import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { taxJurisdictions } from "@/db/schema";
import TaxJurisdictionForm from "@/components/taxes/tax-jurisdiction-form";

export default async function TaxJurisdictionEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const jurisdictionId = parseInt(id, 10);
  const db = getDbSync();
  const row = jurisdictionId > 0 ? (db.select().from(taxJurisdictions).where(eq(taxJurisdictions.jurisdictionId, jurisdictionId)).get() ?? null) : null;
  return <TaxJurisdictionForm initial={row} />;
}