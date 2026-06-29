// @ts-expect-error - bwip-js ships its own types but TypeScript can't always find them
import bwipjs from "bwip-js";

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

export function getBarcodeValue(item: { itemId: number; itemNumber: string | null; name: string }, content: "id" | "item_number" | "name" = "id"): string {
  if (content === "item_number" && item.itemNumber) return item.itemNumber;
  if (content === "name") return item.name;
  return String(item.itemId);
}