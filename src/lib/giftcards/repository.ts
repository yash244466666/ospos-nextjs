import { eq, and, like, desc, asc, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { giftcards, people } from "@/db/schema";

export interface GiftcardRow {
  giftcardId: number;
  giftcardNumber: string;
  value: number;
  personId: number | null;
  deleted: boolean;
}

export interface GiftcardValue { giftcardNumber: string; value: number; personId: number | null; }

export function getAll(limit = 25, offset = 0): GiftcardRow[] {
  return getDbSync().select().from(giftcards)
    .where(eq(giftcards.deleted, false))
    .orderBy(desc(giftcards.giftcardId))
    .limit(limit).offset(offset).all() as GiftcardRow[];
}

export function getInfo(giftcardId: number): GiftcardRow | null {
  return (getDbSync().select().from(giftcards)
    .where(eq(giftcards.giftcardId, giftcardId)).get() as GiftcardRow) ?? null;
}

export function getGiftcardValue(giftcardNumber: string): GiftcardValue | null {
  const row = getDbSync().select().from(giftcards)
    .where(and(eq(giftcards.giftcardNumber, giftcardNumber), eq(giftcards.deleted, false))).get() as GiftcardRow | undefined;
  if (!row) return null;
  return { giftcardNumber: row.giftcardNumber, value: row.value, personId: row.personId };
}

export function getGiftcardCustomer(giftcardNumber: string): { personId: number; firstName: string; lastName: string } | null {
  const db = getDbSync();
  const row = db.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).get() as GiftcardRow | undefined;
  if (!row?.personId) return null;
  const person = db.select().from(people).where(eq(people.personId, row.personId)).get();
  if (!person) return null;
  return { personId: person.personId, firstName: person.firstName, lastName: person.lastName ?? "" };
}

export function saveValue(input: { giftcardId?: number; giftcardNumber: string; value: number; personId: number | null }): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.giftcardId) {
      tx.update(giftcards).set({
        giftcardNumber: input.giftcardNumber, value: input.value, personId: input.personId,
      }).where(eq(giftcards.giftcardId, input.giftcardId)).run();
      return input.giftcardId;
    }
    return tx.insert(giftcards).values({
      giftcardNumber: input.giftcardNumber, value: input.value, personId: input.personId, deleted: false,
    }).returning({ id: giftcards.giftcardId }).get().id;
  });
}

export function deleteGiftcard(giftcardId: number): void {
  getDbSync().update(giftcards).set({ deleted: true })
    .where(eq(giftcards.giftcardId, giftcardId)).run();
}

export function search(term: string, limit = 25): GiftcardRow[] {
  return getDbSync().select().from(giftcards)
    .where(and(eq(giftcards.deleted, false), like(giftcards.giftcardNumber, `%${term}%`)))
    .limit(limit).all() as GiftcardRow[];
}

export function getEmptyRow(): GiftcardRow {
  return { giftcardId: 0, giftcardNumber: "", value: 0, personId: null, deleted: false };
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` })
    .from(giftcards).where(eq(giftcards.deleted, false)).get();
  return r?.c ?? 0;
}

export function getSearchSuggestions(term: string, limit = 25): GiftcardRow[] {
  return search(term, limit);
}

export function deleteList(ids: number[]): void {
  const db = getDbSync();
  for (const id of ids) {
    db.update(giftcards).set({ deleted: true }).where(eq(giftcards.giftcardId, id)).run();
  }
}

void asc;
