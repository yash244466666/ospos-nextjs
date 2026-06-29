import { auth } from "@/lib/auth/options";
import { getDbSync } from "@/lib/db";
import { sales, salesItems, salesPayments, salesTaxes, people } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json(null, { status: 401 });
  const { key } = await ctx.params;
  const saleId = parseInt(key, 10);
  if (Number.isNaN(saleId)) return Response.json(null, { status: 400 });
  const db = getDbSync();
  const sale = db.select().from(sales).where(eq(sales.saleId, saleId)).get();
  if (!sale) return Response.json(null);
  const items = db.select().from(salesItems).where(eq(salesItems.saleId, saleId)).all();
  const payments = db.select().from(salesPayments).where(eq(salesPayments.saleId, saleId)).all();
  const taxes = db.select().from(salesTaxes).where(eq(salesTaxes.saleId, saleId)).all();
  const customer = sale.customerId ? db.select().from(people).where(eq(people.personId, sale.customerId)).get() : null;
  return Response.json({ sale, items, payments, taxes, customer });
}
