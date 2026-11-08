import {
  bcAdd,
  bcDiv,
  bcMul,
  bcSub,
  dec,
  toDbDecimal,
  type DecimalInput,
} from "@/lib/money";
import {
  DISCOUNT_TYPE,
  ITEM_TYPE,
  NEW_ENTRY,
  PERCENT,
  STOCK_TYPE,
} from "@/lib/constants";
import { getConfigBool, loadConfig, quantityDecimals } from "@/lib/config";
import {
  getAttributesForItem,
  getInfoByIdOrNumber,
  getItemKitItems,
  getItemQuantities,
  getStockLocationName,
} from "@/lib/items/repository";
import { getDb } from "@/lib/db";
import { receivings, receivingsItems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import type { ReceivingCart, ReceivingLine } from "./receiving-store";

export type { ReceivingCart, ReceivingLine };

export const NAME_SEPARATOR = " | ";

export function getCart(cart: ReceivingCart): ReceivingLine[] {
  return [...cart.cart].sort((a, b) => a.line - b.line);
}

export function getSupplier(cart: ReceivingCart): number {
  return cart.supplierId;
}
export function setSupplier(cart: ReceivingCart, supplierId: number): ReceivingCart {
  return { ...cart, supplierId };
}
export function removeSupplier(cart: ReceivingCart): ReceivingCart {
  return { ...cart, supplierId: -1 };
}

export function getMode(cart: ReceivingCart): string {
  return cart.mode;
}
export function setMode(cart: ReceivingCart, mode: string): ReceivingCart {
  return { ...cart, mode: mode as ReceivingCart["mode"] };
}
export function clearMode(cart: ReceivingCart): ReceivingCart {
  return { ...cart, mode: "receive" };
}

export function getStockSource(cart: ReceivingCart): number | null {
  return cart.stockSource;
}
export function setStockSource(cart: ReceivingCart, locationId: number): ReceivingCart {
  return { ...cart, stockSource: locationId };
}
export function clearStockSource(cart: ReceivingCart): ReceivingCart {
  return { ...cart, stockSource: null };
}
export function getStockDestination(cart: ReceivingCart): number | null {
  return cart.stockDestination;
}
export function setStockDestination(
  cart: ReceivingCart,
  locationId: number | null,
): ReceivingCart {
  return { ...cart, stockDestination: locationId };
}
export function clearStockDestination(cart: ReceivingCart): ReceivingCart {
  return { ...cart, stockDestination: null };
}

export function getComment(cart: ReceivingCart): string {
  return cart.comment || "";
}
export function setComment(cart: ReceivingCart, comment: string): ReceivingCart {
  return { ...cart, comment };
}
export function clearComment(cart: ReceivingCart): ReceivingCart {
  return { ...cart, comment: "" };
}

export function getReference(cart: ReceivingCart): string {
  return cart.reference || "";
}
export function setReference(cart: ReceivingCart, reference: string): ReceivingCart {
  return { ...cart, reference };
}
export function clearReference(cart: ReceivingCart): ReceivingCart {
  return { ...cart, reference: "" };
}

export function isPrintAfterSale(cart: ReceivingCart): boolean {
  return cart.printAfterSale;
}
export function setPrintAfterSale(cart: ReceivingCart, value: boolean): ReceivingCart {
  return { ...cart, printAfterSale: value };
}

/** `Receiving_lib::get_item_total` — extended quantity × price, then discount. */
export function getItemTotal(
  quantity: DecimalInput,
  price: DecimalInput,
  discount: DecimalInput,
  discountType: number | null,
  receivingQuantity: DecimalInput,
): string {
  const extendedQuantity = bcMul(quantity, receivingQuantity);
  const total = bcMul(extendedQuantity, price);
  const discountAmount =
    discountType === PERCENT
      ? bcMul(total, bcDiv(discount, "100"))
      : discount;
  return toDbDecimal(bcSub(total, discountAmount), 4);
}

export function getTotal(cart: ReceivingCart): string {
  let total = "0";
  for (const item of getCart(cart)) {
    total = bcAdd(
      total,
      getItemTotal(
        item.quantity,
        item.price,
        item.discount,
        item.discountType,
        item.receivingQuantity,
      ),
    ).toFixed();
  }
  return total;
}

export interface AddReceivingItemInput {
  itemIdOrNumber: string;
  quantity?: DecimalInput;
  itemLocation?: number | null;
  discount?: DecimalInput;
  discountType?: number;
  price?: DecimalInput | null;
  description?: string | null;
  serialnumber?: string | null;
  receivingQuantity?: DecimalInput | null;
  receivingId?: number | null;
  includeDeleted?: boolean;
  line?: number | null;
}

/** `Receiving_lib::add_item`. */
export async function addItem(
  cart: ReceivingCart,
  input: AddReceivingItemInput,
): Promise<{ cart: ReceivingCart; success: boolean }> {
  await loadConfig();
  const item = await getInfoByIdOrNumber(input.itemIdOrNumber, input.includeDeleted ?? false);
  if (!item) return { cart, success: false };

  const itemLocation = input.itemLocation ?? cart.stockSource ?? 1;
  const items = cart.cart.map((line) => ({ ...line }));
  let maxKey = 0;
  let alreadyInSale = false;
  let updateKey = 0;
  for (const line of items) {
    if (maxKey <= line.line) maxKey = line.line;
    if (line.itemId === item.itemId && line.itemLocation === itemLocation) {
      alreadyInSale = true;
      updateKey = line.line;
    }
  }
  const insertKey = input.line ?? maxKey + 1;
  const price = toDbDecimal(input.price ?? item.costPrice, 2);
  const quantity = toDbDecimal(input.quantity ?? "1", quantityDecimals());
  const discount = toDbDecimal(input.discount ?? "0", 2);
  const discountType = input.discountType ?? DISCOUNT_TYPE.PERCENT;

  let name = item.name;
  if (getConfigBool("multi_pack_enabled", false)) {
    name += `${NAME_SEPARATOR}${item.packName ?? ""}`;
  }

  const receivingQuantity =
    input.receivingQuantity !== null && input.receivingQuantity !== undefined
      ? toDbDecimal(input.receivingQuantity, 3)
      : toDbDecimal(item.receivingQuantity, 3);
  const choices =
    dec(item.receivingQuantity).eq(0) || dec(item.receivingQuantity).eq(1)
      ? { "1": "x1" }
      : {
          [toDbDecimal(item.receivingQuantity, quantityDecimals())]:
            `x${toDbDecimal(item.receivingQuantity, quantityDecimals())}`,
          "1": "x1",
        };

  const attributes = await getAttributesForItem(item.itemId, input.receivingId ?? null, 4);
  const quantities = await getItemQuantities(item.itemId);
  const stockName = await getStockLocationName(itemLocation);

  if (alreadyInSale) {
    const line = items.find((entry) => entry.line === updateKey);
    if (line) {
      line.quantity = toDbDecimal(bcAdd(line.quantity, quantity), quantityDecimals());
      line.total = getItemTotal(
        line.quantity,
        price,
        discount,
        discountType,
        line.receivingQuantity,
      );
    }
  } else {
    items.push({
      itemId: item.itemId,
      itemLocation,
      itemNumber: item.itemNumber,
      stockName,
      line: insertKey,
      name,
      description: input.description ?? item.description,
      serialnumber: input.serialnumber ?? "",
      attributeValues: attributes.attributeValues,
      attributeDtvalues: attributes.attributeDtvalues,
      allowAltDescription: item.allowAltDescription,
      isSerialized: item.isSerialized,
      quantity,
      discount,
      discountType,
      inStock: toDbDecimal(quantities[itemLocation] ?? "0", 3),
      price,
      receivingQuantity,
      receivingQuantityChoices: choices,
      total: getItemTotal(quantity, price, discount, discountType, receivingQuantity),
      stockType: item.stockType,
    });
  }
  items.sort((a, b) => a.line - b.line);
  return { cart: { ...cart, cart: items }, success: true };
}

export function editItem(
  cart: ReceivingCart,
  line: number,
  values: {
    description: string;
    serialnumber: string;
    quantity: DecimalInput;
    discount: DecimalInput;
    discountType: number | null;
    price: DecimalInput;
    receivingQuantity: DecimalInput;
  },
): ReceivingCart {
  const items = cart.cart.map((item) => ({ ...item }));
  const target = items.find((item) => item.line === line);
  if (!target) return cart;
  target.description = values.description;
  target.serialnumber = values.serialnumber;
  target.quantity = toDbDecimal(values.quantity, quantityDecimals());
  target.receivingQuantity = toDbDecimal(values.receivingQuantity, 3);
  target.discount = toDbDecimal(values.discount, 2);
  if (values.discountType !== null) target.discountType = values.discountType;
  target.price = toDbDecimal(values.price, 2);
  target.total = getItemTotal(
    target.quantity,
    target.price,
    target.discount,
    target.discountType,
    target.receivingQuantity,
  );
  return { ...cart, cart: items };
}

export function deleteItem(cart: ReceivingCart, line: number): ReceivingCart {
  return { ...cart, cart: cart.cart.filter((item) => item.line !== line) };
}

export function clearAll(cart: ReceivingCart): ReceivingCart {
  return {
    ...cart,
    mode: "receive",
    cart: [],
    supplierId: -1,
    comment: "",
    reference: "",
  };
}

export async function returnEntireReceiving(
  cart: ReceivingCart,
  receiptReceivingId: string,
): Promise<ReceivingCart> {
  const pieces = receiptReceivingId.split(" ");
  let receivingId: number;
  if (/^(RECV|KIT)$/.test(pieces[0])) {
    receivingId = Number(pieces[1]);
  } else {
    const db = await getDb();
    const rows = await db
      .select({ receivingId: receivings.receivingId })
      .from(receivings)
      .where(eq(receivings.reference, receiptReceivingId))
      .limit(1);
    receivingId = rows[0]?.receivingId ?? -1;
  }

  let current: ReceivingCart = {
    ...cart,
    cart: [],
    supplierId: -1,
    comment: "",
  };
  const db = await getDb();
  const lines = await db
    .select()
    .from(receivingsItems)
    .where(eq(receivingsItems.receivingId, receivingId))
    .orderBy(asc(receivingsItems.line));
  for (const row of lines) {
    const result = await addItem(current, {
      itemIdOrNumber: String(row.itemId),
      quantity: toDbDecimal(bcMul(row.quantityPurchased, "-1"), quantityDecimals()),
      itemLocation: row.itemLocation,
      discount: row.discount,
      discountType: row.discountType,
      price: row.itemUnitPrice,
      description: row.description,
      serialnumber: row.serialnumber,
      receivingQuantity: row.receivingQuantity,
      receivingId,
      includeDeleted: true,
    });
    current = result.cart;
  }
  const header = await db
    .select({ supplierId: receivings.supplierId })
    .from(receivings)
    .where(eq(receivings.receivingId, receivingId))
    .limit(1);
  if (header[0]?.supplierId) current = setSupplier(current, header[0].supplierId);
  return current;
}

export async function copyEntireReceiving(
  cart: ReceivingCart,
  receivingId: number,
): Promise<ReceivingCart> {
  let current: ReceivingCart = { ...cart, cart: [], supplierId: -1 };
  const db = await getDb();
  const lines = await db
    .select()
    .from(receivingsItems)
    .where(eq(receivingsItems.receivingId, receivingId))
    .orderBy(asc(receivingsItems.line));
  for (const row of lines) {
    const result = await addItem(current, {
      itemIdOrNumber: String(row.itemId),
      quantity: row.quantityPurchased,
      itemLocation: row.itemLocation,
      discount: row.discount,
      discountType: row.discountType,
      price: row.itemUnitPrice,
      description: row.description,
      serialnumber: row.serialnumber,
      receivingQuantity: row.receivingQuantity,
      receivingId,
      includeDeleted: true,
    });
    current = result.cart;
  }
  const header = await db
    .select({ supplierId: receivings.supplierId })
    .from(receivings)
    .where(eq(receivings.receivingId, receivingId))
    .limit(1);
  if (header[0]?.supplierId) current = setSupplier(current, header[0].supplierId);
  return current;
}

export async function addItemKit(
  cart: ReceivingCart,
  externalItemKitId: string,
  itemLocation: number,
  discount: DecimalInput,
  discountType: number,
): Promise<ReceivingCart> {
  const pieces = externalItemKitId.split(" ");
  const itemKitId = pieces.length > 1 ? pieces[1] : externalItemKitId;
  const kitItems = await getItemKitItems(Number(itemKitId));
  let current = cart;
  for (const kitItem of kitItems) {
    const result = await addItem(current, {
      itemIdOrNumber: String(kitItem.itemId),
      quantity: kitItem.quantity,
      itemLocation,
      discount,
      discountType,
    });
    current = result.cart;
  }
  return current;
}

export function isStockType(type: number): boolean {
  return type === STOCK_TYPE.HAS_STOCK;
}

void ITEM_TYPE;
void NEW_ENTRY;
