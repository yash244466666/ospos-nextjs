import { getSessionData, updateSessionData, type SessionData } from "@/lib/session";
import { SALE_TYPE } from "@/lib/constants";
import type { CartLine, SaleCart, SalePayment } from "./types";

export type { CartLine, SalePayment, SaleCart };

/**
 * Sale_lib session contract (ADR-03). Keys mirror upstream exactly; cart state
 * lives on the browser's `ospos_sessions` row, not on the employee.
 */

export function emptyCart(locationId = 1): SaleCart {
  return {
    cart: [],
    payments: [],
    customerId: -1,
    employeeId: -1,
    mode: "sale",
    saleType: SALE_TYPE.POS,
    saleId: -1,
    suspendedId: null,
    comment: "",
    invoiceNumber: "",
    quoteNumber: "",
    workOrderNumber: "",
    dinnerTableId: null,
    locationId,
    printAfterSale: false,
    emailReceipt: false,
    priceWorkOrders: false,
    giftcardRemainder: "0",
    rewardsRemainder: "0",
    cashRounding: false,
    cashMode: false,
    allowTempItems: false,
    paymentType: "Cash",
  };
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function cartFromSession(data: SessionData): SaleCart {
  const base = emptyCart();
  const location = asNumber(data.sales_location, base.locationId);
  return {
    cart: Array.isArray(data.sales_cart) ? (data.sales_cart as CartLine[]) : [],
    payments: Array.isArray(data.sales_payments) ? (data.sales_payments as SalePayment[]) : [],
    customerId: asNumber(data.sales_customer, -1),
    employeeId: asNumber(data.sales_employee, -1),
    mode: asString(data.sales_mode, "sale") as SaleCart["mode"],
    saleType: asNumber(data.sale_type, SALE_TYPE.POS),
    saleId: asNumber(data.sale_id, -1),
    suspendedId:
      typeof data.suspended_id === "number" ? (data.suspended_id as number) : null,
    comment: asString(data.sales_comment, ""),
    invoiceNumber: asString(data.sales_invoice_number, ""),
    quoteNumber: asString(data.sales_quote_number, ""),
    workOrderNumber: asString(data.sales_work_order_number, ""),
    dinnerTableId:
      typeof data.dinner_table === "number" ? (data.dinner_table as number) : null,
    locationId: location,
    printAfterSale: asBoolean(data.sales_print_after_sale),
    emailReceipt: asBoolean(data.sales_email_receipt),
    priceWorkOrders: asBoolean(data.sales_price_work_orders),
    giftcardRemainder: String(asNumber(data.giftcard_remainder, 0)),
    rewardsRemainder: String(asNumber(data.rewards_remainder, 0)),
    cashRounding: asBoolean(data.cash_rounding),
    cashMode: asBoolean(data.cash_mode),
    allowTempItems: asBoolean(data.allow_temp_items),
    paymentType: asString(data.payment_type, "Cash"),
  };
}

export function cartToSession(cart: SaleCart): SessionData {
  return {
    sales_cart: cart.cart,
    sales_payments: cart.payments,
    sales_customer: cart.customerId,
    sales_employee: cart.employeeId,
    sales_mode: cart.mode,
    sale_type: cart.saleType,
    sale_id: cart.saleId,
    suspended_id: cart.suspendedId ?? undefined,
    sales_comment: cart.comment,
    sales_invoice_number: cart.invoiceNumber,
    sales_quote_number: cart.quoteNumber,
    sales_work_order_number: cart.workOrderNumber,
    dinner_table: cart.dinnerTableId ?? undefined,
    sales_location: cart.locationId,
    sales_print_after_sale: cart.printAfterSale,
    sales_email_receipt: cart.emailReceipt,
    sales_price_work_orders: cart.priceWorkOrders,
    giftcard_remainder: cart.giftcardRemainder,
    rewards_remainder: cart.rewardsRemainder,
    cash_rounding: cart.cashRounding,
    cash_mode: cart.cashMode,
    allow_temp_items: cart.allowTempItems,
    payment_type: cart.paymentType,
  };
}

export async function getCart(): Promise<SaleCart> {
  const data = await getSessionData();
  const cart = cartFromSession(data);
  if (data.sales_location === undefined && typeof data.person_id === "number") {
    const { getDefaultLocationId } = await import("@/lib/stock_locations/repository");
    const defaultLocation = await getDefaultLocationId("sales", data.person_id);
    if (defaultLocation !== null) cart.locationId = defaultLocation;
  }
  return cart;
}

export async function saveCart(cart: SaleCart): Promise<void> {
  await updateSessionData((data) => ({ ...data, ...cartToSession(cart) }));
}

export async function clearCart(): Promise<void> {
  await saveCart(emptyCart());
}
