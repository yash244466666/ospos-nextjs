import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { taxCodes } from "@/db/schema";
import TaxCodeForm from "@/components/taxes/tax-code-form";

export default async function TaxCodeEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const taxCodeId = parseInt(id, 10);
  const db = getDbSync();
  const row = taxCodeId > 0 ? (db.select().from(taxCodes).where(eq(taxCodes.taxCodeId, taxCodeId)).get() ?? null) : null;
  return <TaxCodeForm initial={row} />;
}