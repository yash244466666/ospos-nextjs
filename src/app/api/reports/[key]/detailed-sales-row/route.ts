import { requireGrantApi } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { sales, salesItems, salesPayments, salesTaxes, people } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const permission = await requireGrantApi("reports_sales");
  if (!permission.ok) return Response.json(permission.body, { status: permission.status });
  const { key } = await ctx.params;
  const saleId = parseInt(key, 10);
  if (Number.isNaN(saleId)) return Response.json(null, { status: 400 });
  const db = await getDb();
  const saleRows = await db
    .select()
    .from(sales)
    .where(eq(sales.saleId, saleId))
    .limit(1);
  const sale = saleRows[0];
  if (!sale) return Response.json(null);
  const items = await db.select().from(salesItems).where(eq(salesItems.saleId, saleId));
  const payments = await db
    .select()
    .from(salesPayments)
    .where(eq(salesPayments.saleId, saleId));
  const taxes = await db.select().from(salesTaxes).where(eq(salesTaxes.saleId, saleId));
  const customer = sale.customerId
    ? (
        await db
          .select()
          .from(people)
          .where(eq(people.personId, sale.customerId))
          .limit(1)
      )[0] ?? null
    : null;
  return Response.json({ sale, items, payments, taxes, customer });
}
