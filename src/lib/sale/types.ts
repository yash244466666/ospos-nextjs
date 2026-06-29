import type { CartLine } from "./cart-store";

export interface SalePayment {
  paymentId: string;
  paymentType: string;
  paymentAmount: number;
  cashRefund: number;
  cashAdjustment: number;
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
  giftcardRemainder: number;
  rewardsRemainder: number;
  cashRounding: boolean;
  cashMode: boolean;
  allowTempItems: boolean;
}

export function getItemTotal(quantity: number, price: number, discount: number, discountType: number): number {
  let t = quantity * price;
  if (discountType === 0) t = t * (1 - discount / 100);
  else t = t - discount;
  return round(t, 4);
}

export function getCartTotals(cart: CartLine[], taxTotal: number, taxIncluded: boolean) {
  const prediscountSubtotal = cart.reduce((s, l) => s + l.quantity * l.price, 0);
  const itemDiscount = cart.reduce((s, l) => {
    if (l.discountType === 0) return s + (l.quantity * l.price * l.discount / 100);
    return s + l.discount;
  }, 0);
  const subtotal = round(prediscountSubtotal - itemDiscount, 4);
  const total = taxIncluded ? subtotal : round(subtotal + taxTotal, 4);
  return { prediscountSubtotal, subtotal, itemDiscount, total, taxTotal };
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}