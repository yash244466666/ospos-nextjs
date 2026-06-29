import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { cartSessions } from "@/db/schema";
import { auth } from "@/lib/auth/options";

export interface ReceivingLine {
  line: number;
  itemId: number;
  itemLocation: number;
  itemName: string;
  itemNumber: string | null;
  description: string;
  quantity: number;
  discount: number;
  discountType: number;
  price: number;
  costPrice: number;
  stockType: number;
  isSerialized: boolean;
  total: number;
}

export interface ReceivingCart {
  cart: ReceivingLine[];
  supplierId: number | null;
  employeeId: number | null;
  mode: "receive" | "return";
  comment: string;
  invoiceNumber: string;
  reference: string;
  locationId: number;
  printAfterSale: boolean;
}

export function emptyReceivingCart(): ReceivingCart {
  return {
    cart: [],
    supplierId: null,
    employeeId: null,
    mode: "receive",
    comment: "",
    invoiceNumber: "",
    reference: "",
    locationId: 1,
    printAfterSale: false,
  };
}

export async function getReceivingCart(): Promise<ReceivingCart> {
  const session = await auth();
  if (!session?.user?.personId) throw new Error("not authenticated");
  const personId = session.user.personId;
  const db = getDbSync();
  const sessionId = `recv:${personId}`;
  const row = db.select().from(cartSessions).where(eq(cartSessions.sessionId, sessionId)).get();
  if (!row) {
    const empty = emptyReceivingCart();
    db.insert(cartSessions).values({ sessionId, personId, data: JSON.stringify(empty) }).run();
    return empty;
  }
  return JSON.parse(row.data) as ReceivingCart;
}

export async function saveReceivingCart(cart: ReceivingCart): Promise<void> {
  const session = await auth();
  if (!session?.user?.personId) throw new Error("not authenticated");
  const personId = session.user.personId;
  const db = getDbSync();
  const sessionId = `recv:${personId}`;
  db.insert(cartSessions)
    .values({ sessionId, personId, data: JSON.stringify(cart), updatedAt: Date.now() })
    .onConflictDoUpdate({ target: cartSessions.sessionId, set: { data: JSON.stringify(cart), updatedAt: Date.now() } })
    .run();
}

export async function clearReceivingCart(): Promise<void> {
  await saveReceivingCart(emptyReceivingCart());
}