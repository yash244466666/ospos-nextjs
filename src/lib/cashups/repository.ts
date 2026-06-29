import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { cashups } from "@/db/schema";

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