import { requireGrantApi } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { receivings, receivingsItems, suppliers, people } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const permission = await requireGrantApi("reports_receivings");
  if (!permission.ok) return Response.json(permission.body, { status: permission.status });
  const { key } = await ctx.params;
  const recId = parseInt(key, 10);
  if (Number.isNaN(recId)) return Response.json(null, { status: 400 });
  const db = await getDb();
  const receivingRows = await db
    .select()
    .from(receivings)
    .where(eq(receivings.receivingId, recId))
    .limit(1);
  const receiving = receivingRows[0];
  if (!receiving) return Response.json(null);
  const items = await db
    .select()
    .from(receivingsItems)
    .where(eq(receivingsItems.receivingId, recId));
  const supplier = receiving.supplierId
    ? (
        await db
          .select({ person: people })
          .from(suppliers)
          .innerJoin(people, eq(people.personId, suppliers.personId))
          .where(eq(suppliers.personId, receiving.supplierId))
          .limit(1)
      )[0]?.person ?? null
    : null;
  return Response.json({ receiving, items, supplier });
}
