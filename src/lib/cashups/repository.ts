import { and, eq, sql, desc, asc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { cashups, employees, people } from "@/db/schema";

export interface CashupRow {
  cashupId: number;
  openDate: number | null;
  closeDate: number | null;
  openAmountCash: number;
  transferAmountCash: number;
  closedAmountCash: number;
  note: string | null;
  employeeId: number | null;
  deleted: boolean;
}

export function listCashups(): CashupRow[] {
  const db = getDbSync();
  return db.select().from(cashups).where(eq(cashups.deleted, false)).all();
}

export function getCashup(cashupId: number): CashupRow | null {
  if (cashupId <= 0) return null;
  const db = getDbSync();
  return db.select().from(cashups).where(eq(cashups.cashupId, cashupId)).get() ?? null;
}

export function saveCashup(data: Omit<CashupRow, "cashupId" | "deleted"> & { cashupId?: number; deleted?: boolean }): number {
  const db = getDbSync();
  const { cashupId, deleted, ...rest } = data;
  if (cashupId && cashupId > 0) {
    db.update(cashups).set({ ...rest, deleted: deleted ?? false }).where(eq(cashups.cashupId, cashupId)).run();
    return cashupId;
  }
  const inserted = db.insert(cashups).values({ ...rest, deleted: deleted ?? false }).returning({ id: cashups.cashupId }).get();
  return inserted.id;
}

export function deleteCashup(cashupId: number): void {
  const db = getDbSync();
  db.update(cashups).set({ deleted: true }).where(eq(cashups.cashupId, cashupId)).run();
}

export function calculateTotal(open: number, transfer: number, closedCash: number, closedDue: number, closedCard: number, closedCheck: number): number {
  return closedCash - open - transfer + closedDue + closedCard + closedCheck;
}

export function getAll(limit = 25, offset = 0): CashupRow[] {
  return getDbSync().select().from(cashups)
    .where(eq(cashups.deleted, false))
    .orderBy(desc(cashups.openDate))
    .limit(limit).offset(offset).all() as CashupRow[];
}

export function getInfo(cashupId: number): CashupRow | null {
  return getCashup(cashupId);
}

export function getMultipleInfo(ids: number[]): CashupRow[] {
  if (ids.length === 0) return [];
  return getDbSync().select().from(cashups)
    .where(sql`${cashups.cashupId} IN (${ids.join(",") || "NULL"})`).all() as CashupRow[];
}

export function getEmptyRow(): CashupRow {
  return { cashupId: 0, openDate: null, closeDate: null, openAmountCash: 0, transferAmountCash: 0, closedAmountCash: 0, note: null, employeeId: null, deleted: false };
}

export function search(filters: { startDate?: number; endDate?: number; employeeId?: number }, limit = 25, offset = 0): CashupRow[] {
  const conditions = [eq(cashups.deleted, false)];
  if (filters.startDate) conditions.push(sql`${cashups.openDate} >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(sql`${cashups.openDate} <= ${filters.endDate}`);
  if (filters.employeeId) conditions.push(eq(cashups.employeeId, filters.employeeId));
  return getDbSync().select().from(cashups)
    .where(and(...conditions)).orderBy(desc(cashups.openDate))
    .limit(limit).offset(offset).all() as CashupRow[];
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` }).from(cashups)
    .where(eq(cashups.deleted, false)).get();
  return r?.c ?? 0;
}

export function deleteList(ids: number[]): void {
  const db = getDbSync();
  for (const id of ids) db.update(cashups).set({ deleted: true }).where(eq(cashups.cashupId, id)).run();
}

export function getEmployee(personId: number): { firstName: string; lastName: string; username: string } | null {
  const db = getDbSync();
  const row = db.select({
    firstName: people.firstName, lastName: people.lastName, username: employees.username,
  })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(eq(employees.personId, personId))
    .get();
  return (row as any) ?? null;
}

void asc;