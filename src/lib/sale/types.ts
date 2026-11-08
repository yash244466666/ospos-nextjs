import {
  bcAdd,
  bcDiv,
  bcMul,
  bcSub,
  dec,
  phpRound,
  toDbDecimal,
  type DecimalInput,
  type RoundingMode,
} from "@/lib/money";
import { DISCOUNT_TYPE, ROUNDING_MODE, STOCK_TYPE } from "@/lib/constants";
import { quantityDecimals, totalsDecimals } from "@/lib/config";

export interface CartLine {
  line: number;
  itemId: number;
  itemLocation: number;
  stockName: string;
  name: string;
  itemNumber: string | null;
  attributeValues: string;
  attributeDtvalues: string;
  description: string;
  serialnumber: string;
  allowAltDescription: boolean;
  isSerialized: boolean;
  quantity: string;
  discount: string;
  discountType: number;
  inStock: string;
  price: string;
  costPrice: string;
  total: string;
  discountedTotal: string;
  printOption: number;
  stockType: number;
  itemType: number;
  hsnCode: string;
  taxCategoryId: number | null;
  taxedFlag: string;
}

export interface SalePayment {
  paymentType: string;
  paymentAmount: string;
  cashRefund: string;
  cashAdjustment: number;
  referenceCode: string | null;
}

export interface SaleCart {
  cart: CartLine[];
  payments: SalePayment[];
  customerId: number | null;
  employeeId: number | null;
  mode: "sale" | "sale_invoice" | "sale_quote" | "sale_work_order" | "return";
  saleType: number;
  saleId: number;
  suspendedId: number | null;
  comment: string;
  invoiceNumber: string;
  quoteNumber: string;
  workOrderNumber: string;
  dinnerTableId: number | null;
  locationId: number;
  printAfterSale: boolean;
  emailReceipt: boolean;
  priceWorkOrders: boolean;
  giftcardRemainder: string;
  rewardsRemainder: string;
  cashRounding: boolean;
  cashMode: boolean;
  allowTempItems: boolean;
  paymentType: string;
}

export interface SaleTotals {
  prediscountSubtotal: string;
  totalDiscount: string;
  subtotal: string;
  total: string;
  taxTotal: string;
  paymentTotal: string;
  cashTotal: string;
  amountDue: string;
  cashAmountDue: string;
  paymentsCoverTotal: boolean;
  itemCount: number;
  totalUnits: string;
  cashAdjustmentAmount: string;
}

/** `Sale_lib::get_item_discount` — rounded at totals decimals, HALF_UP. */
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

/** `Sale_lib::get_item_total` — no rounding beyond bcmath scale. */
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

/** `Sale_lib::get_quantity_sold` — bcdiv at quantity decimals. */
export function getQuantitySold(total: DecimalInput, price: DecimalInput): string {
  if (dec(price).isZero()) return "0";
  return toDbDecimal(bcDiv(total, price, quantityDecimals()), quantityDecimals());
}

/** `Sale_lib::get_extended_amount`. */
export function getExtendedAmount(
  quantity: DecimalInput,
  price: DecimalInput,
  discountAmount: DecimalInput = "0",
): string {
  return toDbDecimal(bcSub(bcMul(quantity, price), discountAmount), 4);
}

/** `Sale_lib::get_item_tax` — included taxes are extracted, excluded added. */
export function getItemTax(
  quantity: DecimalInput,
  price: DecimalInput,
  discount: DecimalInput,
  discountType: number,
  taxPercentage: DecimalInput,
  taxIncluded: boolean,
): string {
  const total = getItemTotal(quantity, price, discount, discountType, true);
  if (taxIncluded) {
    const fraction = bcDiv(bcAdd("100", taxPercentage), "100");
    const exclusive = bcDiv(total, fraction);
    return toDbDecimal(bcSub(total, exclusive), 4);
  }
  return toDbDecimal(bcMul(total, bcDiv(taxPercentage, "100")), 4);
}

export interface TaxAmountLike {
  taxType: number;
  saleTaxAmount: string;
}

/** `Sale_lib::get_totals`. */
export function calculateTotals(
  cart: CartLine[],
  taxes: TaxAmountLike[],
  options: {
    paymentTotal: string;
    cashRounding: boolean;
    cashMode: boolean;
    cashRoundingCode: RoundingMode;
    cashDecimals: number;
    mode: string;
  },
): SaleTotals {
  let prediscountSubtotal = "0";
  let subtotal = "0";
  let total = "0";
  let totalDiscount = "0";
  let itemCount = 0;
  let totalUnits = "0";

  for (const item of cart) {
    if (item.stockType === STOCK_TYPE.HAS_STOCK) {
      itemCount += 1;
      totalUnits = bcAdd(totalUnits, item.quantity).toFixed();
    }
    const discountAmount = getItemDiscount(
      item.quantity,
      item.price,
      item.discount,
      item.discountType,
    );
    totalDiscount = bcAdd(totalDiscount, discountAmount).toFixed();
    const extended = getExtendedAmount(item.quantity, item.price);
    const discounted = getExtendedAmount(item.quantity, item.price, discountAmount);
    prediscountSubtotal = bcAdd(prediscountSubtotal, extended).toFixed();
    total = bcAdd(total, discounted).toFixed();
    subtotal = bcAdd(subtotal, discounted).toFixed();
  }

  let taxTotal = "0";
  for (const tax of taxes) {
    if (tax.taxType === 1) {
      total = bcAdd(total, tax.saleTaxAmount).toFixed();
      taxTotal = bcAdd(taxTotal, tax.saleTaxAmount).toFixed();
    } else {
      subtotal = bcSub(subtotal, tax.saleTaxAmount).toFixed();
    }
  }

  const cashTotal = options.cashRounding
    ? phpRound(total, options.cashDecimals, options.cashRoundingCode).toFixed(options.cashDecimals)
    : total;
  const amountDue = bcSub(total, options.paymentTotal).toFixed(4);
  const cashAmountDue = bcSub(cashTotal, options.paymentTotal).toFixed(4);
  const currentDue = options.cashMode ? cashAmountDue : amountDue;
  const threshold = dec(10).pow(-totalsDecimals()).div(2);
  const paymentsCoverTotal =
    options.mode === "return"
      ? dec(currentDue).gt(threshold.neg())
      : dec(currentDue).lt(threshold);

  const cashAdjustmentAmount = paymentsCoverTotal
    ? toDbDecimal(
        phpRound(
          bcSub(cashTotal, total),
          totalsDecimals(),
          ROUNDING_MODE.HALF_UP,
        ),
        totalsDecimals(),
      )
    : "0";

  return {
    prediscountSubtotal: toDbDecimal(prediscountSubtotal, 4),
    totalDiscount: toDbDecimal(totalDiscount, totalsDecimals()),
    subtotal: toDbDecimal(subtotal, 4),
    total: toDbDecimal(total, totalsDecimals()),
    taxTotal: toDbDecimal(taxTotal, totalsDecimals()),
    paymentTotal: toDbDecimal(options.paymentTotal, 4),
    cashTotal: toDbDecimal(cashTotal, totalsDecimals()),
    amountDue: toDbDecimal(amountDue, totalsDecimals()),
    cashAmountDue: toDbDecimal(cashAmountDue, totalsDecimals()),
    paymentsCoverTotal,
    itemCount,
    totalUnits,
    cashAdjustmentAmount,
  };
}

/** Compatibility helpers for callers that still use numeric APIs. */
export function toNumber(value: DecimalInput): number {
  return Number(dec(value).toString());
}


/** Compatibility shim for register components; the authoritative path is `calculateTotals`. */
export function getCartTotals(
  cart: CartLine[],
  taxTotal: DecimalInput = "0",
  taxIncluded = false,
) {
  const totals = calculateTotals(cart, [
    { taxType: taxIncluded ? 0 : 1, saleTaxAmount: String(taxTotal) },
  ], {
    paymentTotal: "0",
    cashRounding: false,
    cashMode: false,
    cashRoundingCode: ROUNDING_MODE.HALF_UP,
    cashDecimals: 2,
    mode: "sale",
  });
  return {
    prediscountSubtotal: toNumber(totals.prediscountSubtotal),
    subtotal: toNumber(totals.subtotal),
    itemDiscount: toNumber(totals.totalDiscount),
    total: toNumber(totals.total),
    taxTotal: toNumber(totals.taxTotal),
  };
}
