import { requirePermission } from "@/lib/auth/with-permission";
import { SaleDocument } from "@/components/sales/document-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("reports", "reports_sales");
  const { id } = await params;
  return <SaleDocument kind="receipt" saleId={Number(id)} />;
}
