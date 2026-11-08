import { requirePermission } from "@/lib/auth/with-permission";
import { renderToBuffer } from "@react-pdf/renderer";
import { WorkOrderDocument } from "@/lib/pdf/work_order";
import { buildReceiptData } from "@/lib/pdf/data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("sales");
  const { id } = await params;
  const saleId = parseInt(id, 10);
  const data = await buildReceiptData(saleId);
  if (!data) return new Response("Sale not found", { status: 404 });
  const buffer = await renderToBuffer(<WorkOrderDocument data={data} />);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="work-order-${saleId}.pdf"` },
  });
}