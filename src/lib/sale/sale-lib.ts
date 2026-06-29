import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes, itemQuantities, customers, people, giftcards } from "@/db/schema";
import { getCart, saveCart, type CartLine } from "./cart-store";
import { getItemTotal } from "./types";
import { SALE_TYPE, STOCK_TYPE } from "@/lib/constants";
import { suggestItems } from "@/lib/items/repository";

function isItemId(s: string): boolean {
  return /^\d+$/.test(s) && !s.startsWith("0");
}

export async function addItem(itemInput: string, quantity = 1, opts: { itemLocation?: number; priceMode?: number } = {}): Promise<void> {
  const cart = await getCart();
  const db = getDbSync();
  const trimmedInput = itemInput.trim();
  let item = isItemId(trimmedInput)
    ? db.select().from(items).where(eq(items.itemId, parseInt(trimmedInput, 10))).get()
    : db.select().from(items).where(eq(items.itemNumber, trimmedInput)).get();

  if (!item && trimmedInput) {
    const suggestions = suggestItems(trimmedInput, { limit: 1 });
    item = suggestions[0] as typeof items.$inferSelect | undefined;
  }

  if (!item) throw new Error("Item not found");

  const itemLocation = opts.itemLocation ?? cart.locationId;
  const taxes = db.select().from(itemsTaxes).where(eq(itemsTaxes.itemId, item.itemId)).all();
  const existingIdx = cart.cart.findIndex((l) => l.itemId === item!.itemId && !item!.isSerialized);
  if (existingIdx >= 0) {
    cart.cart[existingIdx].quantity += quantity;
    cart.cart[existingIdx].total = getItemTotal(
      cart.cart[existingIdx].quantity,
      cart.cart[existingIdx].price,
      cart.cart[existingIdx].discount,
      cart.cart[existingIdx].discountType
    );
    cart.cart[existingIdx].discountedTotal = cart.cart[existingIdx].total;
  } else {
    const nextLine = cart.cart.length > 0 ? Math.max(...cart.cart.map((l) => l.line)) + 1 : 1;
    const line: CartLine = {
      line: nextLine,
      itemId: item.itemId,
      itemLocation,
      itemName: item.name,
      itemNumber: item.itemNumber,
      description: item.description ?? "",
      serialnumber: "",
      quantity,
      discount: 0,
      discountType: 0,
      price: item.unitPrice,
      costPrice: item.costPrice,
      stockType: item.stockType,
      taxCategoryId: item.taxCategoryId,
      taxedFlag: "",
      printOption: 0,
      isSerialized: item.isSerialized,
      total: getItemTotal(quantity, item.unitPrice, 0, 0),
      discountedTotal: getItemTotal(quantity, item.unitPrice, 0, 0),
    };
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
  if (updated.discountType === 0 && updated.discount > 100) updated.discount = 100;
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

export async function selectCustomer(customerId: number): Promise<void> {
  const cart = await getCart();
  cart.customerId = customerId;
  const db = getDbSync();
  const customer = db.select().from(customers).where(eq(customers.personId, customerId)).get();
  if (customer && customer.discount > 0) {
    for (const line of cart.cart) {
      if (line.discount === 0) {
        line.discount = customer.discount;
        line.discountType = customer.discountType;
        line.total = getItemTotal(line.quantity, line.price, line.discount, line.discountType);
        line.discountedTotal = line.total;
      }
    }
  }
  await saveCart(cart);
}

export async function removeCustomer(): Promise<void> {
  const cart = await getCart();
  cart.customerId = null;
  cart.giftcardRemainder = 0;
  cart.rewardsRemainder = 0;
  cart.invoiceNumber = "";
  cart.quoteNumber = "";
  await saveCart(cart);
}

export async function changeMode(mode: SaleCart["mode"]): Promise<void> {
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

import type { SaleCart } from "./types";

export async function addPayment(paymentType: string, amountTendered: number): Promise<void> {
  const cart = await getCart();
  const db = getDbSync();

  let actualType = paymentType;
  let actualAmount = amountTendered;

  if (paymentType.startsWith("giftcard:")) {
    const giftcardNumber = paymentType.slice("giftcard:".length);
    const gc = db.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).get();
    if (!gc) throw new Error("Gift card not found");
    actualAmount = Math.min(amountTendered, gc.value);
    const newGcValue = gc.value - actualAmount;
    db.update(giftcards).set({ value: newGcValue }).where(eq(giftcards.giftcardId, gc.giftcardId)).run();
    cart.giftcardRemainder = newGcValue;
  }

  const existingIdx = cart.payments.findIndex((p) => p.paymentType === actualType);
  if (existingIdx >= 0) {
    cart.payments[existingIdx].paymentAmount += actualAmount;
  } else {
    cart.payments.push({
      paymentId: `${actualType}-${Date.now()}`,
      paymentType: actualType,
      paymentAmount: actualAmount,
      cashRefund: 0,
      cashAdjustment: 0,
    });
  }
  await saveCart(cart);
}

export async function deletePayment(paymentId: string): Promise<void> {
  const cart = await getCart();
  cart.payments = cart.payments.filter((p) => p.paymentId !== paymentId);
  await saveCart(cart);
}

export async function setComment(comment: string): Promise<void> {
  const cart = await getCart();
  cart.comment = comment;
  await saveCart(cart);
}

export async function setInvoiceNumber(num: string): Promise<void> {
  const cart = await getCart();
  cart.invoiceNumber = num;
  await saveCart(cart);
}

export async function setPrintAfterSale(v: boolean): Promise<void> {
  const cart = await getCart();
  cart.printAfterSale = v;
  await saveCart(cart);
}

export async function setEmailReceipt(v: boolean): Promise<void> {
  const cart = await getCart();
  cart.emailReceipt = v;
  await saveCart(cart);
}

export async function setPriceWorkOrders(v: boolean): Promise<void> {
  const cart = await getCart();
  cart.priceWorkOrders = v;
  await saveCart(cart);
}

export async function setLocation(locationId: number): Promise<void> {
  const cart = await getCart();
  cart.locationId = locationId;
  await saveCart(cart);
}

export function getCartSyncProxy() {
  return { getCart, saveCart, addItem, editItem, deleteItem, selectCustomer, removeCustomer, changeMode, addPayment, deletePayment, setComment, setInvoiceNumber, setPrintAfterSale, setEmailReceipt, setPriceWorkOrders, setLocation };
}

export async function returnEntireSale(saleId: number): Promise<void> {
  const cart = await getCart();
  cart.cart = [];
  cart.payments = [];
  cart.mode = "return";
  cart.saleType = SALE_TYPE.RETURN;
  await saveCart(cart);
}

void STOCK_TYPE;
void itemQuantities;
void people;