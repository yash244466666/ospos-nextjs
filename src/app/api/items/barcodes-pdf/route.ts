import { auth } from "@/lib/auth/options";
import { searchItems } from "@/lib/items/repository";
import { generateBarcodesPdf } from "@/lib/barcode";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.personId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const itemIds = idsParam ? idsParam.split(":").map(Number).filter(Boolean) : [];
  const rows = itemIds.length > 0
    ? searchItems({ searchText: "", limit: 200 }).rows.filter((r) => itemIds.includes(r.itemId))
    : searchItems({ searchText: "", limit: 50 }).rows;

  if (rows.length === 0) return new Response("No items", { status: 404 });

  const pdf = await generateBarcodesPdf(rows);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="barcodes-${Date.now()}.pdf"`,
    },
  });
}
