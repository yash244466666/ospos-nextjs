import { and, desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { giftcards, people } from "@/db/schema";
import { toDbDecimal, type DecimalInput } from "@/lib/money";
import { nowDb } from "@/lib/datetime";
import { timezone } from "@/lib/config";

export interface GiftcardRow {
  giftcardId: number;
  recordTime: string;
  giftcardNumber: string;
  value: string;
  personId: number | null;
  deleted: boolean;
}

export interface GiftcardValue {
  giftcardNumber: string;
  value: string;
  personId: number | null;
}

function toGiftcardRow(row: typeof giftcards.$inferSelect): GiftcardRow {
  return {
    giftcardId: row.giftcardId,
    recordTime: row.recordTime,
    giftcardNumber: row.giftcardNumber ?? "",
    value: row.value,
    personId: row.personId,
    deleted: row.deleted,
  };
}

export async function getAll(limit = 25, offset = 0): Promise<GiftcardRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(giftcards)
    .where(eq(giftcards.deleted, false))
    .orderBy(desc(giftcards.giftcardId))
    .limit(limit)
    .offset(offset);
  return rows.map(toGiftcardRow);
}

export async function getInfo(giftcardId: number): Promise<GiftcardRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(giftcards)
    .where(eq(giftcards.giftcardId, giftcardId))
    .limit(1);
  return rows[0] ? toGiftcardRow(rows[0]) : null;
}

export async function getGiftcardValue(
  giftcardNumber: string,
): Promise<GiftcardValue | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(giftcards)
    .where(and(eq(giftcards.giftcardNumber, giftcardNumber), eq(giftcards.deleted, false)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    giftcardNumber: row.giftcardNumber ?? "",
    value: row.value,
    personId: row.personId,
  };
}

export async function getGiftcardCustomer(
  giftcardNumber: string,
): Promise<{ personId: number; firstName: string; lastName: string } | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(giftcards)
    .where(eq(giftcards.giftcardNumber, giftcardNumber))
    .limit(1);
  const row = rows[0];
  if (!row?.personId) return null;
  const personRows = await db
    .select()
    .from(people)
    .where(eq(people.personId, row.personId))
    .limit(1);
  const person = personRows[0];
  if (!person) return null;
  return { personId: person.personId, firstName: person.firstName, lastName: person.lastName };
}

export async function saveValue(input: {
  giftcardId?: number;
  giftcardNumber: string;
  value: DecimalInput;
  personId: number | null;
}): Promise<number> {
  return withTransaction(async (tx) => {
    const values = {
      giftcardNumber: input.giftcardNumber,
      value: toDbDecimal(input.value, 2),
      personId: input.personId,
    };
    if (input.giftcardId) {
      await tx.update(giftcards).set(values).where(eq(giftcards.giftcardId, input.giftcardId));
      return input.giftcardId;
    }
    const inserted = await tx
      .insert(giftcards)
      .values({ ...values, recordTime: nowDb(timezone()), deleted: false })
      .returning({ id: giftcards.giftcardId });
    const result = Array.isArray(inserted) ? inserted[0] : inserted;
    return result.id;
  });
}

export async function deleteGiftcard(giftcardId: number): Promise<void> {
  const db = await getDb();
  await db.update(giftcards).set({ deleted: true }).where(eq(giftcards.giftcardId, giftcardId));
}

export async function search(term: string, limit = 25): Promise<GiftcardRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(giftcards)
    .where(
      and(
        eq(giftcards.deleted, false),
        like(giftcards.giftcardNumber, `%${term}%`),
      ),
    )
    .limit(limit);
  return rows.map(toGiftcardRow);
}

export function getEmptyRow(): GiftcardRow {
  return {
    giftcardId: 0,
    recordTime: "",
    giftcardNumber: "",
    value: "0",
    personId: null,
    deleted: false,
  };
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(giftcards)
    .where(eq(giftcards.deleted, false));
  return Number(rows[0]?.c ?? 0);
}

export async function getSearchSuggestions(
  term: string,
  limit = 25,
): Promise<GiftcardRow[]> {
  return search(term, limit);
}

export async function deleteList(ids: number[]): Promise<void> {
  const db = await getDb();
  for (const id of ids) {
    await db.update(giftcards).set({ deleted: true }).where(eq(giftcards.giftcardId, id));
  }
}
