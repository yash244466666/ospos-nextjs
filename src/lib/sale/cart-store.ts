import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { cartSessions } from "@/db/schema";
import { auth } from "@/lib/auth/options";
import type { SaleCart, SalePayment } from "./types";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

function getSessionKey(): string {
  const cookie = (typeof document !== "undefined" && document.cookie) || "";
  const m = cookie.match(/cart_session=([^;]+)/);
  return m?.[1] ?? "";
}

export async function getCart(): Promise<SaleCart> {
  const session = await auth();
  if (!session?.user?.personId) throw new Error("not authenticated");
  const personId = session.user.personId;
  const db = getDbSync();
  const sessionId = `cart:${personId}`;
  const row = db.select().from(cartSessions).where(eq(cartSessions.sessionId, sessionId)).get();
  if (!row) {
    const empty: SaleCart = emptyCart();
    db.insert(cartSessions).values({
      sessionId,
      personId,
      data: JSON.stringify(empty),
    }).run();
    return empty;
  }
  return JSON.parse(row.data) as SaleCart;
}

export async function saveCart(cart: SaleCart): Promise<void> {
  const session = await auth();
  if (!session?.user?.personId) throw new Error("not authenticated");
  const personId = session.user.personId;
  const db = getDbSync();
  const sessionId = `cart:${personId}`;
  db.insert(cartSessions)
    .values({ sessionId, personId, data: JSON.stringify(cart), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: cartSessions.sessionId,
      set: { data: JSON.stringify(cart), updatedAt: Date.now() },
    })
    .run();
}

export function emptyCart(): SaleCart {
  return {
    cart: [],
    payments: [],
    customerId: null,
    employeeId: null,
    mode: "sale",
    saleType: 0,
    saleId: -1,
    suspendedId: null,
    comment: "",
    invoiceNumber: "",
    quoteNumber: "",
    workOrderNumber: "",
    dinnerTableId: null,
    locationId: 1,
    printAfterSale: false,
    emailReceipt: false,
    priceWorkOrders: false,
    giftcardRemainder: 0,
    rewardsRemainder: 0,
    cashRounding: false,
    cashMode: false,
    allowTempItems: false,
  };
}

export async function clearCart(): Promise<void> {
  await saveCart(emptyCart());
}

export interface CartLine {
  line: number;
  itemId: number;
  itemLocation: number;
  itemName: string;
  itemNumber: string | null;
  description: string;
  serialnumber: string;
  quantity: number;
  discount: number;
  discountType: number;
  price: number;
  costPrice: number;
  stockType: number;
  taxCategoryId: number | null;
  taxedFlag: string;
  printOption: number;
  isSerialized: boolean;
  total: number;
  discountedTotal: number;
}

export type { SalePayment };
void getSessionKey;
void SESSION_TTL_MS;