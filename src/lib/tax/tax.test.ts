import { describe, it, expect, beforeAll } from "vitest";
import { getTaxes, roundNumber } from "./index";
import { ROUNDING_MODE } from "@/lib/constants";
import { setConfig } from "@/lib/config";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes } from "@/db/schema";
import { eq } from "drizzle-orm";

beforeAll(() => {
  setConfig("tax_included", "0");
  setConfig("use_destination_based_tax", "0");
});

function insertItem(db: ReturnType<typeof getDbSync>, itemId: number, unitPrice: number) {
  db.insert(items).values({
    itemId, name: `T${itemId}`, unitPrice, costPrice: 0,
    stockType: 0, itemType: 0, deleted: false,
  }).onConflictDoUpdate({ target: items.itemId, set: { unitPrice } }).run();
}

function setTaxes(db: ReturnType<typeof getDbSync>, itemId: number, taxes: { name: string; percent: number }[]) {
  db.delete(itemsTaxes).where(eq(itemsTaxes.itemId, itemId)).run();
  for (const t of taxes) {
    db.insert(itemsTaxes).values({ itemId, name: t.name, percent: t.percent }).run();
  }
}

describe("Tax_lib port", () => {
  it("roundNumber: HALF_UP default", () => {
    expect(roundNumber(2.5, ROUNDING_MODE.HALF_UP, 0)).toBe(3);
    expect(roundNumber(2.4, ROUNDING_MODE.HALF_UP, 0)).toBe(2);
  });

  it("roundNumber: HALF_EVEN banker's rounding", () => {
    expect(roundNumber(2.5, ROUNDING_MODE.HALF_EVEN, 0)).toBe(2);
    expect(roundNumber(3.5, ROUNDING_MODE.HALF_EVEN, 0)).toBe(4);
  });

  it("classic single tax excluded", () => {
    const db = getDbSync();
    insertItem(db, 9001, 100);
    setTaxes(db, 9001, [{ name: "VAT", percent: 10 }]);
    const { taxes, itemTaxes } = getTaxes([
      { itemId: 9001, quantity: 2, price: 100, discount: 0, discountType: 0, taxCategoryId: null, isSerialized: false },
    ]);
    expect(taxes).toHaveLength(1);
    expect(taxes[0].saleTaxAmount).toBeCloseTo(20, 2);
    expect(itemTaxes).toHaveLength(1);
    expect(itemTaxes[0].itemTaxAmount).toBeCloseTo(20, 2);
  });

  it("classic two taxes excluded — additive not compound (cascadeSequence 0)", () => {
    const db = getDbSync();
    insertItem(db, 9002, 50);
    setTaxes(db, 9002, [{ name: "State", percent: 5 }, { name: "Local", percent: 2 }]);
    const { taxes } = getTaxes([
      { itemId: 9002, quantity: 1, price: 50, discount: 0, discountType: 0, taxCategoryId: null, isSerialized: false },
    ]);
    const total = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
    expect(total).toBeCloseTo(3.5, 2);
  });

  it("tax-included backout", () => {
    setConfig("tax_included", "1");
    const db = getDbSync();
    insertItem(db, 9003, 110);
    setTaxes(db, 9003, [{ name: "VAT", percent: 10 }]);
    const { itemTaxes } = getTaxes([
      { itemId: 9003, quantity: 1, price: 110, discount: 0, discountType: 0, taxCategoryId: null, isSerialized: false },
    ]);
    expect(itemTaxes[0].itemTaxAmount).toBeCloseTo(10, 2);
    setConfig("tax_included", "0");
  });

  it("discount applies to tax basis", () => {
    const db = getDbSync();
    insertItem(db, 9004, 100);
    setTaxes(db, 9004, [{ name: "VAT", percent: 10 }]);
    const { itemTaxes } = getTaxes([
      { itemId: 9004, quantity: 1, price: 100, discount: 10, discountType: 0, taxCategoryId: null, isSerialized: false },
    ]);
    expect(itemTaxes[0].itemTaxAmount).toBeCloseTo(9, 2);
  });
});