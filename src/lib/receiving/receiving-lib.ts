import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes, itemKits, itemKitItems, receivings, receivingsItems } from "@/db/schema";
import { getReceivingCart, saveReceivingCart, type ReceivingCart, type ReceivingLine } from "./receiving-store";
import { STOCK_TYPE, ITEM_TYPE, PERCENT, FIXED, SALE_STATUS } from "@/lib/constants";
import { recordDelta } from "@/lib/inventory";
import { getItemLocation } from "@/lib/items/item-lib";

function isItemId(s: string): boolean {
  return /^\d+$/.test(s) && !s.startsWith("0");
}

export async function addItem(
  itemInput: string,
  quantity = 1,
  opts: {
    itemLocation?: number;
    discount?: number;
    discountType?: number;
    price?: number;
    description?: string;
    serialnumber?: string;
    receivingQuantity?: number;
    includeDeleted?: boolean;
    line?: number | null;
  } = {}
): Promise<void> {
  const cart = await getReceivingCart();
  const db = getDbSync();
  const item = isItemId(itemInput)
    ? db.select().from(items).where(eq(items.itemId, parseInt(itemInput, 10))).get()
    : db.select().from(items).where(eq(items.itemNumber, itemInput)).get();
  if (!item) throw new Error("Item not found");
  if (item.deleted && !opts.includeDeleted) throw new Error("Item not found");

  const itemLocation = opts.itemLocation ?? cart.locationId;
  const existingIdx = cart.cart.findIndex((l) => l.itemId === item.itemId && !item.isSerialized && !opts.serialnumber);
  if (existingIdx >= 0 && !opts.serialnumber) {
    cart.cart[existingIdx].quantity += quantity;
    cart.cart[existingIdx].total = computeLineTotal(cart.cart[existingIdx].quantity, cart.cart[existingIdx].price, cart.cart[existingIdx].discount, cart.cart[existingIdx].discountType);
  } else {
    const nextLine = opts.line ?? (cart.cart.length > 0 ? Math.max(...cart.cart.map((l) => l.line)) + 1 : 1);
    const line: ReceivingLine = {
      line: nextLine,
      itemId: item.itemId,
      itemLocation,
      itemName: item.name,
      itemNumber: item.itemNumber,
      description: opts.description ?? item.description ?? "",
      quantity,
      discount: opts.discount ?? 0,
      discountType: opts.discountType ?? 0,
      price: opts.price ?? item.costPrice,
      costPrice: item.costPrice,
      stockType: item.stockType,
      isSerialized: item.isSerialized,
      receivingQuantity: opts.receivingQuantity ?? item.receivingQuantity ?? 1,
      total: computeLineTotal(quantity, opts.price ?? item.costPrice, opts.discount ?? 0, opts.discountType ?? 0),
    };
    cart.cart.push(line);
  }
  await saveReceivingCart(cart);
  void itemsTaxes;
}

export function computeLineTotal(quantity: number, price: number, discount: number, discountType: number): number {
  let t = quantity * price;
  if (discountType === PERCENT) t = t * (1 - discount / 100);
  else t = t - discount;
  return Math.round(t * 10000) / 10000;
}

export async function editItem(line: number, edits: Partial<ReceivingLine>): Promise<void> {
  const cart = await getReceivingCart();
  const idx = cart.cart.findIndex((l) => l.line === line);
  if (idx < 0) return;
  const updated = { ...cart.cart[idx], ...edits };
  if (updated.quantity < 0) updated.quantity = 0;
  if (updated.price < 0) updated.price = 0;
  if (updated.discountType === PERCENT && updated.discount > 100) updated.discount = 100;
  updated.total = computeLineTotal(updated.quantity, updated.price, updated.discount, updated.discountType);
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
  cart.reference = "";
  cart.invoiceNumber = "";
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
  cart.reference = "";
  await saveReceivingCart(cart);
}

export function getReceivingTotals(cart: ReceivingLine[]): { subtotal: number; total: number } {
  const subtotal = cart.reduce((s, l) => s + l.total, 0);
  return { subtotal, total: subtotal };
}

export async function getCartFor(): Promise<ReceivingCart> {
  return getReceivingCart();
}

export async function returnEntireReceiving(cart: ReceivingCart, receiptInput: string): Promise<ReceivingCart> {
  const db = getDbSync();
  const trimmed = receiptInput.trim();
  const recvMatch = trimmed.match(/^RECV\s+(\d+)$/i);
  const kitMatch = trimmed.match(/^KIT\s+(\d+)$/i);
  if (recvMatch) {
    const id = parseInt(recvMatch[1], 10);
    const receiving = db.select().from(receivings).where(eq(receivings.receivingId, id)).get();
    if (receiving) {
      const lines = db.select().from(receivingsItems).where(eq(receivingsItems.receivingId, id)).all();
      cart.cart = lines.map((r) => ({
        line: r.line,
        itemId: r.itemId,
        itemLocation: r.itemLocation ?? cart.locationId,
        itemName: "",
        itemNumber: null,
        description: r.description ?? "",
        quantity: r.quantityPurchased,
        discount: r.discount,
        discountType: r.discountType,
        price: r.itemUnitPrice,
        costPrice: r.itemCostPrice,
        stockType: 0,
        isSerialized: false,
        receivingQuantity: r.receivingQuantity,
        total: r.quantityPurchased * r.itemUnitPrice,
      }));
      cart.supplierId = receiving.supplierId;
      cart.mode = "return";
      await saveReceivingCart(cart);
    }
  } else if (kitMatch) {
    const kitId = parseInt(kitMatch[1], 10);
    const kit = db.select().from(itemKits).where(eq(itemKits.itemKitId, kitId)).get();
    if (kit) {
      const kitItems = db.select().from(itemKitItems).where(eq(itemKitItems.itemKitId, kitId)).all();
      cart.cart = kitItems.map((ki, idx) => ({
        line: idx + 1,
        itemId: ki.itemId,
        itemLocation: cart.locationId,
        itemName: "",
        itemNumber: null,
        description: "",
        quantity: ki.quantity,
        discount: 0,
        discountType: 0,
        price: 0,
        costPrice: 0,
        stockType: 0,
        isSerialized: false,
        receivingQuantity: 1,
        total: 0,
      }));
      await saveReceivingCart(cart);
    }
  }
  return cart;
}

export async function addItemKit(cart: ReceivingCart, itemKitId: number, itemLocation: number, discount: number, discountType: number): Promise<ReceivingCart> {
  const db = getDbSync();
  const kit = db.select().from(itemKits).where(eq(itemKits.itemKitId, itemKitId)).get();
  if (!kit) return cart;
  const kitItems = db.select().from(itemKitItems).where(eq(itemKitItems.itemKitId, itemKitId)).all();
  for (const ki of kitItems) {
    const item = db.select().from(items).where(eq(items.itemId, ki.itemId)).get();
    if (!item) continue;
    const nextLine = cart.cart.length > 0 ? Math.max(...cart.cart.map((l) => l.line)) + 1 : 1;
    const line: ReceivingLine = {
      line: nextLine,
      itemId: item.itemId,
      itemLocation,
      itemName: item.name,
      itemNumber: item.itemNumber,
      description: item.description ?? "",
      quantity: ki.quantity,
      discount,
      discountType,
      price: item.costPrice,
      costPrice: item.costPrice,
      stockType: item.stockType,
      isSerialized: item.isSerialized,
      receivingQuantity: item.receivingQuantity,
      total: computeLineTotal(ki.quantity, item.costPrice, discount, discountType),
    };
    cart.cart.push(line);
  }
  await saveReceivingCart(cart);
  return cart;
}

export async function copyEntireReceiving(cart: ReceivingCart, receivingId: number): Promise<ReceivingCart> {
  const db = getDbSync();
  const receiving = db.select().from(receivings).where(eq(receivings.receivingId, receivingId)).get();
  if (!receiving) return cart;
  const lines = db.select().from(receivingsItems).where(eq(receivingsItems.receivingId, receivingId)).all();
  cart.cart = lines.map((r) => ({
    line: r.line,
    itemId: r.itemId,
    itemLocation: r.itemLocation ?? cart.locationId,
    itemName: "",
    itemNumber: null,
    description: r.description ?? "",
    quantity: r.quantityPurchased,
    discount: r.discount,
    discountType: r.discountType,
    price: r.itemUnitPrice,
    costPrice: r.itemCostPrice,
    stockType: 0,
    isSerialized: false,
    receivingQuantity: r.receivingQuantity,
    total: r.quantityPurchased * r.itemUnitPrice,
  }));
  cart.supplierId = receiving.supplierId;
  cart.invoiceNumber = receiving.invoiceNumber ?? "";
  cart.comment = receiving.comment ?? "";
  await saveReceivingCart(cart);
  return cart;
}

export async function clearAllReceiving(): Promise<ReceivingCart> {
  const empty = {
    cart: [],
    supplierId: null,
    employeeId: null,
    mode: "receive" as const,
    comment: "",
    invoiceNumber: "",
    reference: "",
    locationId: 1,
    printAfterSale: false,
  };
  await saveReceivingCart(empty);
  return empty;
}

export function getItemTotal(quantity: number, price: number, discount: number, discountType: number, receivingQuantity: number): number {
  return computeLineTotal(quantity * receivingQuantity, price, discount, discountType);
}

export function getReceivingTotal(cart: ReceivingCart): number {
  return cart.cart.reduce((s, l) => s + l.total, 0);
}

export function isValidReceipt(receiptInput: string): { kind: "RECV" | "KIT" | "ITEM"; id: number } | null {
  const trimmed = receiptInput.trim();
  const m1 = trimmed.match(/^RECV\s+(\d+)$/i);
  if (m1) return { kind: "RECV", id: parseInt(m1[1], 10) };
  const m2 = trimmed.match(/^KIT\s+(\d+)$/i);
  if (m2) return { kind: "KIT", id: parseInt(m2[1], 10) };
  return null;
}

void ITEM_TYPE;
void STOCK_TYPE;
void SALE_STATUS;
void getItemLocation;
void recordDelta;
void FIXED;
