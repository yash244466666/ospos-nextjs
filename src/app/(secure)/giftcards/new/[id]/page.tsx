import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { giftcards, customers, people } from "@/db/schema";
import GiftcardForm from "@/components/giftcards/giftcard-form";

export default async function GiftcardEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("giftcards");
  const { id } = await params;
  const giftcardId = parseInt(id, 10);
  const db = await getDb();
  const giftcardRows = giftcardId > 0
    ? await db.select().from(giftcards).where(eq(giftcards.giftcardId, giftcardId)).limit(1)
    : [];
  const giftcard = giftcardRows[0] ?? null;
  const customerRows = await db
    .select({ personId: customers.personId, firstName: people.firstName, lastName: people.lastName, company: customers.companyName })
    .from(customers).innerJoin(people, eq(people.personId, customers.personId))
    .where(eq(customers.deleted, false));
  const customers_list = customerRows.map((c) => ({
    personId: c.personId,
    label: c.company || `${c.firstName} ${c.lastName ?? ""}`.trim(),
  }));
  return <GiftcardForm initial={giftcard} customers={customers_list} />;
}