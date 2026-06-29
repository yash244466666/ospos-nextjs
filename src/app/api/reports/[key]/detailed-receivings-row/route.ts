import { auth } from "@/lib/auth/options";
import { getDbSync } from "@/lib/db";
import { receivings, receivingsItems, suppliers, people } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json(null, { status: 401 });
  const { key } = await ctx.params;
  const recId = parseInt(key, 10);
  if (Number.isNaN(recId)) return Response.json(null, { status: 400 });
  const db = getDbSync();
  const rec = db.select().from(receivings).where(eq(receivings.receivingId, recId)).get();
  if (!rec) return Response.json(null);
  const items = db.select().from(receivingsItems).where(eq(receivingsItems.receivingId, recId)).all();
  const supplier = rec.supplierId
    ? db.select({ person: people }).from(suppliers).innerJoin(people, eq(people.personId, suppliers.personId)).where(eq(suppliers.personId, rec.supplierId)).get()
    : null;
  return Response.json({ receiving: rec, items, supplier: supplier?.person ?? null });
}
