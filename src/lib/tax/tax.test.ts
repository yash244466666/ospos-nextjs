import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  applyInvoiceTaxing,
  clean,
  getIncludedTax,
  getItemDiscount,
  getItemTotal,
  getTaxForAmount,
  getTaxes,
  roundTaxes,
  type TaxCartLine,
} from "./index";
import { ROUNDING_MODE } from "@/lib/constants";
import { getRawSqlite } from "@/lib/db/sqlite";
import { resetSqliteDbInstance } from "@/lib/db";
import { invalidateConfigCache, loadConfig } from "@/lib/config";
import { toDbDecimal } from "@/lib/money";

const MIGRATION_FILE = fs
  .readdirSync(path.resolve(process.cwd(), "drizzle/sqlite"))
  .filter((file) => file.endsWith(".sql"))
  .sort()[0];
const SCHEMA_SQL = fs
  .readFileSync(path.resolve(process.cwd(), "drizzle/sqlite", MIGRATION_FILE), "utf8")
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

function sqliteRun(sql: string): void {
  getRawSqlite().exec(sql);
}

async function resetDb(): Promise<void> {
  resetSqliteDbInstance();
  for (const statement of SCHEMA_SQL) sqliteRun(statement);
  invalidateConfigCache();
  await loadConfig(true);
}

async function setConfig(values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    sqliteRun(
      `INSERT INTO ospos_app_config (key, value) VALUES ('${key}', '${value}') ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  }
  invalidateConfigCache();
  await loadConfig(true);
}

async function insertItem(itemId: number, unitPrice: string): Promise<void> {
  sqliteRun(
    `INSERT INTO ospos_items (item_id, name, category, description, cost_price, unit_price, allow_alt_description, is_serialized)
     VALUES (${itemId}, 'Item ${itemId}', 'cat', 'desc', '0', '${unitPrice}', 0, 0)`,
  );
}

async function setItemTaxes(itemId: number, taxes: { name: string; percent: string }[]): Promise<void> {
  for (const tax of taxes) {
    sqliteRun(
      `INSERT INTO ospos_items_taxes (item_id, name, percent) VALUES (${itemId}, '${tax.name}', '${tax.percent}')`,
    );
  }
}

function line(itemId: number, overrides: Partial<TaxCartLine> = {}): TaxCartLine {
  return {
    itemId,
    line: 1,
    quantity: "1",
    price: "100",
    discount: "0",
    discountType: 0,
    taxCategoryId: null,
    ...overrides,
  };
}

const BASE_CONFIG = {
  currency_decimals: "2",
  tax_decimals: "2",
  tax_included: "0",
  use_destination_based_tax: "0",
  default_tax_code: "0",
  default_tax_category: "0",
};

beforeEach(async () => {
  await resetDb();
  await setConfig(BASE_CONFIG);
});

describe("classic tax engine", () => {
  it("F2: single excluded tax", async () => {
    await insertItem(9001, "100");
    await setItemTaxes(9001, [{ name: "VAT", percent: "8" }]);
    const result = await getTaxes([line(9001, { quantity: "1", price: "100" })], { registerMode: "sale", customerId: -1 });
    expect(result.taxes).toHaveLength(1);
    expect(result.taxes[0]).toMatchObject({
      taxType: 1,
      taxGroup: "VAT",
      saleTaxBasis: "100.0000",
      saleTaxAmount: "8.00",
      printSequence: 1,
      name: "VAT",
      taxRate: "8.0000",
    });
    expect(result.itemTaxes[0].itemTaxAmount).toBe("8.00");
  });

  it("F3: two additive taxes never compound", async () => {
    await insertItem(9002, "100");
    await setItemTaxes(9002, [
      { name: "State", percent: "5" },
      { name: "Local", percent: "7.5" },
    ]);
    const result = await getTaxes([line(9002, { quantity: "2", price: "100" })], { registerMode: "sale", customerId: -1 });
    expect(result.taxes.map((t) => [t.taxGroup, t.saleTaxBasis, t.saleTaxAmount, t.printSequence]))
      .toEqual([
        // Upstream has no ORDER BY; InnoDB/SQLite return PK order
        // (item_id, name, percent), so "Local" is read first.
        ["Local", "200.0000", "15.00", 1],
        ["State", "200.0000", "10.00", 3],
      ]);
  });

  it("F12: a line without taxes produces no group", async () => {
    await insertItem(9003, "50");
    await insertItem(9004, "50");
    await setItemTaxes(9003, [{ name: "A", percent: "10" }]);
    const result = await getTaxes(
      [
        line(9003, { line: 1, quantity: "2", price: "50" }),
        line(9004, { line: 2, quantity: "1", price: "50" }),
      ],
      { registerMode: "sale", customerId: -1 },
    );
    expect(result.taxes).toHaveLength(1);
    expect(result.taxes[0].saleTaxAmount).toBe("10.00");
    expect(result.itemTaxes).toHaveLength(1);
    expect(result.taxedFlags[2]).toBe(" ");
  });

  it("F13: multi-line aggregation into one group", async () => {
    await insertItem(9005, "50");
    await insertItem(9006, "30");
    await setItemTaxes(9005, [{ name: "A", percent: "10" }]);
    await setItemTaxes(9006, [{ name: "A", percent: "10" }]);
    const result = await getTaxes(
      [
        line(9005, { line: 1, quantity: "2", price: "50" }),
        line(9006, { line: 2, quantity: "1", price: "30" }),
      ],
      { registerMode: "sale", customerId: -1 },
    );
    expect(result.taxes).toHaveLength(1);
    expect(result.taxes[0]).toMatchObject({
      saleTaxBasis: "130.0000",
      saleTaxAmount: "13.00",
      printSequence: 1,
    });
    expect(result.itemTaxes.map((t) => t.itemTaxAmount)).toEqual(["10.00", "3.00"]);
  });

  it("F14: percent discount before tax", async () => {
    expect(getItemDiscount("2", "100", "10", 0)).toBe("20.00");
    expect(getItemTotal("2", "100", "10", 0, true)).toBe("180.0000");
    await insertItem(9007, "100");
    await setItemTaxes(9007, [{ name: "VAT", percent: "8" }]);
    const result = await getTaxes(
      [line(9007, { quantity: "2", price: "100", discount: "10", discountType: 0 })],
      { registerMode: "sale", customerId: -1 },
    );
    expect(result.taxes[0].saleTaxAmount).toBe("14.40");
  });

  it("F15: fixed discount is per unit", async () => {
    expect(getItemDiscount("3", "100", "10", 1)).toBe("30.00");
    await insertItem(9008, "100");
    await setItemTaxes(9008, [{ name: "VAT", percent: "8" }]);
    const result = await getTaxes(
      [line(9008, { quantity: "3", price: "100", discount: "10", discountType: 1 })],
      { registerMode: "sale", customerId: -1 },
    );
    expect(result.taxes[0].saleTaxBasis).toBe("270.0000");
    expect(result.taxes[0].saleTaxAmount).toBe("21.60");
  });

  it("F19: bcmath truncation of a 3-decimal rate", () => {
    expect(getTaxForAmount("100", "6.875", ROUNDING_MODE.HALF_UP, 2)).toBe("6.87");
  });

  it("F25: group identity strips punctuation via clean()", () => {
    expect(clean("X13% GST/HST (Ontario)")).toBe("X13-GSTHST-Ontario");
  });

  it("F8: non-taxable customer is skipped entirely", async () => {
    await insertItem(9009, "100");
    await setItemTaxes(9009, [{ name: "VAT", percent: "10" }]);
    sqliteRun(
      `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
         VALUES (5, 'A', 'B', '', '', '', '', '', '', '', '', '')`,
    );
    sqliteRun(
      `INSERT INTO ospos_customers (person_id, taxable, discount, employee_id) VALUES (5, 0, '0', 1)`,
    );
    const result = await getTaxes([line(9009)], { customerId: 5, registerMode: "sale" });
    expect(result.taxes).toEqual([]);
    expect(result.itemTaxes).toEqual([]);
    expect(result.taxedFlags).toEqual({});
  });
});

describe("tax included", () => {
  it("F6: exact divisor", async () => {
    await setConfig({ tax_included: "1" });
    expect(getIncludedTax("1", "110", "0", 0, "10")).toBe("10.0000");
    await insertItem(9010, "110");
    await setItemTaxes(9010, [{ name: "VAT", percent: "10" }]);
    const result = await getTaxes([line(9010, { price: "110" })], { registerMode: "sale", customerId: -1 });
    expect(result.taxes[0]).toMatchObject({ taxType: 0, saleTaxAmount: "10.00" });
  });

  it("F7: repeating decimal truncated at bcscale", async () => {
    await setConfig({ tax_included: "1" });
    expect(getIncludedTax("1", "100", "0", 0, "8.25")).toBe("7.6213");
    await insertItem(9011, "100");
    await setItemTaxes(9011, [{ name: "VAT", percent: "8.25" }]);
    const result = await getTaxes([line(9011)], { registerMode: "sale", customerId: -1 });
    expect(result.taxes[0].saleTaxAmount).toBe("7.62");
  });
});

describe("roundTaxes", () => {
  const group = (amount: string, code: number = ROUNDING_MODE.HALF_UP): Parameters<typeof roundTaxes>[0][number] => ({
    saleId: -1,
    taxType: 1,
    taxGroup: "A",
    saleTaxBasis: "46.9000",
    saleTaxAmount: amount,
    printSequence: 1,
    name: "A",
    taxRate: "5.0000",
    salesTaxCodeId: null,
    jurisdictionId: null,
    taxCategoryId: null,
    roundingCode: code,
  });

  it("F16/F17: all seven modes", () => {
    // Tax_lib's inline branch differs from round_number for 5/6 and 7.
    const modes: Array<[number, string, string]> = [
      [ROUNDING_MODE.HALF_UP, "2.35", "-2.35"],
      [ROUNDING_MODE.HALF_DOWN, "2.34", "-2.34"],
      [ROUNDING_MODE.HALF_EVEN, "2.34", "-2.34"],
      [ROUNDING_MODE.HALF_ODD, "2.35", "-2.35"],
      [ROUNDING_MODE.ROUND_UP, "2.40", "-2.30"],
      [ROUNDING_MODE.ROUND_DOWN, "2.30", "-2.40"],
      [ROUNDING_MODE.HALF_FIVE, "0.00", "0.00"],
    ];
    for (const [code, positive, negative] of modes) {
      expect(toDbDecimal(roundTaxes([group("2.3450", code)])[0].saleTaxAmount, 2)).toBe(positive);
      expect(toDbDecimal(roundTaxes([group("-2.3450", code)])[0].saleTaxAmount, 2)).toBe(negative);
    }
  });

  it("UD-01: taxRound HALF_ODD acts as HALF_UP and HALF_FIVE loses decimals", () => {
    expect(toDbDecimal(roundTaxes([group("2.3550", ROUNDING_MODE.HALF_ODD)])[0].saleTaxAmount, 2)).toBe("2.36");
    expect(toDbDecimal(roundTaxes([group("2.3450", ROUNDING_MODE.HALF_FIVE)])[0].saleTaxAmount, 2)).toBe("0.00");
  });

  it("sorts by print_sequence", () => {
    const a = { ...group("1.0000"), printSequence: 3 };
    const b = { ...group("2.0000"), printSequence: 1 };
    expect(roundTaxes([a, b]).map((t) => t.printSequence)).toEqual([1, 3]);
  });

  it("applyInvoiceTaxing recomputes from basis", () => {
    const taxed = applyInvoiceTaxing([{ ...group("0.0000"), saleTaxBasis: "46.9100", taxRate: "10.0000" }]);
    expect(toDbDecimal(taxed[0].saleTaxAmount, 2)).toBe("4.69");
  });
});

describe("destination-based tax", () => {
  async function seedDestination(): Promise<void> {
    await setConfig({
      use_destination_based_tax: "1",
      default_tax_code: "2",
      default_tax_category: "1",
    });
    sqliteRun(
      `INSERT INTO ospos_tax_categories (tax_category_id, tax_category, tax_group_sequence, deleted) VALUES (1, 'Standard', 0, 0)`,
    );
    sqliteRun(
      `INSERT INTO ospos_tax_codes (tax_code_id, tax_code, tax_code_name, city, state, deleted) VALUES
        (2, 'DEFAULT', 'Default', '', '', 0),
        (5, 'AUSTIN', 'Austin', 'Austin', 'TX', 0),
        (6, 'TEXAS', 'Texas', '', 'TX', 0)`,
    );
    sqliteRun(
      `INSERT INTO ospos_tax_jurisdictions
        (jurisdiction_id, jurisdiction_name, tax_group, tax_type, tax_group_sequence, cascade_sequence, deleted)
       VALUES (1, 'TX', 'TX', 1, 0, 0, 0)`,
    );
    sqliteRun(
      `INSERT INTO ospos_tax_rates (rate_tax_code_id, rate_tax_category_id, rate_jurisdiction_id, tax_rate, tax_rounding_code)
       VALUES (2, 1, 1, '10.0000', 1), (5, 1, 1, '8.0000', 1), (6, 1, 1, '8.0000', 1)`,
    );
  }

  it("F11: sale mode always uses the default code", async () => {
    await seedDestination();
    await insertItem(9101, "100");
    const result = await getTaxes([line(9101, { taxCategoryId: 1 })], { registerMode: "sale", customerId: -1 });
    expect(result.taxes[0].saleTaxAmount).toBe("10.00");
    expect(result.taxes[0].salesTaxCodeId).toBe(2);
  });

  it("F9: exact city/state lookup", async () => {
    await seedDestination();
    await insertItem(9102, "100");
    sqliteRun(
      `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
         VALUES (6, 'C', 'D', '', '', '', '', 'Austin', 'TX', '', '', '')`,
    );
    sqliteRun(
      `INSERT INTO ospos_customers (person_id, taxable, discount, employee_id) VALUES (6, 1, '0', 1)`,
    );
    const result = await getTaxes([line(9102, { taxCategoryId: 1 })], {
      registerMode: "return",
      customerId: 6,
    });
    expect(result.taxes[0].saleTaxAmount).toBe("8.00");
    expect(result.taxes[0].salesTaxCodeId).toBe(5);
  });

  it("F23: zero-priced line is not taxed", async () => {
    await seedDestination();
    await insertItem(9103, "0");
    const result = await getTaxes([line(9103, { price: "0", taxCategoryId: 1 })], {
      registerMode: "sale",
      customerId: -1,
    });
    expect(result.taxes).toEqual([]);
    expect(result.itemTaxes).toEqual([]);
    expect(result.taxedFlags[1]).toBe(" ");
  });
});
