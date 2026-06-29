export interface CartLine {
  line: number;
  itemId: number;
  itemLocation: number;
  itemName: string;
  itemNumber: string | null;
  stockName: string;
  attributeValues: string;
  attributeDtvalues: string;
  description: string;
  serialnumber: string;
  allowAltDescription: boolean;
  isSerialized: boolean;
  quantity: number;
  discount: number;
  discountType: number;
  inStock: number;
  price: number;
  costPrice: number;
  total: number;
  discountedTotal: number;
  printOption: number;
  stockType: number;
  itemType: number;
  hsnCode: string;
  taxCategoryId: number | null;
  taxedFlag: string;
  promotionDiscount: number;
  unitPriceBeforePromo: number;
  promoQuantitySold: number;
  printAfterPromo: boolean;
}

export interface SalePayment {
  paymentId: string;
  paymentType: string;
  paymentAmount: number;
  cashRefund: number;
  cashAdjustment: number;
  employeeId: number;
  paymentTime: number;
  saleId?: number;
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
  paymentType: string;
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

export function getItemTotal(quantity: number, price: number, discount: number, discountType: number): number {
  let t = quantity * price;
  if (discountType === 0) t = t * (1 - discount / 100);
  else t = t - discount;
  return round(t, 4);
}

export function getItemTotalTaxExclusive(quantity: number, price: number, discount: number, discountType: number, taxIncluded: number, taxPercent: number): number {
  const priceWithTax = taxIncluded ? price : price * (1 + taxPercent / 100);
  return getItemTotal(quantity, priceWithTax, discount, discountType);
}

export function getExtendedAmount(quantity: number, price: number, discount: number, discountType: number): number {
  return getItemTotal(quantity, price, discount, discountType);
}

export function getExtendedTotalTaxExclusive(quantity: number, price: number, discount: number, discountType: number, taxIncluded: number, taxPercent: number): number {
  return getItemTotalTaxExclusive(quantity, price, discount, discountType, taxIncluded, taxPercent);
}

export function getItemDiscount(quantity: number, price: number, discount: number, discountType: number): number {
  const full = quantity * price;
  return round(full - getItemTotal(quantity, price, discount, discountType), 4);
}

export function getQuantitySold(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + l.quantity, 0);
}

export function getItemTax(item: CartLine, taxPercent: number, taxIncluded: boolean, roundingMode: number, taxDecimals: number): number {
  const base = getExtendedAmount(item.quantity, item.price, item.discount, item.discountType);
  if (taxIncluded) {
    const exclBase = base / (1 + taxPercent / 100);
    return round(base - exclBase, taxDecimals);
  }
  return round(base * (taxPercent / 100), taxDecimals);
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

export function calculateSubtotal(cart: CartLine[], includeDiscount: boolean, excludeTax: boolean): number {
  let total = 0;
  for (const l of cart) {
    let line = l.quantity * l.price;
    if (includeDiscount) {
      if (l.discountType === 0) line = line * (1 - l.discount / 100);
      else line = line - l.discount;
    }
    total += line;
  }
  return round(total, 4);
}

export function getDiscount(cart: CartLine[]): number {
  return cart.reduce((s, l) => {
    const full = l.quantity * l.price;
    const disc = l.discountType === 0 ? full * (l.discount / 100) : l.discount;
    return s + disc;
  }, 0);
}

export function getSubtotal(cart: CartLine[]): number {
  return calculateSubtotal(cart, true, false);
}
