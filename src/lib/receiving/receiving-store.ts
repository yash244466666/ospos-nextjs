import { getSessionData, updateSessionData, type SessionData } from "@/lib/session";
import { getDb } from "@/lib/db";
import { stockLocations } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getDefaultLocationId } from "@/lib/stock_locations/repository";

export interface ReceivingLine {
  line: number;
  itemId: number;
  itemLocation: number;
  itemNumber: string | null;
  stockName: string;
  name: string;
  description: string;
  serialnumber: string;
  attributeValues: string;
  attributeDtvalues: string;
  allowAltDescription: boolean;
  isSerialized: boolean;
  quantity: string;
  discount: string;
  discountType: number;
  inStock: string;
  price: string;
  receivingQuantity: string;
  receivingQuantityChoices: Record<string, string>;
  total: string;
  stockType: number;
}

export interface ReceivingCart {
  cart: ReceivingLine[];
  supplierId: number;
  employeeId: number;
  mode: "receive" | "return" | "requisition";
  comment: string;
  reference: string;
  stockSource: number | null;
  stockDestination: number | null;
  printAfterSale: boolean;
}

export function emptyReceivingCart(): ReceivingCart {
  return {
    cart: [],
    supplierId: -1,
    employeeId: -1,
    mode: "receive",
    comment: "",
    reference: "",
    stockSource: null,
    stockDestination: null,
    printAfterSale: false,
  };
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function receivingFromSession(data: SessionData): ReceivingCart {
  return {
    cart: Array.isArray(data.recv_cart) ? (data.recv_cart as ReceivingLine[]) : [],
    supplierId: asNumber(data.recv_supplier, -1),
    employeeId: asNumber(data.recv_employee, -1),
    mode: (typeof data.recv_mode === "string" ? data.recv_mode : "receive") as ReceivingCart["mode"],
    comment: typeof data.recv_comment === "string" ? data.recv_comment : "",
    reference: typeof data.recv_reference === "string" ? data.recv_reference : "",
    stockSource:
      typeof data.recv_stock_source === "number" ? data.recv_stock_source : null,
    stockDestination:
      typeof data.recv_stock_destination === "number"
        ? data.recv_stock_destination
        : typeof data.recv_stock_destination === "string"
          ? Number(data.recv_stock_destination)
          : null,
    printAfterSale:
      data.recv_print_after_sale === true ||
      data.recv_print_after_sale === "true" ||
      data.recv_print_after_sale === "1" ||
      data.recv_print_after_sale === 1,
  };
}

export function receivingToSession(cart: ReceivingCart): SessionData {
  return {
    recv_cart: cart.cart,
    recv_supplier: cart.supplierId,
    recv_employee: cart.employeeId,
    recv_mode: cart.mode,
    recv_comment: cart.comment,
    recv_reference: cart.reference,
    recv_stock_source: cart.stockSource ?? undefined,
    recv_stock_destination: cart.stockDestination ?? undefined,
    recv_print_after_sale: cart.printAfterSale,
  };
}

async function defaultReceivingsLocation(personId?: number): Promise<number | null> {
  if (personId !== undefined) {
    const allowed = await getDefaultLocationId("receivings", personId);
    if (allowed !== null) return allowed;
  }
  const db = await getDb();
  const preferred = await db
    .select({ locationId: stockLocations.locationId })
    .from(stockLocations)
    .where(and(eq(stockLocations.deleted, false), eq(stockLocations.isDefault, true)))
    .limit(1);
  if (preferred[0]) return preferred[0].locationId;
  const first = await db
    .select({ locationId: stockLocations.locationId })
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false))
    .orderBy(asc(stockLocations.sortOrder))
    .limit(1);
  return first[0]?.locationId ?? null;
}

export async function getReceivingCart(): Promise<ReceivingCart> {
  const data = await getSessionData();
  const cart = receivingFromSession(data);
  const personId = typeof data.person_id === "number" ? data.person_id : undefined;
  if (cart.stockSource === null) {
    cart.stockSource = await defaultReceivingsLocation(personId);
  }
  if (cart.stockDestination === null) {
    cart.stockDestination = await defaultReceivingsLocation(personId);
  }
  return cart;
}

export async function saveReceivingCart(cart: ReceivingCart): Promise<void> {
  await updateSessionData((data) => ({ ...data, ...receivingToSession(cart) }));
}

export async function clearReceivingCart(): Promise<void> {
  await saveReceivingCart(emptyReceivingCart());
}
