import { requirePermission } from "@/lib/auth/with-permission";
import { searchItems } from "@/lib/items/repository";
import { getConfig, getConfigBool } from "@/lib/config";
import { generateBarcodeSvg, getBarcodeValue, type BarcodeConfig } from "@/lib/barcode";
import Link from "next/link";

async function renderBarcodeSvg(item: { itemId: number; itemNumber: string | null; name: string; unitPrice: number }, cfg: BarcodeConfig): Promise<string> {
  const value = getBarcodeValue(
    { itemId: item.itemId, itemNumber: item.itemNumber, name: item.name },
    cfg.content
  );
  return generateBarcodeSvg(value, cfg.type, {
    height: cfg.height,
    width: cfg.width / 100,
    fontSize: cfg.fontSize,
  });
}

export default async function GenerateBarcodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("items");
  const sp = await searchParams;
  const itemIds = sp.ids ? sp.ids.split(":").map(Number) : [];
  const items = itemIds.length > 0
    ? searchItems({ searchText: "", limit: 100 }).rows.filter((r) => itemIds.includes(r.itemId))
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

  const barcodes = await Promise.all(items.map((item) => renderBarcodeSvg(item, cfg)));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Generate Barcodes</h1>
        <Link href="/items" className="text-blue-600 hover:underline text-sm">Back to Items</Link>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Click a barcode to print (use browser print dialog).
      </p>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${cfg.numInRow}, 1fr)`,
          maxWidth: `${cfg.pageWidth}mm`,
        }}
      >
        {items.map((item, index) => (
          <div
            key={item.itemId}
            className="border border-slate-200 p-2 text-center"
            style={{ margin: `${cfg.pageCellspacing}px` }}
          >
            <div
              className="text-xs truncate"
              dangerouslySetInnerHTML={{ __html: barcodes[index] }}
            />
            <div className="text-xs font-medium mt-1 truncate">{item.name}</div>
            <div className="text-xs text-slate-500">${item.unitPrice.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}