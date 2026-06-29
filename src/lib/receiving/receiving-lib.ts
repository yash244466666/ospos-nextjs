import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes } from "@/db/schema";
import { getReceivingCart, saveReceivingCart, type ReceivingCart, type ReceivingLine } from "./receiving-store";

function isItemId(s: string): boolean {
  return /^\d+$/.test(s) && !s.startsWith("0");
}

export async function addItem(itemInput: string, quantity = 1, opts: { itemLocation?: number } = {}): Promise<void> {
  const cart = await getReceivingCart();
  const db = getDbSync();
  const item = isItemId(itemInput)
    ? db.select().from(items).where(eq(items.itemId, parseInt(itemInput, 10))).get()
    : db.select().from(items).where(eq(items.itemNumber, itemInput)).get();
  if (!item) throw new Error("Item not found");

  const itemLocation = opts.itemLocation ?? cart.locationId;
  const existingIdx = cart.cart.findIndex((l) => l.itemId === item.itemId && !item.isSerialized);
  if (existingIdx >= 0) {
    cart.cart[existingIdx].quantity += quantity;
    cart.cart[existingIdx].total = cart.cart[existingIdx].quantity * cart.cart[existingIdx].price;
  } else {
    const nextLine = cart.cart.length > 0 ? Math.max(...cart.cart.map((l) => l.line)) + 1 : 1;
    const line: ReceivingLine = {
      line: nextLine,
      itemId: item.itemId,
      itemLocation,
      itemName: item.name,
      itemNumber: item.itemNumber,
      description: item.description ?? "",
      quantity,
      discount: 0,
      discountType: 0,
      price: item.costPrice,
      costPrice: item.costPrice,
      stockType: item.stockType,
      isSerialized: item.isSerialized,
      total: quantity * item.costPrice,
    };
    cart.cart.push(line);
  }
  await saveReceivingCart(cart);
  void itemsTaxes;
}

export async function editItem(line: number, edits: Partial<ReceivingLine>): Promise<void> {
  const cart = await getReceivingCart();
  const idx = cart.cart.findIndex((l) => l.line === line);
  if (idx < 0) return;
  const updated = { ...cart.cart[idx], ...edits };
  if (updated.quantity < 0) updated.quantity = 0;
  if (updated.price < 0) updated.price = 0;
  if (updated.discountType === 0 && updated.discount > 100) updated.discount = 100;
  updated.total = updated.discountType === 0
    ? updated.quantity * updated.price * (1 - updated.discount / 100)
    : updated.quantity * updated.price - updated.discount;
  cart.cart[idx] = updated;
  await saveReceivingCart(cart);
}

export async function deleteItem(line: number): Promise<void> {
  const cart = await getReceivingCart();
  cart.cart = cart.cart.filter((l) => l.line !== line);
  await saveReceivingCart(cart);
}

export async function selectSupplier(supplierId: number): Promise<void> {
  const cart = await getReceivingCart();
  cart.supplierId = supplierId;
  await saveReceivingCart(cart);
}

export async function removeSupplier(): Promise<void> {
  const cart = await getReceivingCart();
  cart.supplierId = null;
  await saveReceivingCart(cart);
}

export async function setComment(comment: string): Promise<void> {
  const cart = await getReceivingCart();
  cart.comment = comment;
  await saveReceivingCart(cart);
}

export async function setInvoiceNumber(num: string): Promise<void> {
  const cart = await getReceivingCart();
  cart.invoiceNumber = num;
  await saveReceivingCart(cart);
}

export async function setReference(ref: string): Promise<void> {
  const cart = await getReceivingCart();
  cart.reference = ref;
  await saveReceivingCart(cart);
}

export async function setLocation(locationId: number): Promise<void> {
  const cart = await getReceivingCart();
  cart.locationId = locationId;
  await saveReceivingCart(cart);
}

export async function changeMode(mode: ReceivingCart["mode"]): Promise<void> {
  const cart = await getReceivingCart();
  cart.mode = mode;
  await saveReceivingCart(cart);
}

export function getReceivingTotals(cart: ReceivingLine[]) {
  const subtotal = cart.reduce((s, l) => s + l.total, 0);
  return { subtotal, total: subtotal };
}