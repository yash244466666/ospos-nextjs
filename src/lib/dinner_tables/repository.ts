import { eq, and, sql, like, desc, asc, isNull } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { dinnerTables, sales } from "@/db/schema";

export interface DinnerTableRow {
  dinnerTableId: number;
  name: string;
  status: number;
  deleted: boolean;
}

export function getAll(): DinnerTableRow[] {
  return getDbSync().select().from(dinnerTables)
    .where(eq(dinnerTables.deleted, false))
    .orderBy(asc(dinnerTables.name))
    .all() as DinnerTableRow[];
}

export function getInfo(dinnerTableId: number): DinnerTableRow | null {
  return (getDbSync().select().from(dinnerTables)
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId)).get() as DinnerTableRow) ?? null;
}

export function getName(dinnerTableId: number): string | null {
  const row = getInfo(dinnerTableId);
  return row?.name ?? null;
}

export function getEmptyRow(): DinnerTableRow {
  return { dinnerTableId: 0, name: "", status: 0, deleted: false };
}

export function isOccupied(dinnerTableId: number): boolean {
  const row = getInfo(dinnerTableId);
  if (!row) return false;
  const db = getDbSync();
  const sale = db.select({ id: sales.saleId }).from(sales)
    .where(and(eq(sales.dinnerTableId, dinnerTableId), eq(sales.saleStatus, 1)))
    .get();
  return !!sale;
}

export function saveValue(input: DinnerTableRow): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.dinnerTableId) {
      tx.update(dinnerTables).set({ name: input.name, status: input.status })
        .where(eq(dinnerTables.dinnerTableId, input.dinnerTableId)).run();
      return input.dinnerTableId;
    }
    return tx.insert(dinnerTables).values({ name: input.name, status: input.status, deleted: false })
      .returning({ id: dinnerTables.dinnerTableId }).get().id;
  });
}

export function occupy(dinnerTableId: number): void {
  getDbSync().update(dinnerTables).set({ status: 1 })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId)).run();
}

export function release(dinnerTableId: number): void {
  getDbSync().update(dinnerTables).set({ status: 0 })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId)).run();
}

export function deleteTable(dinnerTableId: number): void {
  getDbSync().update(dinnerTables).set({ deleted: true })
    .where(eq(dinnerTables.dinnerTableId, dinnerTableId)).run();
}

export function swapTables(fromId: number, toId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const from = tx.select().from(dinnerTables).where(eq(dinnerTables.dinnerTableId, fromId)).get();
    if (!from) return;
    tx.update(dinnerTables).set({ name: from.name, status: 0 })
      .where(eq(dinnerTables.dinnerTableId, toId)).run();
  });
}

export function search(term: string, limit = 25): DinnerTableRow[] {
  return getDbSync().select().from(dinnerTables)
    .where(and(eq(dinnerTables.deleted, false), like(dinnerTables.name, `%${term}%`)))
    .orderBy(asc(dinnerTables.name)).limit(limit).all() as DinnerTableRow[];
}

void sql;
void isNull;
void desc;
