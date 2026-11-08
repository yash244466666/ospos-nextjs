import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  customers,
  itemsTaxes,
  people,
  salesItemsTaxes,
  taxCategories,
  taxCodes,
  taxJurisdictions,
  taxRates,
} from "@/db/schema";
import {
  bcAdd,
  bcDiv,
  bcMul,
  bcSub,
  dec,
  phpRound,
  taxRound,
  toDbDecimal,
  type DecimalInput,
  type RoundingMode,
} from "@/lib/money";
import { getConfig, getConfigBool, getConfigNumber, loadConfig, taxDecimals, totalsDecimals } from "@/lib/config";
import { ROUNDING_MODE, DISCOUNT_TYPE } from "@/lib/constants";
import { lang } from "@/lib/i18n/lang";

export const TAX_TYPE_EXCLUDED = 1;
export const TAX_TYPE_INCLUDED = 0;

export interface TaxCartLine {
  itemId: number;
  line: number;
  quantity: DecimalInput;
  price: DecimalInput;
  discount: DecimalInput;
  discountType: number;
  taxCategoryId: number | null;
}

export interface SaleTaxGroup {
  saleId: number;
  taxType: number;
  taxGroup: string;
  saleTaxBasis: string;
  saleTaxAmount: string;
  printSequence: number;
  name: string;
  taxRate: string;
  salesTaxCodeId: number | null;
  jurisdictionId: number | null;
  taxCategoryId: number | null;
  roundingCode: number;
}

export interface ItemTaxDetail {
  itemId: number;
  line: number;
  name: string;
  percent: string;
  taxType: number;
  roundingCode: number;
  cascadeSequence: number;
  itemTaxAmount: string;
  salesTaxCodeId: number | null;
  jurisdictionId: number | null;
  taxCategoryId: number | null;
  taxGroupSequence?: number;
}

export interface TaxResult {
  taxes: SaleTaxGroup[];
  itemTaxes: ItemTaxDetail[];
  taxedFlags: Record<number, string>;
}

export interface TaxOptions {
  saleId?: number;
  registerMode?: string;
  customerId?: number;
}

/** `Tax_lib::clean` — spaces to hyphens, strip everything outside [A-Za-z0-9-]. */
export function clean(value: string): string {
  return value.replace(/ /g, "-").replace(/[^A-Za-z0-9-]/g, "");
}

/** `Sale_lib::get_item_discount`: round at totals decimals with HALF_UP. */
export function getItemDiscount(
  quantity: DecimalInput,
  price: DecimalInput,
  discount: DecimalInput,
  discountType: number,
): string {
  const total = bcMul(quantity, price);
  const amount =
    discountType === DISCOUNT_TYPE.PERCENT
      ? bcMul(total, bcDiv(discount, "100"))
      : bcMul(quantity, discount);
  return toDbDecimal(phpRound(amount, totalsDecimals(), ROUNDING_MODE.HALF_UP), totalsDecimals());
}

/** `Sale_lib::get_item_total`: bcmath scale, discount already rounded. */
export function getItemTotal(
  quantity: DecimalInput,
  price: DecimalInput,
  discount: DecimalInput,
  discountType: number,
  includeDiscount = false,
): string {
  const total = bcMul(quantity, price);
  if (!includeDiscount) return toDbDecimal(total, 4);
  return toDbDecimal(bcSub(total, getItemDiscount(quantity, price, discount, discountType)), 4);
}

/** `Tax_lib::get_tax_for_amount`: truncating bcmath then PHP rounding. */
export function getTaxForAmount(
  taxBasis: DecimalInput,
  taxPercentage: DecimalInput,
  roundingMode: RoundingMode,
  decimals: number,
): string {
  const fraction = bcDiv(taxPercentage, "100");
  const amount = bcMul(taxBasis, fraction);
  return toDbDecimal(phpRound(amount, decimals, roundingMode), decimals);
}

/** `Tax_lib::get_included_tax`: unrounded, bcmath scale. */
export function getIncludedTax(
  quantity: DecimalInput,
  price: DecimalInput,
  discount: DecimalInput,
  discountType: number,
  taxPercentage: DecimalInput,
): string {
  const total = getItemTotal(quantity, price, discount, discountType, true);
  const fraction = bcDiv(bcAdd("100", taxPercentage), "100");
  const exclusive = bcDiv(total, fraction);
  return toDbDecimal(bcSub(total, exclusive), 4);
}

export function getItemSalesTax(
  quantity: DecimalInput,
  price: DecimalInput,
  discount: DecimalInput,
  discountType: number,
  taxPercentage: DecimalInput,
  roundingCode: RoundingMode,
): string {
  const basis = getItemTotal(quantity, price, discount, discountType, true);
  return getTaxForAmount(basis, taxPercentage, roundingCode, taxDecimals());
}

function updateTaxes(
  taxes: Map<string, SaleTaxGroup>,
  values: {
    saleId: number;
    taxType: number;
    taxGroup: string;
    taxRate: DecimalInput;
    taxBasis: DecimalInput;
    itemTaxAmount: DecimalInput;
    printSequence: number;
    roundingCode: number;
    name: string;
    salesTaxCodeId?: number | null;
    jurisdictionId?: number | null;
    taxCategoryId?: number | null;
  },
): void {
  const key = clean(`X${Number(dec(values.taxRate).toString())}% ${values.taxGroup}`);
  const existing = taxes.get(key);
  if (!existing) {
    taxes.set(key, {
      saleId: values.saleId,
      taxType: values.taxType,
      taxGroup: values.taxGroup,
      saleTaxBasis: toDbDecimal(values.taxBasis, 4),
      saleTaxAmount: toDbDecimal(values.itemTaxAmount, 4),
      printSequence: values.printSequence,
      name: values.name,
      taxRate: toDbDecimal(values.taxRate, 4),
      salesTaxCodeId: values.salesTaxCodeId ?? null,
      jurisdictionId: values.jurisdictionId ?? null,
      taxCategoryId: values.taxCategoryId ?? null,
      roundingCode: values.roundingCode,
    });
    return;
  }
  existing.saleTaxBasis = toDbDecimal(bcAdd(existing.saleTaxBasis, values.taxBasis, 4), 4);
  existing.saleTaxAmount = toDbDecimal(
    bcAdd(existing.saleTaxAmount, values.itemTaxAmount, 4),
    4,
  );
}

/**
 * `Tax_lib::round_taxes`: sort by print_sequence, then round with the inline
 * branch (UD-01). The decimal scale depends on the global `tax_included` flag,
 * not on each row's `tax_type`.
 */
export function roundTaxes(taxes: SaleTaxGroup[]): SaleTaxGroup[] {
  const sorted = [...taxes].sort((a, b) => a.printSequence - b.printSequence);
  const included = getConfigBool("tax_included", false);
  const decimals = included ? taxDecimals() : totalsDecimals();
  return sorted.map((tax) => ({
    ...tax,
    saleTaxAmount: toDbDecimal(
      taxRound(tax.saleTaxAmount, decimals, tax.roundingCode as RoundingMode),
      decimals,
    ),
  }));
}

/** `Tax_lib::apply_invoice_taxing`: recompute group amounts from basis/rate. */
export function applyInvoiceTaxing(taxes: SaleTaxGroup[]): SaleTaxGroup[] {
  const sorted = [...taxes].sort((a, b) => a.printSequence - b.printSequence);
  const decimals = totalsDecimals();
  return sorted.map((tax) => ({
    ...tax,
    saleTaxAmount: toDbDecimal(
      phpRound(
        bcMul(tax.saleTaxBasis, bcDiv(tax.taxRate, "100")),
        decimals,
        tax.roundingCode as RoundingMode,
      ),
      decimals,
    ),
  }));
}

async function getCustomerInfo(customerId: number) {
  const db = await getDb();
  const rows = await db
    .select({
      taxable: customers.taxable,
      city: people.city,
      state: people.state,
      salesTaxCodeId: customers.salesTaxCodeId,
    })
    .from(customers)
    .innerJoin(people, eq(people.personId, customers.personId))
    .where(eq(customers.personId, customerId))
    .limit(1);
  return rows[0] ?? null;
}

interface DestinationRate {
  taxRateId: number;
  taxRate: string;
  taxRoundingCode: number;
  cascadeSequence: number;
  taxType: number;
  taxGroup: string;
  jurisdictionName: string | null;
  jurisdictionId: number;
  taxCategoryId: number;
  taxGroupSequence: number;
}

async function getTaxDefinition(
  taxCodeId: number,
  taxCategoryId: number,
): Promise<DestinationRate[]> {
  const db = await getDb();
  const rows = await db
    .select({
      taxRateId: taxRates.taxRateId,
      taxRate: taxRates.taxRate,
      taxRoundingCode: taxRates.taxRoundingCode,
      cascadeSequence: taxJurisdictions.cascadeSequence,
      taxType: taxJurisdictions.taxType,
      taxGroup: taxJurisdictions.taxGroup,
      jurisdictionName: taxJurisdictions.jurisdictionName,
      jurisdictionId: taxJurisdictions.jurisdictionId,
      taxCategoryId: taxRates.rateTaxCategoryId,
      taxGroupSequence: taxCategories.taxGroupSequence,
      jurisdictionGroupSequence: taxJurisdictions.taxGroupSequence,
    })
    .from(taxRates)
    .leftJoin(taxCodes, eq(taxCodes.taxCodeId, taxRates.rateTaxCodeId))
    .leftJoin(taxCategories, eq(taxCategories.taxCategoryId, taxRates.rateTaxCategoryId))
    .leftJoin(
      taxJurisdictions,
      eq(taxJurisdictions.jurisdictionId, taxRates.rateJurisdictionId),
    )
    .where(and(eq(taxRates.rateTaxCodeId, taxCodeId), eq(taxRates.rateTaxCategoryId, taxCategoryId)))
    .orderBy(
      asc(taxJurisdictions.cascadeSequence),
      asc(taxJurisdictions.taxGroup),
      asc(taxJurisdictions.jurisdictionName),
      asc(taxCategories.taxGroupSequence),
      asc(taxJurisdictions.taxGroupSequence),
    );
  return rows.map((row) => ({
    taxRateId: row.taxRateId,
    taxRate: row.taxRate,
    taxRoundingCode: row.taxRoundingCode,
    cascadeSequence: row.cascadeSequence ?? 0,
    taxType: row.taxType ?? TAX_TYPE_EXCLUDED,
    taxGroup: row.taxGroup ?? "",
    jurisdictionName: row.jurisdictionName,
    jurisdictionId: row.jurisdictionId ?? 0,
    taxCategoryId: row.taxCategoryId,
    taxGroupSequence: Number(row.taxGroupSequence) + Number(row.jurisdictionGroupSequence),
  }));
}

/** `Tax_code::get_sales_tax_code` — exact city+state, then empty city + state, then default. */
export async function getSalesTaxCode(city: string, state: string): Promise<number> {
  const db = await getDb();
  const exact = await db
    .select({ taxCodeId: taxCodes.taxCodeId })
    .from(taxCodes)
    .where(and(eq(taxCodes.city, city), eq(taxCodes.state, state), eq(taxCodes.deleted, false)));
  if (exact.length === 1) return exact[0].taxCodeId;
  const stateOnly = await db
    .select({ taxCodeId: taxCodes.taxCodeId })
    .from(taxCodes)
    .where(and(eq(taxCodes.city, ""), eq(taxCodes.state, state), eq(taxCodes.deleted, false)));
  if (stateOnly.length === 1) return stateOnly[0].taxCodeId;
  return getConfigNumber("default_tax_code", 0);
}

/** `Tax_lib::get_applicable_tax_code`. */
export async function getApplicableTaxCode(
  registerMode: string,
  city: string,
  state: string,
  salesTaxCodeId: number | null,
): Promise<number> {
  if (registerMode === "sale") {
    return getConfigNumber("default_tax_code", 0);
  }
  if (salesTaxCodeId === null || salesTaxCodeId === 0) {
    return getSalesTaxCode(city, state);
  }
  return salesTaxCodeId;
}

async function applyDestinationTax(
  item: TaxCartLine,
  city: string,
  state: string,
  salesTaxCodeId: number | null,
  registerMode: string,
  saleId: number,
  taxes: Map<string, SaleTaxGroup>,
  itemTaxes: ItemTaxDetail[],
  taxedFlag: string,
  untaxedFlag: string,
): Promise<boolean> {
  const taxCodeId = await getApplicableTaxCode(registerMode, city, state, salesTaxCodeId);
  if (taxCodeId === -1 || Number(dec(item.price).toString()) === 0) return false;

  const categoryId = item.taxCategoryId ?? Number(getConfig("default_tax_category", "0"));
  const definition = await getTaxDefinition(taxCodeId, categoryId);
  const taxDec = taxDecimals();
  let basis = getItemTotal(item.quantity, item.price, item.discount, item.discountType, true);
  let lastCascadeSequence = 0;
  let cascadeTaxAmount = "0.0";
  let taxed = false;

  for (const tax of definition) {
    if (tax.cascadeSequence !== lastCascadeSequence) {
      lastCascadeSequence = tax.cascadeSequence;
      basis = toDbDecimal(bcAdd(basis, cascadeTaxAmount), 4);
    }
    const taxType = tax.taxType;
    let amount: string;
    if (taxType === TAX_TYPE_INCLUDED) {
      amount = getIncludedTax(
        item.quantity,
        item.price,
        item.discount,
        item.discountType,
        tax.taxRate,
      );
    } else {
      amount = getTaxForAmount(basis, tax.taxRate, tax.taxRoundingCode as RoundingMode, taxDec);
      cascadeTaxAmount = toDbDecimal(bcAdd(cascadeTaxAmount, amount), 4);
    }

    if (Number(amount) !== 0) {
      taxed = true;
      updateTaxes(taxes, {
        saleId,
        taxType,
        taxGroup: tax.taxGroup,
        taxRate: tax.taxRate,
        taxBasis: basis,
        itemTaxAmount: amount,
        printSequence: tax.taxGroupSequence,
        roundingCode: tax.taxRoundingCode,
        name: tax.taxGroup,
        salesTaxCodeId: taxCodeId,
        jurisdictionId: tax.jurisdictionId,
        taxCategoryId: tax.taxCategoryId,
      });
    }

    itemTaxes.push({
      itemId: item.itemId,
      line: item.line,
      name: tax.taxGroup,
      percent: tax.taxRate,
      taxType,
      roundingCode: tax.taxRoundingCode,
      cascadeSequence: tax.cascadeSequence,
      itemTaxAmount: amount,
      salesTaxCodeId: taxCodeId,
      jurisdictionId: tax.jurisdictionId,
      taxCategoryId: tax.taxCategoryId,
      taxGroupSequence: tax.taxGroupSequence,
    });
  }

  void taxedFlag;
  void untaxedFlag;
  return taxed;
}

/**
 * `Tax_lib::get_taxes`. The sale engine never falls back to `default_tax_1/2`
 * for classic taxes; those keys only prefill the Items form.
 */
export async function getTaxes(
  cart: TaxCartLine[],
  options: TaxOptions = {},
): Promise<TaxResult> {
  await loadConfig();
  const needsSession =
    options.registerMode === undefined || options.customerId === undefined;
  let session: Record<string, unknown> = {};
  if (needsSession) {
    const { getSessionData } = await import("@/lib/session");
    session = await getSessionData().catch(() => ({}));
  }
  const registerMode =
    options.registerMode ??
    (typeof session.sales_mode === "string" ? session.sales_mode : "sale");
  const customerId =
    options.customerId ??
    (typeof session.sales_customer === "number" ? session.sales_customer : -1);
  const saleId = options.saleId ?? -1;

  const taxes = new Map<string, SaleTaxGroup>();
  const itemTaxes: ItemTaxDetail[] = [];
  const taxedFlags: Record<number, string> = {};

  const customerInfo = customerId === -1 ? null : await getCustomerInfo(customerId);
  const taxable = customerId === -1 || !!customerInfo?.taxable;
  if (!taxable) {
    return { taxes: [], itemTaxes, taxedFlags };
  }

  const db = await getDb();
  const taxIncluded = getConfigBool("tax_included", false);
  const destination = getConfigBool("use_destination_based_tax", false);
    const taxDec = taxDecimals();
  const taxedFlag = lang("Sales.taxed_ind");
  const untaxedFlag = lang("Sales.nontaxed_ind");

  for (const item of cart) {
    let taxed = false;

    if (!destination) {
      const taxInfo =
        saleId === -1
          ? await db
              .select({ name: itemsTaxes.name, percent: itemsTaxes.percent })
              .from(itemsTaxes)
              .where(eq(itemsTaxes.itemId, item.itemId))
          : await db
              .select({ name: salesItemsTaxes.name, percent: salesItemsTaxes.percent })
              .from(salesItemsTaxes)
              .where(
                and(
                  eq(salesItemsTaxes.saleId, saleId),
                  eq(salesItemsTaxes.itemId, item.itemId),
                ),
              );

      let taxGroupSequence = 0;
      for (const tax of taxInfo) {
        const basis = getItemTotal(
          item.quantity,
          item.price,
          item.discount,
          item.discountType,
          true,
        );
        const taxType = taxIncluded ? TAX_TYPE_INCLUDED : TAX_TYPE_EXCLUDED;
        const amount = taxIncluded
          ? getIncludedTax(
              item.quantity,
              item.price,
              item.discount,
              item.discountType,
              tax.percent,
            )
          : getTaxForAmount(basis, tax.percent, ROUNDING_MODE.HALF_UP, taxDec);

        if (Number(amount) !== 0) {
          taxGroupSequence += 1;
          updateTaxes(taxes, {
            saleId: saleId === -1 ? -1 : saleId,
            taxType,
            taxGroup: tax.name,
            taxRate: tax.percent,
            taxBasis: basis,
            itemTaxAmount: amount,
            printSequence: taxGroupSequence,
            roundingCode: ROUNDING_MODE.HALF_UP,
            name: tax.name,
          });
          taxGroupSequence += 1;
          taxed = true;
        }

        itemTaxes.push({
          itemId: item.itemId,
          line: item.line,
          name: tax.name,
          percent: toDbDecimal(tax.percent, 4),
          taxType,
          roundingCode: ROUNDING_MODE.HALF_UP,
          cascadeSequence: 0,
          itemTaxAmount: amount,
          salesTaxCodeId: null,
          jurisdictionId: null,
          taxCategoryId: null,
        });
      }
    } else {
      taxed = await applyDestinationTax(
        item,
        customerInfo?.city ?? "",
        customerInfo?.state ?? "",
        customerInfo?.salesTaxCodeId ?? null,
        registerMode,
        saleId === -1 ? -1 : saleId,
        taxes,
        itemTaxes,
        taxedFlag,
        untaxedFlag,
      );
    }

    taxedFlags[item.line] = taxed ? taxedFlag : untaxedFlag;
  }

  return { taxes: roundTaxes(Array.from(taxes.values())), itemTaxes, taxedFlags };
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
  return { INCLUDED: TAX_TYPE_INCLUDED, EXCLUDED: TAX_TYPE_EXCLUDED };
}

export function getTaxTypeOptions(): { value: number; label: string }[] {
  return [
    { value: TAX_TYPE_EXCLUDED, label: "Sales Tax" },
    { value: TAX_TYPE_INCLUDED, label: "VAT" },
  ];
}

export { ROUNDING_MODE };
