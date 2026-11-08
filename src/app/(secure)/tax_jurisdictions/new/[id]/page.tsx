import { requirePermission } from "@/lib/auth/with-permission";
import { getJurisdiction } from "@/lib/taxes/repository";
import TaxJurisdictionForm from "@/components/taxes/tax-jurisdiction-form";

export default async function TaxJurisdictionEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("taxes");
  const { id } = await params;
  const jurisdictionId = parseInt(id, 10);
  const row = jurisdictionId > 0 ? await getJurisdiction(jurisdictionId) : null;
  return <TaxJurisdictionForm initial={row} />;
}