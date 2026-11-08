import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { taxCodes } from "@/db/schema";
import TaxCodeForm from "@/components/taxes/tax-code-form";

export default async function TaxCodeEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const taxCodeId = parseInt(id, 10);
  const db = await getDb();
  const rows = taxCodeId > 0
    ? await db.select().from(taxCodes).where(eq(taxCodes.taxCodeId, taxCodeId)).limit(1)
    : [];
  const row = rows[0] ?? null;
  return <TaxCodeForm initial={row} />;
}