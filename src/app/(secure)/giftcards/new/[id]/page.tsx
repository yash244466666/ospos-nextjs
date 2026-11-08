import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb, IS_SQLITE } from "@/lib/db";
import { getConfig, loadConfig } from "@/lib/config";
import { sql } from "drizzle-orm";
import { giftcards, customers, people } from "@/db/schema";
import GiftcardForm from "@/components/giftcards/giftcard-form";

export default async function GiftcardEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("giftcards");
  const { id } = await params;
  await loadConfig();
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
  let suggestedNumber = "";
  if (!giftcard && getConfig("giftcard_number", "series") !== "random") {
    const rows = await db
      .select({
        maxNumber: sql<string>`MAX(CAST(${giftcards.giftcardNumber} AS ${sql.raw(IS_SQLITE ? "INTEGER" : "UNSIGNED")}))`,
      })
      .from(giftcards)
      .where(
        IS_SQLITE
          ? sql`${giftcards.giftcardNumber} GLOB '[0-9]*'`
          : sql`${giftcards.giftcardNumber} REGEXP '^[0-9]+$'`,
      );
    suggestedNumber = String(Number(rows[0]?.maxNumber ?? 0) + 1);
  }
  return (
    <GiftcardForm
      initial={giftcard}
      customers={customers_list}
      suggestedNumber={suggestedNumber}
    />
  );
}