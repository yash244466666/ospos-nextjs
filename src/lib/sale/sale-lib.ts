import { eq, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import {
  items, itemsTaxes, itemQuantities, stockLocations,
  customers, employees, giftcards, dinnerTables, sales, salesItems, salesPayments,
  customerRewards, rewards, itemKits, itemKitItems,
  attributeDefinitions, attributeLinks, attributeValues,
} from "@/db/schema";
import { getCart, saveCart, emptyCart, type CartLine, type SalePayment, type SaleCart } from "./cart-store";
import { getItemTotal, getItemTotalTaxExclusive, getExtendedAmount, getItemTax, calculateSubtotal, getSubtotal, getDiscount, getCartTotals, getQuantitySold, getItemDiscount } from "./types";
import { SALE_TYPE, STOCK_TYPE, ITEM_TYPE, DISCOUNT_TYPE, SALE_STATUS, PRICE_MODE, PERCENT, FIXED, HAS_STOCK, HAS_NO_STOCK, PRINT_OPTION, GIFT_CARD_PREFIX, REWARDS_PREFIX, CASH_ADJUSTMENT_PAYMENT_TYPE, SUSPENDED_SALE_PREFIX, VALID_INVOICE_TYPES, VALID_RECEIPT_TEMPLATES, KEY_SHORTCUTS, REGISTER_MODES, INVOICE_TYPES, LINE_SEQUENCES, NEW_ENTRY, DEFAULT_PAYMENT_TYPES, ROUNDING_MODE } from "@/lib/constants";
import { getConfig, getConfigBool, getConfigNumber, cashDecimals, totalsDecimals, taxDecimals } from "@/lib/config";
import { suggestItems as repoSuggestItems, getItemByIdOrNumber, getItemTaxes, getQuantitiesByLocation, getStockLocations } from "@/lib/items/repository";
import { getCustomer } from "@/lib/persons/repository";
import { getTaxes, getItemTotal as taxItemTotal, roundNumber } from "@/lib/tax";

function isItemId(s: string): boolean {
  return /^\d+$/.test(s) && !s.startsWith("0");
}

export function getCartAsync(): Promise<SaleCart> { return getCart(); }
export function saveCartAsync(cart: SaleCart): Promise<void> { return saveCart(cart); }

export async function outOfStock(itemId: number, locationId: number): Promise<{ outOfStock: boolean; message: string }> {
  const cart = await getCart();
  const item = getItemByIdOrNumber(String(itemId));
  if (!item) return { outOfStock: false, message: "" };
  if (item.stockType === HAS_NO_STOCK) return { outOfStock: false, message: "" };
  const db = getDbSync();
  const row = db.select().from(itemQuantities)
    .where(eq(itemQuantities.itemId, item.itemId))
    .all();
  const inStock = row.reduce((s, r) => s + (r.locationId === locationId ? r.quantity : 0), 0);
  const alreadyAdded = getQuantityAlreadyAdded(cart.cart, item.itemId);
  if (inStock - alreadyAdded <= 0) {
    return { outOfStock: true, message: `Insufficient stock for ${item.name}` };
  }
  return { outOfStock: false, message: "" };
}

export function getQuantityAlreadyAdded(cart: CartLine[], itemId: number): number {
  return cart.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.quantity, 0);
}

export function getItemId(cart: CartLine[], line: number): number | null {
  const l = cart.find((x) => x.line === line);
  return l ? l.itemId : null;
}

export function getLineByItemId(cart: CartLine[], itemId: number): CartLine | null {
  return cart.find((l) => l.itemId === itemId) ?? null;
}

export function getAttributesByItem(itemId: number): { definitionId: number; definitionName: string; attributeValue: string | null; attributeDate: string | null; attributeDecimal: number | null }[] {
  const db = getDbSync();
  const rows = db.select({
    definitionId: attributeLinks.definitionId,
    definitionName: attributeDefinitions.definitionName,
    attributeValue: attributeValues.attributeValue,
    attributeDate: attributeValues.attributeDate,
    attributeDecimal: attributeValues.attributeDecimal,
  })
    .from(attributeLinks)
    .innerJoin(attributeDefinitions, eq(attributeDefinitions.definitionId, attributeLinks.definitionId))
    .leftJoin(attributeValues, eq(attributeValues.attributeId, attributeLinks.attributeId))
    .where(eq(attributeLinks.itemId, itemId))
    .all();
  return rows;
}

function buildCartLineFromItem(item: typeof items.$inferSelect, locationId: number, quantity: number, line: number): CartLine {
  const total = getItemTotal(quantity, item.unitPrice, 0, PERCENT);
  return {
    line,
    itemId: item.itemId,
    itemLocation: locationId,
    itemName: item.name,
    itemNumber: item.itemNumber ?? null,
    stockName: "",
    attributeValues: "",
    attributeDtvalues: "",
    description: item.description ?? "",
    serialnumber: "",
    allowAltDescription: item.allowAltDescription,
    isSerialized: item.isSerialized,
    quantity,
    discount: 0,
    discountType: PERCENT,
    inStock: 0,
    price: item.unitPrice,
    costPrice: item.costPrice,
    total,
    discountedTotal: total,
    printOption: PRINT_OPTION.PRINT_ALL,
    stockType: item.stockType,
    itemType: item.itemType,
    hsnCode: item.hsnCode ?? "",
    taxCategoryId: item.taxCategoryId,
    taxedFlag: "",
    promotionDiscount: 0,
    unitPriceBeforePromo: item.unitPrice,
    promoQuantitySold: 0,
    printAfterPromo: false,
  };
}

export async function addItem(
  itemInput: string,
  quantity = 1,
  opts: {
    itemLocation?: number;
    discount?: number;
    discountType?: number;
    priceMode?: number;
    kitPriceOption?: number;
    kitPrintOption?: number;
    priceOverride?: number | null;
    description?: string;
    serialnumber?: string;
    saleId?: number | null;
    includeDeleted?: boolean;
    printOption?: number;
    line?: number | null;
  } = {}
): Promise<void> {
  const cart = await getCart();
  const db = getDbSync();
  const trimmedInput = itemInput.trim();
  let item = isItemId(trimmedInput)
    ? db.select().from(items).where(eq(items.itemId, parseInt(trimmedInput, 10))).get()
    : db.select().from(items).where(eq(items.itemNumber, trimmedInput)).get();

  if (!item && trimmedInput) {
    const suggestions = repoSuggestItems(trimmedInput, { limit: 1 });
    item = suggestions[0];
  }

  if (!item) throw new Error("Item not found");
  if (item.deleted && !opts.includeDeleted) throw new Error("Item not found");

  const itemLocation = opts.itemLocation ?? cart.locationId;
  const priceMode = opts.priceMode ?? PRICE_MODE.PRICE_MODE_EXCLUDE;

  const existingIdx = cart.cart.findIndex((l) => l.itemId === item!.itemId && !item!.isSerialized && !opts.serialnumber);
  if (existingIdx >= 0 && !opts.serialnumber) {
    cart.cart[existingIdx].quantity += quantity;
    const updated = { ...cart.cart[existingIdx] };
    updated.total = getItemTotal(updated.quantity, updated.price, updated.discount, updated.discountType);
    updated.discountedTotal = updated.total;
    cart.cart[existingIdx] = updated;
  } else {
    const nextLine = opts.line ?? (cart.cart.length > 0 ? Math.max(...cart.cart.map((l) => l.line)) + 1 : 1);
    let line = buildCartLineFromItem(item, itemLocation, quantity, nextLine);
    if (opts.priceOverride != null) line.price = opts.priceOverride;
    if (opts.description != null) line.description = opts.description;
    if (opts.serialnumber != null) line.serialnumber = opts.serialnumber;
    if (opts.discount != null) line.discount = opts.discount;
    if (opts.discountType != null) line.discountType = opts.discountType;
    if (opts.printOption != null) line.printOption = opts.printOption;
    cart.cart.push(line);
  }
  cart.payments = [];
  await saveCart(cart);
}

export async function editItem(line: number, edits: Partial<CartLine>): Promise<void> {
  const cart = await getCart();
  const idx = cart.cart.findIndex((l) => l.line === line);
  if (idx < 0) return;
  const updated = { ...cart.cart[idx], ...edits };
  if (updated.quantity < 0) updated.quantity = 0;
  if (updated.price < 0) updated.price = 0;
  if (updated.discountType === PERCENT && updated.discount > 100) updated.discount = 100;
  if (updated.discountType === FIXED && updated.discount < 0) updated.discount = 0;
  updated.total = getItemTotal(updated.quantity, updated.price, updated.discount, updated.discountType);
  updated.discountedTotal = updated.total;
  cart.cart[idx] = updated;
  cart.payments = [];
  await saveCart(cart);
}

export async function deleteItem(line: number): Promise<void> {
  const cart = await getCart();
  cart.cart = cart.cart.filter((l) => l.line !== line);
  cart.payments = [];
  await saveCart(cart);
}

export async function emptyPayments(): Promise<void> {
  const cart = await getCart();
  cart.payments = [];
  await saveCart(cart);
}

export async function clearGiftcardRemainder(): Promise<void> {
  const cart = await getCart();
  cart.giftcardRemainder = 0;
  await saveCart(cart);
}

export async function clearRewardsRemainder(): Promise<void> {
  const cart = await getCart();
  cart.rewardsRemainder = 0;
  await saveCart(cart);
}

export async function clearInvoiceNumber(): Promise<void> {
  const cart = await getCart();
  cart.invoiceNumber = "";
  await saveCart(cart);
}

export async function clearQuoteNumber(): Promise<void> {
  const cart = await getCart();
  cart.quoteNumber = "";
  await saveCart(cart);
}

export async function clearWorkOrderNumber(): Promise<void> {
  const cart = await getCart();
  cart.workOrderNumber = "";
  await saveCart(cart);
}

export async function setSaleType(saleType: number, keepCustom = true): Promise<void> {
  const cart = await getCart();
  cart.saleType = saleType;
  if (!keepCustom) {
    cart.invoiceNumber = "";
    cart.quoteNumber = "";
    cart.workOrderNumber = "";
  }
  await saveCart(cart);
}

export async function setMode(mode: SaleCart["mode"]): Promise<void> {
  const cart = await getCart();
  cart.mode = mode;
  const saleTypeMap: Record<string, number> = {
    sale: SALE_TYPE.POS,
    sale_invoice: SALE_TYPE.INVOICE,
    sale_quote: SALE_TYPE.QUOTE,
    sale_work_order: SALE_TYPE.WORK_ORDER,
    return: SALE_TYPE.RETURN,
  };
  cart.saleType = saleTypeMap[mode];
  cart.payments = [];
  await saveCart(cart);
}

export function getMode(cart: SaleCart): SaleCart["mode"] { return cart.mode; }
export function isInvoiceMode(cart: SaleCart): boolean { return cart.mode === "sale_invoice"; }
export function isQuoteMode(cart: SaleCart): boolean { return cart.mode === "sale_quote"; }
export function isWorkOrderMode(cart: SaleCart): boolean { return cart.mode === "sale_work_order"; }
export function isReturnMode(cart: SaleCart): boolean { return cart.mode === "return"; }
export function isSaleByReceiptMode(): boolean { return false; }

export function getLineSequenceOptions() { return LINE_SEQUENCES; }
export function getRegisterModeOptions() { return REGISTER_MODES; }
export function getInvoiceTypeOptions() { return INVOICE_TYPES; }
export function getKeyShortcutsOptions() { return KEY_SHORTCUTS; }
export function getKeyShortcuts() { return KEY_SHORTCUTS; }

export function isValidInvoiceType(t: string | null | undefined): boolean {
  if (!t) return false;
  return (VALID_INVOICE_TYPES as readonly string[]).includes(t);
}
export function isValidReceiptTemplate(t: string | null | undefined): boolean {
  if (!t) return false;
  return (VALID_RECEIPT_TEMPLATES as readonly string[]).includes(t);
}

export function isPrintAfterSale(cart: SaleCart): boolean {
  if (getConfig("print_receipt_check_behaviour", "0") === "1") return cart.printAfterSale;
  return getConfigBool("print_after_sale", false) || cart.printAfterSale;
}

export function setPrintAfterSale(cart: SaleCart, v: boolean): SaleCart {
  cart.printAfterSale = v;
  return cart;
}

export function isEmailReceipt(cart: SaleCart): boolean {
  if (getConfig("email_receipt_check_behaviour", "0") === "1") return cart.emailReceipt;
  return getConfigBool("email_receipt", false) || cart.emailReceipt;
}

export function setEmailReceipt(cart: SaleCart, v: boolean): SaleCart {
  cart.emailReceipt = v;
  return cart;
}

export function clearEmailReceipt(cart: SaleCart): SaleCart {
  cart.emailReceipt = false;
  return cart;
}

export function isPriceWorkOrders(cart: SaleCart): boolean {
  return cart.priceWorkOrders;
}

export function setPriceWorkOrders(cart: SaleCart, v: boolean): SaleCart {
  cart.priceWorkOrders = v;
  return cart;
}

export async function setComment(cart: SaleCart, v: string): Promise<SaleCart> {
  cart.comment = v;
  await saveCart(cart);
  return cart;
}
export async function setInvoiceNumber(cart: SaleCart, v: string): Promise<SaleCart> {
  cart.invoiceNumber = v;
  await saveCart(cart);
  return cart;
}
export async function setQuoteNumber(cart: SaleCart, v: string): Promise<SaleCart> {
  cart.quoteNumber = v;
  await saveCart(cart);
  return cart;
}
export async function setWorkOrderNumber(cart: SaleCart, v: string): Promise<SaleCart> {
  cart.workOrderNumber = v;
  await saveCart(cart);
  return cart;
}

export async function setSuspendedId(cart: SaleCart, id: number | null): Promise<SaleCart> {
  cart.suspendedId = id;
  await saveCart(cart);
  return cart;
}

export async function setSaleLocation(cart: SaleCart, locationId: number): Promise<SaleCart> {
  cart.locationId = locationId;
  await saveCart(cart);
  return cart;
}

export async function clearSaleLocation(cart: SaleCart): Promise<SaleCart> {
  cart.locationId = 1;
  await saveCart(cart);
  return cart;
}

export async function setDinnerTable(cart: SaleCart, dinnerTableId: number | null): Promise<SaleCart> {
  cart.dinnerTableId = dinnerTableId;
  await saveCart(cart);
  return cart;
}

export async function clearTable(cart: SaleCart): Promise<SaleCart> {
  cart.dinnerTableId = null;
  await saveCart(cart);
  return cart;
}

export async function setCustomer(cart: SaleCart, customerId: number | null): Promise<SaleCart> {
  cart.customerId = customerId;
  await saveCart(cart);
  return cart;
}

export async function removeCustomer(cart: SaleCart): Promise<SaleCart> {
  cart.customerId = null;
  cart.giftcardRemainder = 0;
  cart.rewardsRemainder = 0;
  cart.invoiceNumber = "";
  cart.quoteNumber = "";
  cart.payments = cart.payments.filter((p) => !p.paymentType.startsWith(GIFT_CARD_PREFIX) && p.paymentType !== REWARDS_PREFIX);
  await saveCart(cart);
  return cart;
}

export async function setEmployee(cart: SaleCart, employeeId: number | null): Promise<SaleCart> {
  cart.employeeId = employeeId;
  await saveCart(cart);
  return cart;
}

export async function removeEmployee(cart: SaleCart): Promise<SaleCart> {
  cart.employeeId = null;
  await saveCart(cart);
  return cart;
}

export async function setPaymentType(cart: SaleCart, paymentType: string): Promise<SaleCart> {
  cart.paymentType = paymentType;
  await saveCart(cart);
  return cart;
}

export async function setGiftcardRemainder(cart: SaleCart, v: number): Promise<SaleCart> {
  cart.giftcardRemainder = v;
  await saveCart(cart);
  return cart;
}

export async function setRewardsRemainder(cart: SaleCart, v: number): Promise<SaleCart> {
  cart.rewardsRemainder = v;
  await saveCart(cart);
  return cart;
}

export function getPayments(cart: SaleCart): SalePayment[] { return cart.payments; }
export function getPaymentType(cart: SaleCart): string { return cart.paymentType; }
export function getComment(cart: SaleCart): string { return cart.comment; }
export function getInvoiceNumber(cart: SaleCart): string { return cart.invoiceNumber; }
export function getQuoteNumber(cart: SaleCart): string { return cart.quoteNumber; }
export function getWorkOrderNumber(cart: SaleCart): string { return cart.workOrderNumber; }
export function getSaleType(cart: SaleCart): number { return cart.saleType; }
export function getCustomerId(cart: SaleCart): number | null { return cart.customerId; }
export function getEmployeeId(cart: SaleCart): number | null { return cart.employeeId; }
export function getDinnerTableId(cart: SaleCart): number | null { return cart.dinnerTableId; }
export function getSaleLocationId(cart: SaleCart): number { return cart.locationId; }
export function getSuspendedId(cart: SaleCart): number | null { return cart.suspendedId; }
export function getSaleId(cart: SaleCart): number { return cart.saleId; }
export function getGiftcardRemainder(cart: SaleCart): number { return cart.giftcardRemainder; }
export function getRewardsRemainder(cart: SaleCart): number { return cart.rewardsRemainder; }
export function getCashRounding(cart: SaleCart): boolean { return cart.cashRounding; }
export function getCashMode(cart: SaleCart): boolean { return cart.cashMode; }

export function applyCustomerDiscount(cart: SaleCart, customerId: number | null): SaleCart {
  if (!customerId) return cart;
  const customer = getCustomer(customerId);
  if (!customer || !customer.discount) return cart;
  for (const line of cart.cart) {
    if (line.discount === 0) {
      line.discount = customer.discount;
      line.discountType = customer.discountType;
      line.total = getItemTotal(line.quantity, line.price, line.discount, line.discountType);
      line.discountedTotal = line.total;
    }
  }
  return cart;
}

export function getDiscountTotal(cart: SaleCart): number { return getDiscount(cart.cart); }

export function getSubtotalExclTax(cart: SaleCart): number { return calculateSubtotal(cart.cart, true, true); }
export function getSubtotalInclTax(cart: SaleCart): number { return calculateSubtotal(cart.cart, true, false); }

export function getPrediscountSubtotal(cart: SaleCart): number {
  return cart.cart.reduce((s, l) => s + l.quantity * l.price, 0);
}

export function getItemTotalForLine(line: CartLine, taxIncluded: boolean, taxPercent = 0): number {
  return taxIncluded
    ? getItemTotalTaxExclusive(line.quantity, line.price, line.discount, line.discountType, taxIncluded ? 1 : 0, taxPercent)
    : getItemTotal(line.quantity, line.price, line.discount, line.discountType);
}

export function getTotal(cart: SaleCart, taxes: { saleTaxAmount: number }[]): number {
  const subtotal = getSubtotal(cart.cart);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  return roundNumber(subtotal + taxTotal, ROUNDING_MODE_VAL, totalsDecimals());
}

const ROUNDING_MODE_VAL = ROUNDING_MODE.HALF_UP;

export function getPaymentsTotal(cart: SaleCart): number {
  return cart.payments
    .filter((p) => p.paymentType !== CASH_ADJUSTMENT_PAYMENT_TYPE)
    .reduce((s, p) => s + p.paymentAmount, 0);
}

export function getAmountDue(cart: SaleCart, taxes: { saleTaxAmount: number }[]): number {
  const total = getTotal(cart, taxes);
  const paid = getPaymentsTotal(cart);
  return roundNumber(total - paid, ROUNDING_MODE_VAL, totalsDecimals());
}

export function getTotals(cart: SaleCart, taxes: { saleTaxAmount: number }[]): {
  prediscountSubtotal: number;
  subtotal: number;
  total: number;
  taxTotal: number;
  cashTotal: number;
  paymentTotal: number;
  amountDue: number;
  cashAmountDue: number;
  paymentsCoverTotal: boolean;
  itemCount: number;
  totalUnits: number;
  cashAdjustmentAmount: number;
  discount: number;
} {
  const prediscountSubtotal = getPrediscountSubtotal(cart);
  const subtotal = getSubtotal(cart.cart);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  const cashAdjustmentAmount = cart.payments
    .filter((p) => p.paymentType === CASH_ADJUSTMENT_PAYMENT_TYPE)
    .reduce((s, p) => s + p.paymentAmount, 0);
  let total = subtotal + taxTotal;
  if (cart.cashRounding && cart.cashMode) {
    total = roundNumber(total, ROUNDING_MODE_VAL, cashDecimals());
  }
  const cashTotal = cart.payments
    .filter((p) => p.paymentType === "Cash" || p.paymentType === "Cash " || p.paymentType === "Cash Drop" || p.paymentType === "Cash Payout")
    .reduce((s, p) => s + p.paymentAmount, 0);
  const paymentTotal = getPaymentsTotal(cart);
  const amountDue = roundNumber(total - paymentTotal, ROUNDING_MODE_VAL, totalsDecimals());
  const cashAmountDue = roundNumber(Math.max(0, total - cashTotal), ROUNDING_MODE_VAL, totalsDecimals());
  return {
    prediscountSubtotal,
    subtotal,
    total,
    taxTotal,
    cashTotal,
    paymentTotal,
    amountDue,
    cashAmountDue,
    paymentsCoverTotal: amountDue <= 0,
    itemCount: cart.cart.length,
    totalUnits: getQuantitySold(cart.cart),
    cashAdjustmentAmount,
    discount: getDiscount(cart.cart),
  };
}

export async function addPayment(
  cart: SaleCart,
  paymentId: string,
  amount: number,
  cashAdjustment = 0,
  employeeId: number | null = null
): Promise<SaleCart> {
  const db = getDbSync();
  const isGiftcard = paymentId.startsWith("giftcard:");
  const isRewards = paymentId === REWARDS_PREFIX;
  let actualType = paymentId;
  let actualAmount = amount;

  if (isGiftcard) {
    const giftcardNumber = paymentId.slice("giftcard:".length);
    const gc = db.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).get();
    if (!gc) throw new Error("Gift card not found");
    actualAmount = Math.min(amount, gc.value);
    const newGcValue = roundNumber(gc.value - actualAmount, ROUNDING_MODE_VAL, 2);
    db.update(giftcards).set({ value: newGcValue }).where(eq(giftcards.giftcardId, gc.giftcardId)).run();
    actualType = `${GIFT_CARD_PREFIX}${giftcardNumber}`;
    cart.giftcardRemainder = newGcValue;
  } else if (isRewards) {
    if (cart.customerId) {
      const cust = db.select().from(customers).where(eq(customers.personId, cart.customerId)).get();
      if (cust) {
        actualAmount = Math.min(amount, cust.points);
        db.update(customers).set({ points: cust.points - actualAmount }).where(eq(customers.personId, cart.customerId)).run();
        cart.rewardsRemainder = cust.points - actualAmount;
      }
    }
  }

  const existingIdx = cart.payments.findIndex((p) => p.paymentType === actualType);
  if (existingIdx >= 0) {
    cart.payments[existingIdx].paymentAmount += actualAmount;
  } else {
    cart.payments.push({
      paymentId: `${actualType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      paymentType: actualType,
      paymentAmount: actualAmount,
      cashRefund: 0,
      cashAdjustment: cashAdjustment,
      employeeId: employeeId ?? 0,
      paymentTime: Math.floor(Date.now() / 1000),
    });
  }

  if (cashAdjustment !== 0) {
    cart.payments.push({
      paymentId: `${CASH_ADJUSTMENT_PAYMENT_TYPE}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      paymentType: CASH_ADJUSTMENT_PAYMENT_TYPE,
      paymentAmount: cashAdjustment,
      cashRefund: 0,
      cashAdjustment: 0,
      employeeId: employeeId ?? 0,
      paymentTime: Math.floor(Date.now() / 1000),
    });
  }

  if (actualType === "Cash") {
    cart.cashMode = true;
  } else {
    cart.cashMode = cart.payments.length > 0 ? cart.payments.every((p) => p.paymentType === "Cash") : false;
  }
  await saveCart(cart);
  return cart;
}

export async function editPayment(cart: SaleCart, paymentId: string, amount: number): Promise<SaleCart> {
  const idx = cart.payments.findIndex((p) => p.paymentId === paymentId);
  if (idx < 0) return cart;
  cart.payments[idx].paymentAmount = amount;
  await saveCart(cart);
  return cart;
}

export async function deletePayment(cart: SaleCart, paymentId: string): Promise<SaleCart> {
  const payment = cart.payments.find((p) => p.paymentId === paymentId);
  if (payment) {
    if (payment.cashAdjustment !== 0) {
      cart.payments = cart.payments.filter((p) => p.paymentType !== CASH_ADJUSTMENT_PAYMENT_TYPE);
    }
    if (payment.paymentType.startsWith(GIFT_CARD_PREFIX)) {
      const giftcardNumber = payment.paymentType.slice(GIFT_CARD_PREFIX.length);
      const db = getDbSync();
      const gc = db.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).get();
      if (gc) {
        db.update(giftcards).set({ value: roundNumber(gc.value + payment.paymentAmount, ROUNDING_MODE_VAL, 2) }).where(eq(giftcards.giftcardId, gc.giftcardId)).run();
      }
      cart.giftcardRemainder = 0;
    }
    if (payment.paymentType === REWARDS_PREFIX && cart.customerId) {
      const db = getDbSync();
      const cust = db.select().from(customers).where(eq(customers.personId, cart.customerId)).get();
      if (cust) {
        db.update(customers).set({ points: cust.points + payment.paymentAmount }).where(eq(customers.personId, cart.customerId)).run();
      }
      cart.rewardsRemainder = 0;
    }
  }
  cart.payments = cart.payments.filter((p) => p.paymentId !== paymentId);
  cart.cashMode = cart.payments.length > 0 ? cart.payments.every((p) => p.paymentType === "Cash") : false;
  await saveCart(cart);
  return cart;
}

export function clearCashFlags(cart: SaleCart): SaleCart {
  cart.cashRounding = false;
  cart.cashMode = false;
  return cart;
}

export function resetCashRounding(cart: SaleCart): SaleCart {
  const cashCode = getConfigNumber("cash_rounding_code", 0);
  if (cashCode > 0 && cashDecimals() < totalsDecimals()) {
    cart.cashRounding = true;
  } else {
    cart.cashRounding = false;
  }
  return cart;
}

export function isCustomerTaxable(cart: SaleCart): boolean {
  if (!cart.customerId) return true;
  const customer = getCustomer(cart.customerId);
  return customer?.taxable ?? true;
}

export async function removeTempItems(cart: SaleCart): Promise<void> {
  const db = getDbSync();
  for (const line of cart.cart) {
    if (line.itemType === ITEM_TYPE.ITEM_TEMP) {
      db.update(items).set({ deleted: true }).where(eq(items.itemId, line.itemId)).run();
    }
  }
  cart.cart = cart.cart.filter((l) => l.itemType !== ITEM_TYPE.ITEM_TEMP);
  await saveCart(cart);
}

export function sortAndFilterCart(cart: SaleCart): SaleCart {
  const sequence = getConfigNumber("line_sequence", 0);
  if (sequence === 0) {
    cart.cart = cart.cart.filter((l) => l.printOption !== PRINT_OPTION.DO_NOT_PRINT);
  } else if (sequence === 1) {
    cart.cart = cart.cart.filter((l) => l.printOption !== PRINT_OPTION.DO_NOT_PRINT);
    cart.cart = cart.cart.sort((a, b) => a.line - b.line);
  } else if (sequence === 2) {
    cart.cart = cart.cart.filter((l) => l.printOption !== PRINT_OPTION.DO_NOT_PRINT);
  }
  return cart;
}

export function checkForCashRounding(cart: SaleCart): boolean {
  return cart.cashRounding;
}

export async function returnEntireSale(cart: SaleCart, receiptInput: string): Promise<SaleCart> {
  const db = getDbSync();
  const trimmed = receiptInput.trim();
  const m = trimmed.match(/^POS\s+(\d+)$/i);
  if (m) {
    const saleId = parseInt(m[1], 10);
    const sale = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
    if (sale) {
      const lines = db.select().from(salesItems).where(eq(salesItems.saleId, saleId)).all();
      cart.cart = lines.map((r) => ({
        line: r.line,
        itemId: r.itemId,
        itemLocation: r.itemLocation ?? cart.locationId,
        itemName: "",
        itemNumber: null,
        stockName: "",
        attributeValues: "",
        attributeDtvalues: "",
        description: r.description ?? "",
        serialnumber: r.serialnumber ?? "",
        allowAltDescription: false,
        isSerialized: false,
        quantity: Math.abs(r.quantityPurchased),
        discount: r.discount,
        discountType: r.discountType,
        inStock: 0,
        price: r.itemUnitPrice,
        costPrice: r.itemCostPrice,
        total: Math.abs(r.quantityPurchased) * r.itemUnitPrice * (r.discountType === PERCENT ? 1 - r.discount / 100 : 1) - (r.discountType === FIXED ? r.discount : 0),
        discountedTotal: 0,
        printOption: r.printOption,
        stockType: 0,
        itemType: 0,
        hsnCode: "",
        taxCategoryId: null,
        taxedFlag: "",
        promotionDiscount: 0,
        unitPriceBeforePromo: r.itemUnitPrice,
        promoQuantitySold: 0,
        printAfterPromo: false,
      }));
      cart.customerId = sale.customerId;
      cart.mode = "return";
      cart.saleType = SALE_TYPE.RETURN;
      await saveCart(cart);
    }
  }
  return cart;
}

export async function addItemKit(
  cart: SaleCart,
  itemKitId: number,
  itemLocation: number,
  discount: number,
  discountType: number
): Promise<SaleCart> {
  const db = getDbSync();
  const kit = db.select().from(itemKits).where(eq(itemKits.itemKitId, itemKitId)).get();
  if (!kit) return cart;
  const kitItems = db.select().from(itemKitItems).where(eq(itemKitItems.itemKitId, itemKitId)).all();
  const priceMode = kit.priceOption === 3 ? PRICE_MODE.PRICE_MODE_KIT : PRICE_MODE.PRICE_MODE_KIT_PART;
  for (const ki of kitItems) {
    const item = db.select().from(items).where(eq(items.itemId, ki.itemId)).get();
    if (!item) continue;
    const linePrice = priceMode === PRICE_MODE.PRICE_MODE_KIT ? kit.priceOption : item.unitPrice;
    const nextLine = cart.cart.length > 0 ? Math.max(...cart.cart.map((l) => l.line)) + 1 : 1;
    const line = buildCartLineFromItem(item, itemLocation, ki.quantity, nextLine);
    line.price = linePrice;
    line.discount = discount;
    line.discountType = discountType;
    line.total = getItemTotal(ki.quantity, linePrice, discount, discountType);
    line.discountedTotal = line.total;
    line.printOption = kit.printOption;
    cart.cart.push(line);
  }
  cart.payments = [];
  await saveCart(cart);
  return cart;
}

export async function copyEntireSale(cart: SaleCart, saleId: number): Promise<SaleCart> {
  const db = getDbSync();
  const sale = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
  if (!sale) return cart;
  const lines = db.select().from(salesItems).where(eq(salesItems.saleId, saleId)).all();
  const payments = db.select().from(salesPayments).where(eq(salesPayments.saleId, saleId)).all();
  cart.cart = lines.map((r) => ({
    line: r.line,
    itemId: r.itemId,
    itemLocation: r.itemLocation ?? cart.locationId,
    itemName: "",
    itemNumber: null,
    stockName: "",
    attributeValues: "",
    attributeDtvalues: "",
    description: r.description ?? "",
    serialnumber: r.serialnumber ?? "",
    allowAltDescription: false,
    isSerialized: false,
    quantity: Math.abs(r.quantityPurchased),
    discount: r.discount,
    discountType: r.discountType,
    inStock: 0,
    price: r.itemUnitPrice,
    costPrice: r.itemCostPrice,
    total: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
    discountedTotal: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
    printOption: r.printOption,
    stockType: 0,
    itemType: 0,
    hsnCode: "",
    taxCategoryId: null,
    taxedFlag: "",
    promotionDiscount: 0,
    unitPriceBeforePromo: r.itemUnitPrice,
    promoQuantitySold: 0,
    printAfterPromo: false,
  }));
  cart.payments = payments.map((p) => ({
    paymentId: `${p.paymentType}-${p.paymentTime}-${Math.random().toString(36).slice(2, 6)}`,
    paymentType: p.paymentType,
    paymentAmount: p.paymentAmount,
    cashRefund: p.cashRefund,
    cashAdjustment: p.cashAdjustment,
    employeeId: p.employeeId ?? 0,
    paymentTime: p.paymentTime ?? Math.floor(Date.now() / 1000),
  }));
  cart.customerId = sale.customerId;
  cart.employeeId = sale.employeeId;
  cart.invoiceNumber = sale.invoiceNumber ?? "";
  cart.quoteNumber = sale.quoteNumber ?? "";
  cart.workOrderNumber = sale.workOrderNumber ?? "";
  cart.saleType = sale.saleType;
  cart.dinnerTableId = sale.dinnerTableId;
  cart.locationId = sale.saleLocation ?? 1;
  cart.saleId = sale.saleId;
  cart.mode = sale.saleType === SALE_TYPE.QUOTE ? "sale_quote"
    : sale.saleType === SALE_TYPE.WORK_ORDER ? "sale_work_order"
    : sale.saleType === SALE_TYPE.INVOICE ? "sale_invoice"
    : sale.saleType === SALE_TYPE.RETURN ? "return"
    : "sale";
  cart.cashMode = payments.length > 0 ? payments.every((p) => p.paymentType === "Cash") : false;
  cart.cashRounding = false;
  await saveCart(cart);
  return cart;
}

export async function clearAll(): Promise<SaleCart> {
  const empty = emptyCart();
  await saveCart(empty);
  return empty;
}

export async function removeTempItemsAction(): Promise<void> {
  const cart = await getCart();
  await removeTempItems(cart);
}

export function emptyCartShape(): SaleCart { return emptyCart(); }

export function getDefaultPaymentOptions() { return DEFAULT_PAYMENT_TYPES; }
export function getPaymentOptions(): readonly string[] { return DEFAULT_PAYMENT_TYPES; }

export { isItemId };
