import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes, taxCodeLinks, taxJurisdictions } from "@/db/schema";
import { getConfigBool, getConfigNumber, taxDecimals, totalsDecimals } from "@/lib/config";
import { ROUNDING_MODE } from "@/lib/constants";

export interface CartLine {
  itemId: number;
  quantity: number;
  price: number;
  discount: number;
  discountType: number;
  taxCategoryId: number | null;
  isSerialized: boolean;
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

export { ROUNDING_MODE };
void getConfigNumber;