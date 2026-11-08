import fs from "node:fs";
import bwipjs from "bwip-js/node";
import { getConfig } from "@/lib/config";
import { toCurrency } from "@/lib/i18n/format";
import { lang } from "@/lib/i18n/lang";

/** `Barcode_lib::$supported_barcodes` — keys are uppercase and case-insensitive on input. */
export const SUPPORTED_BARCODES: Record<string, string> = {
  C32: "code32",
  C39: "code39",
  "C39+": "code39",
  C39E: "code39ext",
  "C39E+": "code39ext",
  C93: "code93",
  S25: "std25",
  "S25+": "std25",
  I25: "int25",
  "I25+": "int25",
  C128: "code128",
  C128A: "code128",
  C128B: "code128",
  C128C: "code128",
  EAN2: "ean2",
  EAN5: "ean5",
  EAN8: "ean8",
  EAN13: "ean13",
  ITF14: "itf14",
  UPCA: "upca",
  UPCE: "upce",
  MSI: "msi",
  "MSI+": "msi",
  POSTNET: "postnet",
  PLANET: "planet",
  RMS4CC: "rms4cc",
  KIX: "kix",
  IMB: "imb",
  CODABAR: "codabar",
  CODE11: "code11",
  PHARMA: "pharmacode",
  PHARMA2T: "pharmacode2",
};

export function getListBarcodes(): Record<string, string> {
  return SUPPORTED_BARCODES;
}

export interface BarcodeConfig {
  company: string;
  content: string;
  type: string;
  font: string;
  fontSize: number;
  height: number;
  width: number;
  firstRow: string;
  secondRow: string;
  thirdRow: string;
  numInRow: number;
  pageWidth: number;
  pageCellspacing: number;
  generateIfEmpty: boolean;
  formats: string[];
}

export function getBarcodeConfig(): BarcodeConfig {
  const formatsRaw = getConfig("barcode_formats", "[]");
  let formats: string[] = [];
  try {
    const parsed = JSON.parse(formatsRaw) as unknown;
    if (Array.isArray(parsed)) {
      formats = parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    formats = [];
  }
  return {
    company: getConfig("company", ""),
    content: getConfig("barcode_content", "id"),
    type: getConfig("barcode_type", "C39"),
    font: getConfig("barcode_font", "Arial"),
    fontSize: Number(getConfig("barcode_font_size", "10")),
    height: Number(getConfig("barcode_height", "50")),
    width: Number(getConfig("barcode_width", "250")),
    firstRow: getConfig("barcode_first_row", "category"),
    secondRow: getConfig("barcode_second_row", "item_code"),
    thirdRow: getConfig("barcode_third_row", "unit_price"),
    numInRow: Number(getConfig("barcode_num_in_row", "2")),
    pageWidth: Number(getConfig("barcode_page_width", "100")),
    pageCellspacing: Number(getConfig("barcode_page_cellspacing", "20")),
    generateIfEmpty: getConfig("barcode_generate_if_empty", "0") === "1",
    formats: formatsRaw === "null" ? [] : formats,
  };
}

const CODE39_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

function mod10CheckDigit(value: string): string {
  let sum = 0;
  let weight = 3;
  for (let i = value.length - 1; i >= 0; i--) {
    const digit = value.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return "";
    sum += digit * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return String((10 - (sum % 10)) % 10);
}

function code39CheckDigit(value: string): string {
  let sum = 0;
  for (const ch of value.toUpperCase()) {
    const index = CODE39_CHARSET.indexOf(ch);
    if (index < 0) return "";
    sum += index;
  }
  return CODE39_CHARSET[sum % 43];
}

function applyChecksum(type: string, value: string): string {
  switch (type) {
    case "C39+":
      return value + code39CheckDigit(value);
    case "S25+":
    case "I25+":
      return value + mod10CheckDigit(value);
    case "MSI+": {
      let sum = 0;
      for (let i = value.length - 1, count = 0; i >= 0; i--, count++) {
        const digit = value.charCodeAt(i) - 48;
        if (digit < 0 || digit > 9) return "";
        if (count % 2 === 0) {
          const doubled = digit * 2;
          sum += doubled > 9 ? doubled - 9 : doubled;
        } else {
          sum += digit;
        }
      }
      return value + String((10 - (sum % 10)) % 10);
    }
    default:
      return value;
  }
}

export interface BarcodeItem {
  itemId: number;
  itemNumber: string | null;
  name: string;
  category?: string | null;
  costPrice?: string | number | null;
  unitPrice?: string | number | null;
}

/** `Barcode_lib::get_barcode_value`: any non-`id` content uses `item_number ?? name`. */
export function getBarcodeValue(item: BarcodeItem, content = "id"): string {
  return content !== "id" ? (item.itemNumber ?? item.name) : String(item.itemId);
}

/** Generates an SVG; returns "" on an unsupported type (upstream catches and returns ""). */
export async function generateBarcodeSvg(
  value: string,
  type: string,
  options: { height?: number; widthFactor?: number } = {},
): Promise<string> {
  const key = type.trim().toUpperCase();
  const bcid = SUPPORTED_BARCODES[key];
  if (!bcid) return "";
  const text = applyChecksum(key, value);
  try {
    return await bwipjs.toSVG({
      bcid,
      text,
      scale: options.widthFactor ?? 2,
      height: options.height ?? 30,
      includetext: false,
    });
  } catch {
    return "";
  }
}

/** Receipt barcode is always C128 with default width factor 2 and height 30. */
export function generateReceiptBarcode(content: string): Promise<string> {
  return generateBarcodeSvg(content, "C128");
}

function characterLimiter(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const slice = value.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > 0 ? slice.slice(0, lastSpace) : slice}…`;
}

function manageDisplayLayout(
  layoutType: string,
  item: BarcodeItem,
  config: BarcodeConfig,
): string {
  let result = "";
  switch (layoutType) {
    case "name":
      result = item.name;
      break;
    case "category":
      result = `${lang("Items.category")} ${item.category ?? ""}`;
      break;
    case "cost_price":
      result = `${lang("Items.cost_price")} ${toCurrency(String(item.costPrice ?? 0))}`;
      break;
    case "unit_price":
      result = `${lang("Items.unit_price")} ${toCurrency(String(item.unitPrice ?? 0))}`;
      break;
    case "company_name":
      result = config.company;
      break;
    case "item_code":
      result =
        config.content !== "id" && item.itemNumber !== null
          ? item.itemNumber
          : String(item.itemId);
      break;
    default:
      result = "";
  }
  return characterLimiter(result, 40);
}

export interface DisplayedBarcode {
  row1: string;
  row2: string;
  row3: string;
  svg: string;
}

export async function displayBarcode(
  item: BarcodeItem,
  config: BarcodeConfig = getBarcodeConfig(),
): Promise<DisplayedBarcode> {
  if (item.itemId === undefined || (item.itemNumber === null && item.name === undefined)) {
    return {
      row1: "Item number or Item ID not found in the item array.",
      row2: "",
      row3: "",
      svg: "",
    };
  }
  const value = getBarcodeValue(item, config.content);
  const svg = await generateBarcodeSvg(value, config.type, { height: config.height });
  return {
    row1: manageDisplayLayout(config.firstRow, item, config),
    row2: manageDisplayLayout(config.secondRow, item, config),
    row3: manageDisplayLayout(config.thirdRow, item, config),
    svg,
  };
}

export function getFontName(file: string): string {
  return file.replace(/\.ttf$/i, "");
}

export function listFonts(folder: string): string[] {
  try {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder).filter((file) => file.toLowerCase().endsWith(".ttf"));
  } catch {
    return [];
  }
}

export async function generateBarcodesPdf(items: BarcodeItem[]): Promise<Buffer> {
  const config = getBarcodeConfig();
  const { renderToBuffer, Document, Page, View, Text, Image } = await import("@react-pdf/renderer");
  const numInRow = config.numInRow > 0 ? config.numInRow : 1;
  const cellWidthPct = `${100 / numInRow}%`;
  const cells: Array<DisplayedBarcode & { png: string }> = [];
  for (const item of items) {
    const displayed = await displayBarcode(item, config);
    const bcid = SUPPORTED_BARCODES[config.type.toUpperCase()] ?? "code128";
    const png = await bwipjs.toBuffer({
      bcid,
      text: applyChecksum(config.type.toUpperCase(), getBarcodeValue(item, config.content)),
      scale: 2,
      height: config.height,
      includetext: false,
    });
    cells.push({ ...displayed, png: `data:image/png;base64,${png.toString("base64")}` });
  }
  const fontFamily =
    config.font && config.font !== "0" && config.font !== "Arial" ? config.font : "Helvetica";
  const doc = (
    <Document>
      <Page size="A4" style={{ padding: 16, fontSize: config.fontSize, fontFamily }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", width: `${config.pageWidth}%` }}>
          {cells.map((cell, index) => (
            <View
              key={index}
              style={{
                width: cellWidthPct,
                margin: config.pageCellspacing,
                padding: 4,
                border: "1pt solid #000",
                alignItems: "center",
              }}
            >
              <Image src={cell.png} style={{ width: "90%", height: config.height }} />
              {cell.row1 ? <Text style={{ fontSize: config.fontSize }}>{cell.row1}</Text> : null}
              {cell.row2 ? <Text style={{ fontSize: config.fontSize }}>{cell.row2}</Text> : null}
              {cell.row3 ? <Text style={{ fontSize: config.fontSize }}>{cell.row3}</Text> : null}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
