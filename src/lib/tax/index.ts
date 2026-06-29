import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes, taxCodeLinks, taxJurisdictions, taxCodes, taxCategories, customers, sales } from "@/db/schema";
import { getConfigBool, getConfigNumber, getConfig, taxDecimals, totalsDecimals } from "@/lib/config";
import { ROUNDING_MODE, TAX_TYPE } from "@/lib/constants";

export interface CartLine {
  itemId: number;
  quantity: number;
  price: number;
  discount: number;
  discountType: number;
  taxCategoryId: number | null;
  isSerialized: boolean;
  stockType?: number;
}

export interface ItemTax {
  itemId: number;
  line: number;
  name: string;
  percent: number;
  taxType: number;
  roundCode: number;
  cascadeSequence: number;
  itemTaxAmount: number;
}

export interface SaleTaxGroup {
  taxType: number;
  roundCode: number;
  taxGroup: string;
  saleTaxBasis: number;
  saleTaxAmount: number;
}

export function roundNumber(value: number, mode: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  switch (mode) {
    case ROUNDING_MODE.HALF_UP:
      return Math.round(scaled) / factor;
    case ROUNDING_MODE.HALF_DOWN: {
      const floor = Math.floor(scaled);
      return (scaled - floor > 0.5 ? floor + 1 : floor) / factor;
    }
    case ROUNDING_MODE.HALF_EVEN: {
      const floor = Math.floor(scaled);
      const diff = scaled - floor;
      if (diff > 0.5) return (floor + 1) / factor;
      if (diff < 0.5) return floor / factor;
      return (floor % 2 === 0 ? floor : floor + 1) / factor;
    }
    case ROUNDING_MODE.HALF_ODD: {
      const floor = Math.floor(scaled);
      const diff = scaled - floor;
      if (diff > 0.5) return (floor + 1) / factor;
      if (diff < 0.5) return floor / factor;
      return (floor % 2 === 0 ? floor + 1 : floor) / factor;
    }
    case ROUNDING_MODE.ROUND_UP:
      return Math.ceil(scaled) / factor;
    case ROUNDING_MODE.ROUND_DOWN:
      return Math.floor(scaled) / factor;
    case ROUNDING_MODE.HALF_FIVE:
      return Math.round(scaled * 2) / (factor * 2);
    default:
      return Math.round(scaled) / factor;
  }
}

export function getRoundingOptions(): { value: number; label: string }[] {
  return [
    { value: ROUNDING_MODE.HALF_UP, label: "Half Up" },
    { value: ROUNDING_MODE.HALF_DOWN, label: "Half Down" },
    { value: ROUNDING_MODE.HALF_EVEN, label: "Half Even" },
    { value: ROUNDING_MODE.HALF_ODD, label: "Half Odd" },
    { value: ROUNDING_MODE.ROUND_UP, label: "Round Up" },
    { value: ROUNDING_MODE.ROUND_DOWN, label: "Round Down" },
    { value: ROUNDING_MODE.HALF_FIVE, label: "Half Five" },
  ];
}

export function getTaxTypes(): Record<string, number> {
  return { INCLUDED: TAX_TYPE.INCLUDED, EXCLUDED: TAX_TYPE.EXCLUDED };
}

export function getTaxTypeOptions(selected?: number): { value: number; label: string }[] {
  return [
    { value: TAX_TYPE.INCLUDED, label: "Included" },
    { value: TAX_TYPE.EXCLUDED, label: "Excluded" },
  ];
}

export function getItemTotal(quantity: number, price: number, discount: number, discountType: number, includeDiscount: boolean): number {
  let total = quantity * price;
  if (includeDiscount) {
    if (discountType === 0) {
      total = total * (1 - discount / 100);
    } else {
      total = total - discount;
    }
  }
  return total;
}

export function getItemSalesTax(quantity: number, price: number, discount: number, discountType: number, taxPercent: number, roundingCode: number, taxDec = 2): number {
  const total = getItemTotal(quantity, price, discount, discountType, true);
  const tax = total * (taxPercent / 100);
  return roundNumber(tax, roundingCode, taxDec);
}

export function getTaxForAmount(taxBasis: number, percent: number, roundingMode: number, decimals: number): number {
  return roundNumber(taxBasis * (percent / 100), roundingMode, decimals);
}

export function getIncludedTax(quantity: number, price: number, discountPercent: number, discountType: number, taxPercent: number, taxDec = 2, roundingCode: number = ROUNDING_MODE.HALF_UP): number {
  const total = getItemTotal(quantity, price, discountPercent, discountType, true);
  const exclBase = total / (1 + taxPercent / 100);
  return roundNumber(total - exclBase, roundingCode, taxDec);
}

export function getTaxes(cart: CartLine[]): { taxes: SaleTaxGroup[]; itemTaxes: ItemTax[] } {
  const taxIncluded = getConfigBool("tax_included", false);
  const useDestinationBased = getConfigBool("use_destination_based_tax", false);
  const db = getDbSync();
  const accumulator = new Map<string, SaleTaxGroup>();
  const itemTaxes: ItemTax[] = [];

  for (const [idx, line] of cart.entries()) {
    const basis = getItemTotal(line.quantity, line.price, line.discount, line.discountType, true);
    let rates: { name: string; percent: number; taxType: number; roundCode: number; cascadeSequence: number }[] = [];

    if (useDestinationBased && line.taxCategoryId) {
      const defs = db
        .select({
          name: taxJurisdictions.jurisdictionName,
          percent: taxJurisdictions.taxRate,
          roundCode: taxJurisdictions.roundCode,
          cascadeSequence: taxJurisdictions.cascadeSequence,
          taxType: taxJurisdictions.taxType,
        })
        .from(taxCodeLinks)
        .innerJoin(taxJurisdictions, eq(taxJurisdictions.jurisdictionId, taxCodeLinks.jurisdictionId))
        .where(eq(taxCodeLinks.taxCategoryId, line.taxCategoryId))
        .all()
        .map((r) => ({ ...r, taxType: r.taxType === "INCLUDED" ? 0 : 1 }));
      rates = defs;
    } else {
      const itemRows = db.select().from(itemsTaxes).where(eq(itemsTaxes.itemId, line.itemId)).all();
      rates = itemRows.map((r) => ({
        name: r.name,
        percent: r.percent,
        taxType: taxIncluded ? 0 : 1,
        roundCode: ROUNDING_MODE.HALF_UP,
        cascadeSequence: 0,
      }));
    }

    let cumulativeBasis = basis;
    for (const rate of rates) {
      let taxAmount: number;
      if (rate.taxType === 0) {
        taxAmount = basis - basis / ((100 + rate.percent) / 100);
      } else {
        taxAmount = cumulativeBasis * (rate.percent / 100);
      }
      taxAmount = roundNumber(taxAmount, rate.roundCode, taxDecimals());
      const groupKey = `X${rate.percent}% ${rate.name}`;
      const existing = accumulator.get(groupKey);
      if (existing) {
        existing.saleTaxBasis = roundNumber(existing.saleTaxBasis + cumulativeBasis, ROUNDING_MODE.HALF_UP, 4);
        existing.saleTaxAmount = roundNumber(existing.saleTaxAmount + taxAmount, ROUNDING_MODE.HALF_UP, 4);
      } else {
        accumulator.set(groupKey, {
          taxType: rate.taxType,
          roundCode: rate.roundCode,
          taxGroup: groupKey,
          saleTaxBasis: roundNumber(cumulativeBasis, ROUNDING_MODE.HALF_UP, 4),
          saleTaxAmount: roundNumber(taxAmount, ROUNDING_MODE.HALF_UP, 4),
        });
      }
      itemTaxes.push({
        itemId: line.itemId,
        line: idx + 1,
        name: rate.name,
        percent: rate.percent,
        taxType: rate.taxType,
        roundCode: rate.roundCode,
        cascadeSequence: rate.cascadeSequence,
        itemTaxAmount: taxAmount,
      });
      if (rate.cascadeSequence > 0) {
        cumulativeBasis = roundNumber(cumulativeBasis + taxAmount, ROUNDING_MODE.HALF_UP, 4);
      }
    }
  }

  const taxes = Array.from(accumulator.values()).map((g) => ({
    ...g,
    saleTaxAmount: roundNumber(g.saleTaxAmount, g.roundCode, g.taxType === 0 ? taxDecimals() : totalsDecimals()),
  }));

  return { taxes, itemTaxes };
}

export function updateTaxes(taxes: SaleTaxGroup[], newTax: SaleTaxGroup): SaleTaxGroup[] {
  const existing = taxes.find((t) => t.taxGroup === newTax.taxGroup);
  if (existing) {
    existing.saleTaxBasis = roundNumber(existing.saleTaxBasis + newTax.saleTaxBasis, ROUNDING_MODE.HALF_UP, 4);
    existing.saleTaxAmount = roundNumber(existing.saleTaxAmount + newTax.saleTaxAmount, ROUNDING_MODE.HALF_UP, 4);
  } else {
    taxes.push(newTax);
  }
  return taxes;
}

export function applyInvoiceTaxing(taxes: SaleTaxGroup[]): SaleTaxGroup[] {
  return taxes.sort((a, b) => a.taxGroup.localeCompare(b.taxGroup));
}

export function roundTaxes(taxes: SaleTaxGroup[]): SaleTaxGroup[] {
  return taxes.map((t) => ({
    ...t,
    saleTaxAmount: roundNumber(t.saleTaxAmount, t.roundCode, t.taxType === 0 ? taxDecimals() : totalsDecimals()),
  }));
}

export function applyDestinationTax(item: CartLine, city: string | null, state: string | null, salesTaxCodeId: number | null, registerMode: string, saleId: number | null, taxes: SaleTaxGroup[], itemTaxes: ItemTax[], line: number): boolean {
  const db = getDbSync();
  const codeId = salesTaxCodeId ?? getConfigNumber("default_tax_code", 0);
  if (!codeId) return false;
  const codes = db.select().from(taxCodes).where(eq(taxCodes.taxCodeId, codeId)).get();
  if (!codes) return false;
  const links = db
    .select({
      taxRate: taxCodeLinks.taxRate,
      roundCode: taxCodeLinks.roundCode,
      cascadeSequence: taxCodeLinks.cascadeSequence,
      taxGroup: taxJurisdictions.taxGroup,
      jurisdictionName: taxJurisdictions.jurisdictionName,
      taxType: taxJurisdictions.taxType,
    })
    .from(taxCodeLinks)
    .innerJoin(taxJurisdictions, eq(taxJurisdictions.jurisdictionId, taxCodeLinks.jurisdictionId))
    .where(eq(taxCodeLinks.taxCodeId, codeId))
    .all();
  const basis = getItemTotal(item.quantity, item.price, item.discount, item.discountType, true);
  let cumulativeBasis = basis;
  for (const link of links) {
    const taxAmount = roundNumber(cumulativeBasis * (link.taxRate / 100), link.roundCode, taxDecimals());
    const groupKey = `X${link.taxRate}% ${link.jurisdictionName}`;
    updateTaxes(taxes, {
      taxType: link.taxType === "INCLUDED" ? 0 : 1,
      roundCode: link.roundCode,
      taxGroup: groupKey,
      saleTaxBasis: cumulativeBasis,
      saleTaxAmount: taxAmount,
    });
    itemTaxes.push({
      itemId: item.itemId,
      line,
      name: link.jurisdictionName,
      percent: link.taxRate,
      taxType: link.taxType === "INCLUDED" ? 0 : 1,
      roundCode: link.roundCode,
      cascadeSequence: link.cascadeSequence,
      itemTaxAmount: taxAmount,
    });
    if (link.cascadeSequence > 0) {
      cumulativeBasis = roundNumber(cumulativeBasis + taxAmount, ROUNDING_MODE.HALF_UP, 4);
    }
  }
  return true;
}

export function getApplicableTaxCode(registerMode: string, city: string | null, state: string | null, salesTaxCodeId: number | null): { taxCodeId: number; taxCode: string } | null {
  const db = getDbSync();
  const codeId = salesTaxCodeId ?? getConfigNumber("default_tax_code", 0);
  if (!codeId) return null;
  const row = db.select().from(taxCodes).where(eq(taxCodes.taxCodeId, codeId)).get();
  if (!row) return null;
  return { taxCodeId: row.taxCodeId, taxCode: row.taxCode };
}

export function clean(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[<>;"']/g, "").trim();
}

export function getTaxCodeOptions(): { taxCodeId: number; taxCode: string; taxCodeName: string }[] {
  return getDbSync().select().from(taxCodes).where(eq(taxCodes.deleted, false)).all();
}

export function getTaxJurisdictionOptions(): { jurisdictionId: number; jurisdictionName: string }[] {
  return getDbSync().select().from(taxJurisdictions).where(eq(taxJurisdictions.deleted, false)).all();
}

export function getTaxCategoryOptions(): { taxCategoryId: number; taxCategory: string }[] {
  return getDbSync().select().from(taxCategories).where(eq(taxCategories.deleted, false)).all();
}

export function getTaxCategoryUsage(taxCategoryId: number): number {
  return getDbSync().select({ c: items.itemId }).from(items).where(eq(items.taxCategoryId, taxCategoryId)).all().length;
}

export { ROUNDING_MODE };
void customers;
void sales;
void getConfig;
