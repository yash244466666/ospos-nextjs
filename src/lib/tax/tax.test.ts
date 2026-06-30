import { describe, it, expect, beforeAll } from "vitest";
import { getTaxes, roundNumber } from "./index";
import { ROUNDING_MODE } from "@/lib/constants";
import { setConfig } from "@/lib/config";
import { getDbSync } from "@/lib/db";
import {
  items, itemsTaxes, people, customers, taxCategories, taxJurisdictions, taxCodes, taxCodeLinks,
} from "@/db/schema";
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

  it("falls back to default taxes when item has none", () => {
    setConfig("use_destination_based_tax", "0");
    setConfig("default_tax_1_name", "Sales Tax");
    setConfig("default_tax_1_rate", "10");
    setConfig("default_tax_2_name", "");
    setConfig("default_tax_2_rate", "0");
    const db = getDbSync();
    insertItem(db, 9005, 100);
    setTaxes(db, 9005, []);
    const { taxes, itemTaxes } = getTaxes([
      { itemId: 9005, quantity: 1, price: 100, discount: 0, discountType: 0, taxCategoryId: null, isSerialized: false },
    ]);
    expect(itemTaxes).toHaveLength(1);
    expect(itemTaxes[0].itemTaxAmount).toBeCloseTo(10, 2);
    expect(taxes[0].saleTaxAmount).toBeCloseTo(10, 2);
  });

  it("returns empty taxes for non-taxable customers", () => {
    const db = getDbSync();
    const person = db.insert(people).values({ firstName: "TaxExempt" }).returning().get();
    db.insert(customers).values({ personId: person.personId, taxable: false }).run();
    insertItem(db, 9006, 100);
    setTaxes(db, 9006, [{ name: "VAT", percent: 10 }]);
    const { taxes, itemTaxes } = getTaxes(
      [{ itemId: 9006, quantity: 1, price: 100, discount: 0, discountType: 0, taxCategoryId: null, isSerialized: false }],
      person.personId
    );
    expect(taxes).toHaveLength(0);
    expect(itemTaxes).toHaveLength(0);
  });

  it("destination-based tax matches by customer city/state", () => {
    setConfig("use_destination_based_tax", "1");
    setConfig("default_tax_code", "0");
    const db = getDbSync();

    const category = db.insert(taxCategories).values({ taxCategory: "Standard", deleted: false }).returning().get();
    const jurisdiction = db.insert(taxJurisdictions).values({
      jurisdictionName: "NY State",
      taxType: "EXCLUDED",
      taxGroup: "NY",
      taxRate: 8,
      roundCode: 1,
      cascadeSequence: 0,
      deleted: false,
    }).returning().get();
    const code = db.insert(taxCodes).values({ taxCode: "NY", taxCodeName: "New York", city: "", state: "NY", deleted: false }).returning().get();
    db.insert(taxCodeLinks).values({
      taxCodeId: code.taxCodeId,
      taxCategoryId: category.taxCategoryId,
      jurisdictionId: jurisdiction.jurisdictionId,
      taxRate: 8,
      roundCode: 1,
      cascadeSequence: 0,
    }).run();

    const person = db.insert(people).values({ firstName: "NY", city: "", state: "NY" }).returning().get();
    db.insert(customers).values({ personId: person.personId, taxable: true, salesTaxCodeId: null }).run();
    insertItem(db, 9007, 100);
    db.update(items).set({ taxCategoryId: category.taxCategoryId }).where(eq(items.itemId, 9007)).run();
    setTaxes(db, 9007, []);

    const { taxes, itemTaxes } = getTaxes(
      [{ itemId: 9007, quantity: 1, price: 100, discount: 0, discountType: 0, taxCategoryId: category.taxCategoryId, isSerialized: false }],
      person.personId,
      "return"
    );
    expect(itemTaxes).toHaveLength(1);
    expect(itemTaxes[0].itemTaxAmount).toBeCloseTo(8, 2);
    expect(taxes[0].saleTaxAmount).toBeCloseTo(8, 2);
  });

  it("destination-based tax compounds when cascade sequence changes", () => {
    setConfig("use_destination_based_tax", "1");
    setConfig("default_tax_code", "0");
    const db = getDbSync();

    const category = db.insert(taxCategories).values({ taxCategory: "Compound", deleted: false }).returning().get();
    const j1 = db.insert(taxJurisdictions).values({
      jurisdictionName: "State",
      taxType: "EXCLUDED",
      taxGroup: "State",
      taxRate: 10,
      roundCode: 1,
      cascadeSequence: 0,
      deleted: false,
    }).returning().get();
    const j2 = db.insert(taxJurisdictions).values({
      jurisdictionName: "Local",
      taxType: "EXCLUDED",
      taxGroup: "Local",
      taxRate: 5,
      roundCode: 1,
      cascadeSequence: 1,
      deleted: false,
    }).returning().get();
    const code = db.insert(taxCodes).values({ taxCode: "C", taxCodeName: "Compound", city: "", state: "", deleted: false }).returning().get();
    db.insert(taxCodeLinks).values({ taxCodeId: code.taxCodeId, taxCategoryId: category.taxCategoryId, jurisdictionId: j1.jurisdictionId, taxRate: 10, roundCode: 1, cascadeSequence: 0 }).run();
    db.insert(taxCodeLinks).values({ taxCodeId: code.taxCodeId, taxCategoryId: category.taxCategoryId, jurisdictionId: j2.jurisdictionId, taxRate: 5, roundCode: 1, cascadeSequence: 1 }).run();

    const person = db.insert(people).values({ firstName: "C" }).returning().get();
    db.insert(customers).values({ personId: person.personId, taxable: true, salesTaxCodeId: code.taxCodeId }).run();
    insertItem(db, 9008, 100);
    db.update(items).set({ taxCategoryId: category.taxCategoryId }).where(eq(items.itemId, 9008)).run();
    setTaxes(db, 9008, []);

    const { itemTaxes } = getTaxes(
      [{ itemId: 9008, quantity: 1, price: 100, discount: 0, discountType: 0, taxCategoryId: category.taxCategoryId, isSerialized: false }],
      person.personId,
      "return"
    );
    expect(itemTaxes).toHaveLength(2);
    const stateTax = itemTaxes.find((t) => t.name === "State");
    const localTax = itemTaxes.find((t) => t.name === "Local");
    expect(stateTax?.itemTaxAmount).toBeCloseTo(10, 2);
    expect(localTax?.itemTaxAmount).toBeCloseTo(5.5, 2);
  });
});