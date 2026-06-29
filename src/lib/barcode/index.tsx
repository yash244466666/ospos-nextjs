import bwipjs from "bwip-js/node";
import { getConfig } from "@/lib/config";

export const SUPPORTED_BARCODES: Record<string, string> = {
  C32: "code32", C39: "code39", "C39+": "code39", "C39E": "code39",
  "C39E+": "code39", C93: "code93", S25: "std25", "S25+": "std25",
  I25: "int25", "I25+": "int25", C128: "code128", C128A: "code128",
  C128B: "code128", C128C: "code128", EAN2: "ean2", EAN5: "ean5",
  EAN8: "ean8", EAN13: "ean13", ITF14: "itf14", UPCA: "upca",
  UPCE: "upce", MSI: "msi", "MSI+": "msi", POSTNET: "postnet",
  PLANET: "planet", RMS4CC: "rms4cc", KIX: "kix", IMB: "imb",
  CODABAR: "codabar", CODE11: "code11", PHARMA: "pharmacode",
  PHARMA2T: "pharmacode2",
};

export function getListBarcodes(): Record<string, string> {
  return SUPPORTED_BARCODES;
}

export interface BarcodeConfig {
  content: "id" | "item_number" | "name";
  type: string;
  height: number;
  width: number;
  fontSize: number;
  font: string;
  firstRow: string;
  secondRow: string;
  thirdRow: string;
  numInRow: number;
  pageWidth: number;
  pageCellspacing: number;
  generateIfEmpty: boolean;
}

export function getBarcodeConfig(): BarcodeConfig {
  return {
    content: (getConfig("barcode_content", "id") as "id" | "item_number" | "name"),
    type: getConfig("barcode_type", "C128"),
    height: parseFloat(getConfig("barcode_height", "50")),
    width: parseFloat(getConfig("barcode_width", "2")),
    fontSize: parseFloat(getConfig("barcode_font_size", "10")),
    font: getConfig("barcode_font", "0"),
    firstRow: getConfig("barcode_first_row", "id"),
    secondRow: getConfig("barcode_second_row", "name"),
    thirdRow: getConfig("barcode_third_row", "unit_price"),
    numInRow: parseInt(getConfig("barcode_num_in_row", "1"), 10),
    pageWidth: parseFloat(getConfig("barcode_page_width", "100")),
    pageCellspacing: parseFloat(getConfig("barcode_page_cellspacing", "20")),
    generateIfEmpty: getConfig("barcode_generate_if_empty", "0") === "1",
  };
}

export async function generateBarcodeSvg(value: string, type: string, opts: { height?: number; width?: number; fontSize?: number } = {}): Promise<string> {
  const bcid = SUPPORTED_BARCODES[type] ?? "code128";
  return bwipjs.toSVG({
    bcid,
    text: value,
    height: opts.height ?? 50,
    width: opts.width ?? 2,
    includetext: true,
    textsize: opts.fontSize ?? 10,
    scale: 2,
  });
}

export async function generateReceiptBarcode(content: string): Promise<string> {
  return generateBarcodeSvg(content, "C128", { height: 30, width: 1, fontSize: 8 });
}

export function getBarcodeValue(item: { itemId: number; itemNumber: string | null; name: string }, content: "id" | "item_number" | "name" = "id"): string {
  if (content === "item_number" && item.itemNumber) return item.itemNumber;
  if (content === "name") return item.name;
  return String(item.itemId);
}

export function getFontName(file: string): string {
  return file.replace(/\.ttf$/i, "");
}

export function listFonts(folder: string): string[] {
  if (typeof window !== "undefined" || typeof require === "undefined") return [];
  try {
    const fs = require("fs") as typeof import("fs");
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith(".ttf"));
  } catch {
    return [];
  }
}

export function displayBarcode(item: { itemId: number; itemNumber: string | null; name: string; category?: string | null; costPrice?: number; unitPrice?: number }, config: BarcodeConfig): { row1: string; row2: string; row3: string; svgValue: string } {
  const row1 = (() => {
    switch (config.firstRow) {
      case "id": return String(item.itemId);
      case "item_number": return item.itemNumber ?? "";
      case "name": return item.name;
      case "category": return item.category ?? "";
      case "unit_price": return String(item.unitPrice ?? 0);
      case "cost_price": return String(item.costPrice ?? 0);
      default: return "";
    }
  })();
  const row2 = (() => {
    switch (config.secondRow) {
      case "id": return String(item.itemId);
      case "item_number": return item.itemNumber ?? "";
      case "name": return item.name;
      case "category": return item.category ?? "";
      case "unit_price": return String(item.unitPrice ?? 0);
      case "cost_price": return String(item.costPrice ?? 0);
      default: return "";
    }
  })();
  const row3 = (() => {
    switch (config.thirdRow) {
      case "id": return String(item.itemId);
      case "item_number": return item.itemNumber ?? "";
      case "name": return item.name;
      case "category": return item.category ?? "";
      case "unit_price": return String(item.unitPrice ?? 0);
      case "cost_price": return String(item.costPrice ?? 0);
      default: return "";
    }
  })();
  const svgValue = getBarcodeValue(item, config.content);
  return { row1, row2, row3, svgValue };
}

export async function generateBarcodesPdf(items: Array<{ itemId: number; itemNumber: string | null; name: string; unitPrice?: number; costPrice?: number; category?: string | null }>): Promise<Buffer> {
  const config = getBarcodeConfig();
  const { renderToBuffer, Document, Page, View, Text, Image } = await import("@react-pdf/renderer");
  const cells: Array<{ value: string; name: string; price: number; svg: string }> = [];
  for (const item of items) {
    const value = getBarcodeValue(item, config.content);
    const png = await bwipjs.toBuffer({
      bcid: config.type, text: value, scale: 2, height: config.height, includetext: false,
    });
    cells.push({ value, name: item.name, price: item.unitPrice ?? 0, svg: `data:image/png;base64,${png.toString("base64")}` });
  }
  const doc = (
    <Document>
      <Page size="A4" style={{ padding: 16, fontSize: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((c, i) => (
            <View key={i} style={{ width: "33%", padding: 4, border: "1pt solid #000", alignItems: "center" }}>
              <Image src={c.svg} style={{ width: 130, height: 50 }} />
              <Text>{c.value}</Text>
              <Text>{c.name}</Text>
              <Text>{c.price}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
