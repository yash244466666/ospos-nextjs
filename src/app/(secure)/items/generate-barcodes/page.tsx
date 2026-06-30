import { requirePermission } from "@/lib/auth/with-permission";
import { searchItems } from "@/lib/items/repository";
import { getConfig, getConfigBool } from "@/lib/config";
import { generateBarcodeSvg, getBarcodeValue, displayBarcode, type BarcodeConfig } from "@/lib/barcode";
import Link from "next/link";
import { Download } from "lucide-react";

async function renderBarcodeSvg(item: { itemId: number; itemNumber: string | null; name: string; category: string | null; costPrice: number; unitPrice: number }, cfg: BarcodeConfig): Promise<{ svg: string; row1: string; row2: string; row3: string }> {
  const value = getBarcodeValue(
    { itemId: item.itemId, itemNumber: item.itemNumber, name: item.name },
    cfg.content
  );
  const svg = await generateBarcodeSvg(value, cfg.type, {
    height: cfg.height,
    width: cfg.width / 100,
    fontSize: cfg.fontSize,
  });
  const displayed = displayBarcode(item, cfg);
  return { svg, row1: displayed.row1, row2: displayed.row2, row3: displayed.row3 };
}

export default async function GenerateBarcodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("items");
  const sp = await searchParams;
  const itemIds = sp.ids ? sp.ids.split(":").map(Number).filter(Boolean) : [];
  const rows = itemIds.length > 0
    ? searchItems({ searchText: "", limit: 200 }).rows.filter((r) => itemIds.includes(r.itemId))
    : searchItems({ searchText: "", limit: 50 }).rows;

  const cfg: BarcodeConfig = {
    content: getConfig("barcode_content", "id") as "id" | "item_number" | "name",
    type: getConfig("barcode_type", "C128"),
    height: parseInt(getConfig("barcode_height", "50"), 10),
    width: parseInt(getConfig("barcode_width", "250"), 10),
    fontSize: parseInt(getConfig("barcode_font_size", "10"), 10),
    font: getConfig("barcode_font", "Arial"),
    firstRow: getConfig("barcode_first_row", "name"),
    secondRow: getConfig("barcode_second_row", "category"),
    thirdRow: getConfig("barcode_third_row", "cost_price"),
    numInRow: parseInt(getConfig("barcode_num_in_row", "2"), 10),
    pageWidth: parseInt(getConfig("barcode_page_width", "150"), 10),
    pageCellspacing: parseInt(getConfig("barcode_page_cellspacing", "5"), 10),
    generateIfEmpty: getConfigBool("barcode_generate_if_empty", true),
  };

  const barcodes = await Promise.all(
    rows.map((item) => renderBarcodeSvg({ ...item, category: item.category ?? "", costPrice: item.costPrice, unitPrice: item.unitPrice }, cfg))
  );

  const pdfUrl = `/api/items/barcodes-pdf${itemIds.length > 0 ? `?ids=${itemIds.join(":")}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Generate Barcodes</h1>
        <div className="flex items-center gap-2">
          <Link
            href={pdfUrl}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" /> Download PDF
          </Link>
          <Link href="/items" className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50">
            Back to Items
          </Link>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Preview ({rows.length} items). Use the Download PDF button for a printable barcode sheet.
      </p>

      <div
        className="grid gap-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
        style={{
          gridTemplateColumns: `repeat(${cfg.numInRow}, minmax(0, 1fr))`,
          maxWidth: `${cfg.pageWidth}%`,
        }}
      >
        {rows.map((item, index) => (
          <div
            key={item.itemId}
            className="border border-slate-200 rounded p-2 text-center"
            style={{ margin: `${cfg.pageCellspacing}px` }}
          >
            <div
              className="text-xs flex justify-center"
              dangerouslySetInnerHTML={{ __html: barcodes[index].svg }}
            />
            {barcodes[index].row1 && <div className="text-xs font-medium mt-1 truncate">{barcodes[index].row1}</div>}
            {barcodes[index].row2 && <div className="text-xs text-slate-600 truncate">{barcodes[index].row2}</div>}
            {barcodes[index].row3 && <div className="text-xs text-slate-500 truncate">{barcodes[index].row3}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
