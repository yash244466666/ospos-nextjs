import { and, asc, eq, like } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { dinnerTables } from "@/db/schema";

export interface DinnerTableRow {
  dinnerTableId: number;
  name: string;
  status: number;
  deleted: boolean;
}

export async function getAll(): Promise<DinnerTableRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(dinnerTables)
    .where(eq(dinnerTables.deleted, false))
    .orderBy(asc(dinnerTables.name));
}

export async function getInfo(dinnerTableId: number): Promise<DinnerTableRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(dinnerTables)
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getName(dinnerTableId: number): Promise<string | null> {
  return (await getInfo(dinnerTableId))?.name ?? null;
}

export function getEmptyRow(): DinnerTableRow {
  return { dinnerTableId: 0, name: "", status: 0, deleted: false };
}

/** Port of `Dinner_table::is_occupied()`: the `status` flag is authoritative. */
export async function isOccupied(dinnerTableId: number): Promise<boolean> {
  if (!dinnerTableId) return false;
  const row = await getInfo(dinnerTableId);
  return row?.status === 1;
}

export async function saveValue(input: DinnerTableRow): Promise<number> {
  return withTransaction(async (tx) => {
    if (input.dinnerTableId) {
      await tx
        .update(dinnerTables)
        .set({ name: input.name, status: input.status })
        .where(eq(dinnerTables.dinnerTableId, input.dinnerTableId));
      return input.dinnerTableId;
    }
    const inserted = await insertReturning(tx, dinnerTables, { name: input.name, status: input.status, deleted: false }, dinnerTables.dinnerTableId);
    const result = Array.isArray(inserted) ? inserted[0] : inserted;
    return result.id;
  });
}

/** Delivery/takeaway (ids 1 and 2) are virtual tables and never occupied. */
export async function occupy(dinnerTableId: number): Promise<void> {
  if (dinnerTableId <= 2) return;
  const db = await getDb();
  await db
    .update(dinnerTables)
    .set({ status: 1 })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId));
}

export async function release(dinnerTableId: number): Promise<void> {
  if (dinnerTableId <= 2) return;
  const db = await getDb();
  await db
    .update(dinnerTables)
    .set({ status: 0 })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId));
}

export async function deleteTable(dinnerTableId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(dinnerTables)
    .set({ deleted: true })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId));
}

/** Port of `Dinner_table::swap_tables()`: release one table, occupy another. */
export async function swapTables(fromId: number, toId: number): Promise<void> {
  await release(fromId);
  await occupy(toId);
}

export async function search(term: string, limit = 25): Promise<DinnerTableRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(dinnerTables)
    .where(and(eq(dinnerTables.deleted, false), like(dinnerTables.name, `%${term}%`)))
    .orderBy(asc(dinnerTables.name))
    .limit(limit);
}
