import {
  bcAdd,
  bcMul,
  bcSub,
  dec,
  phpRound,
  toDbDecimal,
  type DecimalInput,
  type RoundingMode,
} from "@/lib/money";
import {
  CASH_ADJUSTMENT,
  CASH_MODE,
  DISCOUNT_TYPE,
  ITEM_TYPE,
  NEW_ITEM,
  PRICE_MODE,
  PRICE_OPTION,
  PRINT_OPTION,
  SALE_TYPE,
  STOCK_TYPE,
} from "@/lib/constants";
import {
  cashDecimals,
  getConfig,
  getConfigBool,
  getConfigNumber,
  quantityDecimals,
  taxDecimals,
  totalsDecimals,
} from "@/lib/config";
import { getTaxes, type SaleTaxGroup } from "@/lib/tax";
import {
  getAttributesForItem,
  getInfoByIdOrNumber,
  getItemKitById,
  getItemKitItems,
  getItemQuantities,
  getStockLocationName,
  type ItemRow,
} from "@/lib/items/repository";
import { getDb } from "@/lib/db";
import { dinnerTables, itemQuantities, items, sales, salesItems, salesPayments } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { CartLine, SaleCart, SalePayment } from "./types";
import {
  calculateTotals,
  getExtendedAmount,
  getItemDiscount,
  getItemTotal,
  getQuantitySold,
  type SaleTotals,
} from "./types";
import { lang } from "@/lib/i18n/lang";
import { nowDb } from "@/lib/datetime";

export type { CartLine, SaleCart, SalePayment, SaleTotals };

export const NAME_SEPARATOR = " | ";

export function getItems(cart: SaleCart): CartLine[] {
  return Object.values(cart.cart).sort((a, b) => a.line - b.line);
}

export function getPayments(cart: SaleCart): SalePayment[] {
  return cart.payments;
}

export function emptyPayments(cart: SaleCart): SaleCart {
  return { ...cart, payments: [] };
}

export function getCustomer(cart: SaleCart): number {
  return cart.customerId ?? NEW_ITEM;
}

export function setCustomer(cart: SaleCart, customerId: number): SaleCart {
  return { ...cart, customerId };
}

export function removeCustomer(cart: SaleCart): SaleCart {
  return {
    ...cart,
    customerId: NEW_ITEM,
    payments: cart.payments.filter((p) => p.paymentType !== lang("Sales.rewards")),
    giftcardRemainder: "0",
    rewardsRemainder: "0",
    invoiceNumber: "",
    quoteNumber: "",
    workOrderNumber: "",
  };
}

export function getEmployee(cart: SaleCart): number {
  return cart.employeeId ?? NEW_ITEM;
}

export function setEmployee(cart: SaleCart, employeeId: number): SaleCart {
  return { ...cart, employeeId };
}

export function getMode(cart: SaleCart): string {
  return cart.mode;
}

export function setMode(cart: SaleCart, mode: string): SaleCart {
  return { ...cart, mode: mode as SaleCart["mode"] };
}

export function clearMode(cart: SaleCart): SaleCart {
  return { ...cart, mode: "sale" };
}

export function getSaleType(cart: SaleCart): number {
  return cart.saleType;
}

export function setSaleType(cart: SaleCart, saleType: number): SaleCart {
  return { ...cart, saleType };
}

export function clearSaleType(cart: SaleCart): SaleCart {
  return { ...cart, saleType: SALE_TYPE.POS };
}

export function getDinnerTable(cart: SaleCart): number | null {
  return cart.dinnerTableId;
}

export function setDinnerTable(cart: SaleCart, dinnerTableId: number | null): SaleCart {
  return { ...cart, dinnerTableId };
}

export function clearTable(cart: SaleCart): SaleCart {
  return { ...cart, dinnerTableId: null };
}

export function getSaleLocation(cart: SaleCart): number {
  return cart.locationId;
}

export function setSaleLocation(cart: SaleCart, locationId: number): SaleCart {
  return { ...cart, locationId };
}

export function getPaymentType(cart: SaleCart): string | null {
  return cart.paymentType ?? null;
}

export function setPaymentType(cart: SaleCart, paymentType: string): SaleCart {
  return { ...cart, paymentType };
}

export function getGiftcardRemainder(cart: SaleCart): string {
  return cart.giftcardRemainder;
}
export function setGiftcardRemainder(cart: SaleCart, value: DecimalInput): SaleCart {
  return { ...cart, giftcardRemainder: String(value) };
}
export function clearGiftcardRemainder(cart: SaleCart): SaleCart {
  return { ...cart, giftcardRemainder: "0" };
}
export function getRewardsRemainder(cart: SaleCart): string {
  return cart.rewardsRemainder;
}
export function setRewardsRemainder(cart: SaleCart, value: DecimalInput): SaleCart {
  return { ...cart, rewardsRemainder: String(value) };
}
export function clearRewardsRemainder(cart: SaleCart): SaleCart {
  return { ...cart, rewardsRemainder: "0" };
}

export function getComment(cart: SaleCart): string {
  return cart.comment;
}
export function setComment(cart: SaleCart, comment: string): SaleCart {
  return { ...cart, comment };
}
export function clearComment(cart: SaleCart): SaleCart {
  return { ...cart, comment: "" };
}

export function getInvoiceNumber(cart: SaleCart): string | null {
  return cart.invoiceNumber || null;
}
export function setInvoiceNumber(cart: SaleCart, value: string): SaleCart {
  return { ...cart, invoiceNumber: value };
}
export function clearInvoiceNumber(cart: SaleCart): SaleCart {
  return { ...cart, invoiceNumber: "" };
}
export function getQuoteNumber(cart: SaleCart): string | null {
  return cart.quoteNumber || null;
}
export function setQuoteNumber(cart: SaleCart, value: string): SaleCart {
  return { ...cart, quoteNumber: value };
}
export function clearQuoteNumber(cart: SaleCart): SaleCart {
  return { ...cart, quoteNumber: "" };
}
export function getWorkOrderNumber(cart: SaleCart): string | null {
  return cart.workOrderNumber || null;
}
export function setWorkOrderNumber(cart: SaleCart, value: string): SaleCart {
  return { ...cart, workOrderNumber: value };
}
export function clearWorkOrderNumber(cart: SaleCart): SaleCart {
  return { ...cart, workOrderNumber: "" };
}
export function getSuspendedId(cart: SaleCart): number | null {
  return cart.suspendedId;
}
export function setSuspendedId(cart: SaleCart, id: number): SaleCart {
  return { ...cart, suspendedId: id };
}

export function isInvoiceMode(cart: SaleCart): boolean {
  return cart.mode === "sale_invoice";
}
export function isQuoteMode(cart: SaleCart): boolean {
  return cart.mode === "sale_quote";
}
export function isWorkOrderMode(cart: SaleCart): boolean {
  return cart.mode === "sale_work_order";
}
export function isReturnMode(cart: SaleCart): boolean {
  return cart.mode === "return";
}
export function isPriceWorkOrders(cart: SaleCart): boolean {
  return cart.priceWorkOrders;
}
export function setPriceWorkOrders(cart: SaleCart, value: boolean): SaleCart {
  return { ...cart, priceWorkOrders: value };
}
export function isPrintAfterSale(cart: SaleCart): boolean {
  return cart.printAfterSale;
}
export function setPrintAfterSale(cart: SaleCart, value: boolean): SaleCart {
  return { ...cart, printAfterSale: value };
}
export function isEmailReceipt(cart: SaleCart): boolean {
  return cart.emailReceipt;
}
export function setEmailReceipt(cart: SaleCart, value: boolean): SaleCart {
  return { ...cart, emailReceipt: value };
}
export function clearEmailReceipt(cart: SaleCart): SaleCart {
  return { ...cart, emailReceipt: false };
}

export function getSaleId(cart: SaleCart): number {
  return cart.saleId;
}
export function setSaleId(cart: SaleCart, saleId: number): SaleCart {
  return { ...cart, saleId };
}

export function clearAll(cart: SaleCart): SaleCart {
  return {
    ...cart,
    saleId: -1,
    mode: "sale",
    dinnerTableId: null,
    cart: [],
    comment: "",
    emailReceipt: false,
    invoiceNumber: "",
    quoteNumber: "",
    workOrderNumber: "",
    saleType: SALE_TYPE.POS,
    giftcardRemainder: "0",
    payments: [],
    customerId: NEW_ITEM,
    cashRounding: false,
    cashMode: false,
    paymentType: lang("Sales.cash"),
    suspendedId: null,
  };
}

export function clearCashFlags(cart: SaleCart): SaleCart {
  return { ...cart, cashRounding: false, cashMode: false, paymentType: lang("Sales.cash") };
}

/** `Sale_lib::reset_cash_rounding`. */
export function resetCashRounding(cart: SaleCart): { cart: SaleCart; cashRounding: boolean } {
  const cashRoundingCode = getConfigNumber("cash_rounding_code", 0);
  const cashRounding =
    cashDecimals() < totalsDecimals() || cashRoundingCode === 7;
  return {
    cart: { ...cart, cashRounding, cashMode: false },
    cashRounding,
  };
}

export function addPayment(
  cart: SaleCart,
  paymentType: string,
  paymentAmount: DecimalInput,
  referenceCode: string | null = null,
  cashAdjustment: number = CASH_ADJUSTMENT.CASH_ADJUSTMENT_FALSE,
): SaleCart {
  const payments = cart.payments.map((p) => ({ ...p }));
  const existing = payments.find((p) => p.paymentType === paymentType);
  if (existing) {
    existing.paymentAmount = toDbDecimal(
      bcAdd(existing.paymentAmount, paymentAmount),
      4,
    );
  } else {
    payments.push({
      paymentType,
      paymentAmount: toDbDecimal(paymentAmount, 4),
      cashRefund: "0",
      cashAdjustment,
      referenceCode,
    });
  }
  let cashMode = cart.cashMode;
  if (cart.cashMode) {
    if (
      cart.cashRounding &&
      paymentType !== lang("Sales.cash") &&
      paymentType !== lang("Sales.cash_adjustment")
    ) {
      cashMode = false;
    }
  }
  return { ...cart, payments, cashMode };
}

export function editPayment(
  cart: SaleCart,
  paymentType: string,
  amount: DecimalInput,
): { cart: SaleCart; success: boolean } {
  const payments = cart.payments.map((p) => ({ ...p }));
  const existing = payments.find((p) => p.paymentType === paymentType);
  if (!existing) return { cart, success: false };
  existing.paymentAmount = toDbDecimal(amount, 4);
  return { cart: { ...cart, payments }, success: true };
}

/** `Sale_lib::delete_payment` + sibling removal and cash-rounding reset. */
export function deletePayment(cart: SaleCart, paymentType: string): SaleCart {
  const decoded = decodeURIComponent(paymentType);
  let payments = cart.payments.filter((p) => p.paymentType !== decoded);
  const { cart: reset, cashRounding } = resetCashRounding(cart);
  if (cashRounding) {
    if (decoded === lang("Sales.cash")) {
      payments = payments.filter((p) => p.paymentType !== lang("Sales.cash_adjustment"));
    }
    if (decoded === lang("Sales.cash_adjustment")) {
      payments = payments.filter((p) => p.paymentType !== lang("Sales.cash"));
    }
  }
  return { ...reset, payments };
}

export function getPaymentsTotal(cart: SaleCart): { total: string; cashMode: boolean } {
  let subtotal = "0";
  let cashModeEligible = true;
  for (const payment of cart.payments) {
    if (!payment.cashAdjustment) {
      subtotal = bcAdd(subtotal, payment.paymentAmount).toFixed();
    }
    if (
      payment.paymentType !== lang("Sales.cash") &&
      payment.paymentType !== lang("Sales.cash_adjustment")
    ) {
      cashModeEligible = false;
    }
  }
  const cashMode = cashModeEligible && cart.cashRounding;
  return { total: toDbDecimal(subtotal, 4), cashMode };
}

export function checkForCashRounding(total: DecimalInput): string {
  return toDbDecimal(
    phpRound(total, cashDecimals(), getConfigNumber("cash_rounding_code", 0) as RoundingMode),
    cashDecimals(),
  );
}

export function getTotals(cart: SaleCart, taxes: SaleTaxGroup[]): SaleTotals {
  const payment = getPaymentsTotal(cart);
  const effectiveCart = payment.cashMode ? { ...cart, cashMode: true } : cart;
  return calculateTotals(effectiveCart.cart, taxes, {
    paymentTotal: payment.total,
    cashRounding: cart.cashRounding,
    cashMode: payment.cashMode || cart.cashMode,
    cashRoundingCode: getConfigNumber("cash_rounding_code", 0) as RoundingMode,
    cashDecimals: cashDecimals(),
    mode: cart.mode,
  });
}

/** `Sale_lib::get_total` — cash rounding applied only when cash mode is active. */
export async function getTotal(
  cart: SaleCart,
  includeCashRounding = true,
  taxes?: SaleTaxGroup[],
): Promise<string> {
  let total = "0";
  for (const item of getItems(cart)) {
    total = bcAdd(
      total,
      getItemTotal(item.quantity, item.price, item.discount, item.discountType, true),
    ).toFixed();
  }
  const taxRows =
    taxes ??
    (
      await getTaxes(
        getItems(cart).map((item) => ({
          itemId: item.itemId,
          line: item.line,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          discountType: item.discountType,
          taxCategoryId: item.taxCategoryId,
        })),
        { saleId: cart.saleId, registerMode: cart.mode, customerId: cart.customerId ?? -1 },
      )
    ).taxes;
  if (!getConfigBool("tax_included", false)) {
    for (const tax of taxRows) total = bcAdd(total, tax.saleTaxAmount).toFixed();
  }
  const { total: paymentTotal, cashMode } = getPaymentsTotal(cart);
  if (cashMode && includeCashRounding) {
    total = checkForCashRounding(total);
  }
  void paymentTotal;
  return toDbDecimal(total, totalsDecimals());
}

export async function getAmountDue(cart: SaleCart): Promise<string> {
  const payment = getPaymentsTotal(cart);
  const total = await getTotal(cart, true);
  const due = bcSub(total, payment.total);
  const precision = totalsDecimals();
  const rounded = phpRound(due, precision, 1);
  return dec(rounded).isZero() ? "0" : due.toFixed();
}

export function getQuantityAlreadyAdded(
  cart: SaleCart,
  itemId: number,
  itemLocation: number,
): string {
  return getItems(cart)
    .filter((item) => item.itemId === itemId && item.itemLocation === itemLocation)
    .reduce((sum, item) => bcAdd(sum, item.quantity), dec(0))
    .toFixed();
}

export async function outOfStock(
  cart: SaleCart,
  itemId: number,
  itemLocation: number,
): Promise<string> {
  if (itemId === NEW_ITEM) return "";
  const item = await getInfoByIdOrNumber(String(itemId), true);
  if (!item) return lang("Sales.unable_to_add_item");
  if (item.stockType !== STOCK_TYPE.HAS_STOCK) return "";
  const quantities = await getItemQuantities(itemId);
  const quantity = dec(quantities[itemLocation] ?? "0");
  const added = dec(getQuantityAlreadyAdded(cart, itemId, itemLocation));
  if (quantity.minus(added).lt(0)) return lang("Sales.quantity_less_than_zero");
  if (quantity.minus(added).lt(item.reorderLevel)) {
    return lang("Sales.quantity_less_than_reorder_level");
  }
  return "";
}

export interface AddItemInput {
  itemIdOrNumber: string;
  itemLocation: number;
  quantity?: DecimalInput;
  discount?: DecimalInput;
  discountType?: number;
  priceMode?: number;
  kitPriceOption?: number | null;
  kitPrintOption?: number | null;
  priceOverride?: DecimalInput | null;
  description?: string | null;
  serialnumber?: string | null;
  saleId?: number | null;
  includeDeleted?: boolean;
  printOption?: boolean | null;
  line?: number | null;
}

function kitPriceAllowed(
  priceMode: number,
  kitPriceOption: number | null,
  itemType: number,
  stockType: number,
): boolean {
  if (priceMode !== PRICE_MODE.PRICE_MODE_KIT) return true;
  return (
    kitPriceOption === PRICE_OPTION.PRICE_OPTION_ALL ||
    (kitPriceOption === PRICE_OPTION.PRICE_OPTION_KIT && itemType === ITEM_TYPE.ITEM_KIT) ||
    (kitPriceOption === PRICE_OPTION.PRICE_OPTION_KIT_STOCK && stockType === STOCK_TYPE.HAS_STOCK)
  );
}

function kitPrintOption(
  priceMode: number,
  kitPrintOptionValue: number | null,
  itemType: number,
  price: DecimalInput,
  printOption: boolean | null,
): number {
  if (priceMode === PRICE_MODE.PRICE_MODE_KIT) {
    if (kitPrintOptionValue === PRINT_OPTION.PRINT_ALL) return PRINT_OPTION.PRINT_YES;
    if (kitPrintOptionValue === PRINT_OPTION.PRINT_KIT && itemType === ITEM_TYPE.ITEM_KIT) {
      return PRINT_OPTION.PRINT_YES;
    }
    if (kitPrintOptionValue === PRINT_OPTION.PRINT_PRICED && dec(price).gt(0)) {
      return PRINT_OPTION.PRINT_YES;
    }
    return PRINT_OPTION.PRINT_NO;
  }
  if (printOption !== null && printOption !== undefined) {
    return printOption ? PRINT_OPTION.PRINT_YES : PRINT_OPTION.PRINT_NO;
  }
  return PRINT_OPTION.PRINT_YES;
}

/**
 * `Sale_lib::add_item`. Discounts are applied by the caller exactly like
 * `Sales::postAdd` (customer/default discount before adding).
 */
export async function addItem(
  cart: SaleCart,
  input: AddItemInput,
): Promise<{ cart: SaleCart; success: boolean }> {
  const item = await getInfoByIdOrNumber(input.itemIdOrNumber, input.includeDeleted ?? false);
  if (!item) return { cart, success: false };

  let quantity = toDbDecimal(input.quantity ?? "1", quantityDecimals());
  let discount = toDbDecimal(input.discount ?? "0", 4);
  const discountType = input.discountType ?? DISCOUNT_TYPE.PERCENT;
  const priceMode = input.priceMode ?? PRICE_MODE.PRICE_MODE_STANDARD;
  let price = input.priceOverride != null ? toDbDecimal(input.priceOverride, 4) : item.unitPrice;

  if (!kitPriceAllowed(priceMode, input.kitPriceOption ?? null, item.itemType, item.stockType)) {
    price = "0.00";
    discount = "0.00";
  }
  if (dec(price).isZero()) discount = "0.00";
  if (priceMode === PRICE_MODE.PRICE_MODE_KIT && discountType === DISCOUNT_TYPE.FIXED) {
    if (dec(discount).gt(price)) {
      const remainder = bcSub(discount, price);
      discount = price;
      void remainder;
    } else {
      discount = "0";
    }
  }

  const items = cart.cart.map((item) => ({ ...item }));
  let maxKey = 0;
  let alreadyInSale = false;
  let updateKey = 0;

  for (const line of items) {
    if (line.line >= maxKey) maxKey = line.line;
    if (line.itemId === item.itemId && line.itemLocation === input.itemLocation) {
      alreadyInSale = true;
      updateKey = line.line;
      if (!item.isSerialized) {
        quantity = toDbDecimal(bcAdd(quantity, line.quantity), quantityDecimals());
      }
    }
  }

  const insertKey = input.line ?? maxKey + 1;
  const selectedPrintOption = kitPrintOption(
    priceMode,
    input.kitPrintOption ?? null,
    item.itemType,
    price,
    input.printOption ?? null,
  );
  const total = getItemTotal(quantity, price, discount, discountType);
  const discountedTotal = getItemTotal(quantity, price, discount, discountType, true);

  let displayName = item.name;
  if (getConfigBool("multi_pack_enabled", false)) {
    displayName += `${NAME_SEPARATOR}${item.packName ?? ""}`;
  }

  const attributes = await getAttributesForItem(item.itemId, input.saleId ?? null, 2);
  const quantities = await getItemQuantities(item.itemId);
  const stockName = await getStockLocationName(input.itemLocation);

  if (!alreadyInSale || item.isSerialized) {
    const line: CartLine = {
      itemId: item.itemId,
      itemLocation: input.itemLocation,
      stockName,
      line: insertKey,
      name: displayName,
      itemNumber: item.itemNumber,
      attributeValues: attributes.attributeValues,
      attributeDtvalues: attributes.attributeDtvalues,
      description: input.description ?? item.description,
      serialnumber: input.serialnumber ?? "",
      allowAltDescription: item.allowAltDescription,
      isSerialized: item.isSerialized,
      quantity,
      discount,
      discountType,
      inStock: toDbDecimal(quantities[input.itemLocation] ?? "0", 4),
      price,
      costPrice: item.costPrice,
      total,
      discountedTotal,
      printOption: selectedPrintOption,
      stockType: item.stockType,
      itemType: item.itemType,
      hsnCode: item.hsnCode,
      taxCategoryId: item.taxCategoryId,
      taxedFlag: "",
    };
    items.push(line);
  } else {
    const line = items.find((entry) => entry.line === updateKey);
    if (line) {
      line.quantity = quantity;
      line.total = total;
      line.discountedTotal = discountedTotal;
    }
  }

  items.sort((a, b) => a.line - b.line);
  return { cart: { ...cart, cart: items }, success: true };
}

export async function addItemKit(
  cart: SaleCart,
  externalItemKitId: string,
  itemLocation: number,
  discount: DecimalInput,
  discountType: number,
  kitPriceOption: number,
  kitPrintOption: number,
): Promise<{ cart: SaleCart; success: boolean; stockWarning: string }> {
  const pieces = externalItemKitId.split(" ");
  const itemKitId = pieces.length > 1 ? pieces[1] : externalItemKitId;
  const kitItems = await getItemKitItems(Number(itemKitId));
  let current = cart;
  let success = true;
  let stockWarning = "";
  for (const kitItem of kitItems) {
    const result = await addItem(current, {
      itemIdOrNumber: String(kitItem.itemId),
      itemLocation,
      quantity: kitItem.quantity,
      discount,
      discountType,
      priceMode: PRICE_MODE.PRICE_MODE_KIT,
      kitPriceOption,
      kitPrintOption,
    });
    current = result.cart;
    success &&= result.success;
    if (!stockWarning) {
      stockWarning = await outOfStock(current, kitItem.itemId, itemLocation);
    }
  }
  return { cart: current, success, stockWarning };
}

export function editItem(
  cart: SaleCart,
  line: number,
  values: {
    description: string;
    serialnumber: string;
    quantity: DecimalInput;
    discount: DecimalInput;
    discountType?: number | null;
    price: DecimalInput;
    discountedTotal?: DecimalInput | null;
  },
): SaleCart {
  const items = cart.cart.map((item) => ({ ...item }));
  const target = items.find((item) => item.line === line);
  if (!target) return cart;

  let quantity = toDbDecimal(values.quantity, quantityDecimals());
  if (
    values.discountedTotal !== null &&
    values.discountedTotal !== undefined &&
    toDbDecimal(values.discountedTotal, 4) !== target.discountedTotal
  ) {
    quantity = getQuantitySold(values.discountedTotal, values.price);
  }
  target.description = values.description;
  target.serialnumber = values.serialnumber;
  target.quantity = quantity;
  target.discount = toDbDecimal(values.discount, 4);
  if (values.discountType !== null && values.discountType !== undefined) {
    target.discountType = values.discountType;
  }
  target.price = toDbDecimal(values.price, 4);
  target.total = getItemTotal(quantity, target.price, target.discount, target.discountType);
  target.discountedTotal = getItemTotal(
    quantity,
    target.price,
    target.discount,
    target.discountType,
    true,
  );
  return { ...cart, cart: items, payments: [] };
}

export async function deleteItem(cart: SaleCart, line: number): Promise<SaleCart> {
  const target = cart.cart.find((item) => item.line === line);
  if (target && target.itemType === ITEM_TYPE.ITEM_TEMP) {
    const db = await getDb();
    await db.update(items).set({ deleted: true }).where(eq(items.itemId, target.itemId));
  }
  return {
    ...cart,
    cart: cart.cart.filter((item) => item.line !== line),
    payments: [],
  };
}

export function applyCustomerDiscount(
  cart: SaleCart,
  discount: DecimalInput,
  discountType: number,
): SaleCart {
  const items = cart.cart.map((item) => {
    if (!dec(item.discount).isZero()) return item;
    return {
      ...item,
      discount: toDbDecimal(discount, 4),
      discountType,
      total: getItemTotal(item.quantity, item.price, discount, discountType),
      discountedTotal: getItemTotal(item.quantity, item.price, discount, discountType, true),
    };
  });
  return { ...cart, cart: items };
}

export async function returnEntireSale(
  cart: SaleCart,
  receiptSaleId: string,
): Promise<SaleCart> {
  const pieces = receiptSaleId.split(" ");
  const saleId = Number(pieces[1] ?? pieces[0]);
  const db = await getDb();
  const items = await db
    .select()
    .from(salesItems)
    .where(eq(salesItems.saleId, saleId))
    .orderBy(asc(salesItems.line));
  let current: SaleCart = { ...cart, cart: [], payments: [], customerId: NEW_ITEM };
  for (const row of items) {
    const result = await addItem(current, {
      itemIdOrNumber: String(row.itemId),
      itemLocation: row.itemLocation,
      quantity: toDbDecimal(bcMul(row.quantityPurchased, "-1"), 4),
      discount: row.discount,
      discountType: row.discountType,
      priceMode: PRICE_MODE.PRICE_MODE_STANDARD,
      priceOverride: row.itemUnitPrice,
      description: row.description,
      serialnumber: row.serialnumber,
      includeDeleted: true,
    });
    current = result.cart;
  }
  const saleRows = await db.select().from(sales).where(eq(sales.saleId, saleId)).limit(1);
  if (saleRows[0]?.customerId) {
    current = setCustomer(current, saleRows[0].customerId);
  }
  return current;
}

export async function copyEntireSale(cart: SaleCart, saleId: number): Promise<SaleCart> {
  const db = await getDb();
  const items = await db
    .select()
    .from(salesItems)
    .where(eq(salesItems.saleId, saleId))
    .orderBy(asc(salesItems.line));
  let current: SaleCart = { ...cart, cart: [], payments: [], customerId: NEW_ITEM };
  for (const row of items) {
    const result = await addItem(current, {
      itemIdOrNumber: String(row.itemId),
      itemLocation: row.itemLocation,
      quantity: row.quantityPurchased,
      discount: row.discount,
      discountType: row.discountType,
      priceMode: PRICE_MODE.PRICE_MODE_STANDARD,
      priceOverride: row.itemUnitPrice,
      description: row.description,
      serialnumber: row.serialnumber,
      saleId,
      includeDeleted: true,
      printOption: row.printOption === PRINT_OPTION.PRINT_YES,
    });
    current = result.cart;
  }

  const header = (await db.select().from(sales).where(eq(sales.saleId, saleId)).limit(1))[0];
  const payments = await db
    .select()
    .from(salesPayments)
    .where(eq(salesPayments.saleId, saleId))
    .orderBy(asc(salesPayments.paymentId));

  let cashMode = false;
  if (current.cashRounding && payments.length > 0) {
    const cashTypesOnly = payments.every(
      (p) =>
        p.paymentType === lang("Sales.cash") ||
        p.paymentType === lang("Sales.cash_adjustment"),
    );
    cashMode = cashTypesOnly;
  }

  current = {
    ...current,
    cashMode,
    payments: payments.map((p) => ({
      paymentType: p.paymentType,
      paymentAmount: p.paymentAmount,
      cashRefund: p.cashRefund,
      cashAdjustment: p.cashAdjustment ? 1 : 0,
      referenceCode: p.referenceCode ?? null,
    })),
    customerId: header?.customerId ?? NEW_ITEM,
    employeeId: header?.employeeId ?? NEW_ITEM,
    quoteNumber: header?.quoteNumber ?? "",
    workOrderNumber: header?.workOrderNumber ?? "",
    saleType: header?.saleType ?? SALE_TYPE.POS,
    comment: header?.comment ?? "",
    dinnerTableId: header?.dinnerTableId ?? null,
    saleId,
    suspendedId: saleId,
  };
  return current;
}

export async function getEmptyTables(currentDinnerTableId: number | null): Promise<
  { dinnerTableId: number; name: string }[]
> {
  const db = await getDb();
  const rows = await db.select().from(dinnerTables).where(eq(dinnerTables.deleted, false));
  return rows
    .filter(
      (row) =>
        row.status === 0 ||
        (currentDinnerTableId !== null && row.dinnerTableId === currentDinnerTableId),
    )
    .map((row) => ({ dinnerTableId: row.dinnerTableId, name: row.name }));
}

export async function getItemQuantity(
  itemId: number,
  locationId: number,
): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(itemQuantities)
    .where(and(eq(itemQuantities.itemId, itemId), eq(itemQuantities.locationId, locationId)))
    .limit(1);
  return rows[0]?.quantity ?? "0";
}

export function getItemName(item: ItemRow): string {
  return item.name;
}

void getExtendedAmount;
void getItemDiscount;
void taxDecimals;
void inArray;
void getConfig;
void getConfigNumber;
void nowDb;
void getConfigBool;
void getItemKitById;
