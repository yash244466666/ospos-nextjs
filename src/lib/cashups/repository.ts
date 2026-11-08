import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { cashUp, employees, people } from "@/db/schema";
import { bcAdd, bcSub, toDbDecimal, type DecimalInput } from "@/lib/money";
import { nowDb } from "@/lib/datetime";
import { timezone } from "@/lib/config";

export interface CashupRow {
  cashupId: number;
  openDate: string | null;
  closeDate: string | null;
  openAmountCash: string;
  transferAmountCash: string;
  closedAmountCash: string;
  note: boolean;
  /** Legacy single-employee alias for `openEmployeeId`. */
  employeeId: number | null;
  deleted: boolean;
  closedAmountCard: string;
  closedAmountCheck: string;
  closedAmountTotal: string;
  closedAmountDue: string;
  description: string;
  openEmployeeId: number;
  closeEmployeeId: number;
}

export type CashupInput = Omit<
  CashupRow,
  "cashupId" | "deleted" | "employeeId" | "openEmployeeId" | "closeEmployeeId"
> & {
  cashupId?: number;
  deleted?: boolean;
  employeeId?: number | null;
  openEmployeeId?: number;
  closeEmployeeId?: number;
};

function toCashupRow(row: typeof cashUp.$inferSelect): CashupRow {
  return { ...row, employeeId: row.openEmployeeId };
}

export async function listCashups(): Promise<CashupRow[]> {
  const db = await getDb();
  const rows = await db.select().from(cashUp).where(eq(cashUp.deleted, false));
  return rows.map(toCashupRow);
}

export async function getCashup(cashupId: number): Promise<CashupRow | null> {
  if (cashupId <= 0) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(cashUp)
    .where(eq(cashUp.cashupId, cashupId))
    .limit(1);
  return rows[0] ? toCashupRow(rows[0]) : null;
}

export async function saveCashup(data: CashupInput): Promise<number> {
  const openEmployeeId = data.openEmployeeId ?? data.employeeId ?? 0;
  const closeEmployeeId = data.closeEmployeeId ?? data.employeeId ?? openEmployeeId;
  const values = {
    openDate: data.openDate ?? nowDb(timezone()),
    closeDate: data.closeDate ?? null,
    openAmountCash: toDbDecimal(data.openAmountCash, 2),
    transferAmountCash: toDbDecimal(data.transferAmountCash, 2),
    note: data.note,
    closedAmountCash: toDbDecimal(data.closedAmountCash, 2),
    closedAmountCard: toDbDecimal(data.closedAmountCard, 2),
    closedAmountCheck: toDbDecimal(data.closedAmountCheck, 2),
    closedAmountTotal: toDbDecimal(data.closedAmountTotal, 2),
    closedAmountDue: toDbDecimal(data.closedAmountDue, 2),
    description: data.description,
    openEmployeeId,
    closeEmployeeId,
    deleted: data.deleted ?? false,
  };
  return withTransaction(async (tx) => {
    if (data.cashupId && data.cashupId > 0) {
      await tx.update(cashUp).set(values).where(eq(cashUp.cashupId, data.cashupId));
      return data.cashupId;
    }
    const inserted = await insertReturning(tx, cashUp, values, cashUp.cashupId);
    const result = Array.isArray(inserted) ? inserted[0] : inserted;
    return result.id;
  });
}

export async function deleteCashup(cashupId: number): Promise<void> {
  const db = await getDb();
  await db.update(cashUp).set({ deleted: true }).where(eq(cashUp.cashupId, cashupId));
}

/**
 * Port of `Cashups::calculateTotal()`: closed cash minus the opening float and
 * transfers, plus dues, card and check takings. Decimal math only.
 */
export function calculateTotal(
  open: DecimalInput,
  transfer: DecimalInput,
  closedCash: DecimalInput,
  closedDue: DecimalInput,
  closedCard: DecimalInput,
  closedCheck: DecimalInput,
): string {
  const takings = bcAdd(bcAdd(closedCard, closedCheck), closedDue);
  const result = bcSub(bcSub(bcAdd(closedCash, takings), open), transfer);
  return toDbDecimal(result, 2);
}

export async function getAll(limit = 25, offset = 0): Promise<CashupRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(cashUp)
    .where(eq(cashUp.deleted, false))
    .orderBy(desc(cashUp.openDate))
    .limit(limit)
    .offset(offset);
  return rows.map(toCashupRow);
}

export async function getInfo(cashupId: number): Promise<CashupRow | null> {
  return getCashup(cashupId);
}

export async function getMultipleInfo(ids: number[]): Promise<CashupRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.select().from(cashUp).where(inArray(cashUp.cashupId, ids));
  return rows.map(toCashupRow);
}

export function getEmptyRow(): CashupRow {
  return {
    cashupId: 0,
    openDate: null,
    closeDate: null,
    openAmountCash: "0",
    transferAmountCash: "0",
    closedAmountCash: "0",
    note: false,
    employeeId: null,
    deleted: false,
    closedAmountCard: "0",
    closedAmountCheck: "0",
    closedAmountTotal: "0",
    closedAmountDue: "0",
    description: "",
    openEmployeeId: 0,
    closeEmployeeId: 0,
  };
}

export async function search(
  filters: { startDate?: string; endDate?: string; employeeId?: number },
  limit = 25,
  offset = 0,
): Promise<CashupRow[]> {
  const db = await getDb();
  const conditions = [eq(cashUp.deleted, false)];
  if (filters.startDate) conditions.push(sql`${cashUp.openDate} >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(sql`${cashUp.openDate} <= ${filters.endDate}`);
  if (filters.employeeId) {
    conditions.push(
      or(
        eq(cashUp.openEmployeeId, filters.employeeId),
        eq(cashUp.closeEmployeeId, filters.employeeId),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(cashUp)
    .where(and(...conditions))
    .orderBy(desc(cashUp.openDate))
    .limit(limit)
    .offset(offset);
  return rows.map(toCashupRow);
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(cashUp)
    .where(eq(cashUp.deleted, false));
  return Number(rows[0]?.c ?? 0);
}

export async function deleteList(ids: number[]): Promise<void> {
  const db = await getDb();
  for (const id of ids) {
    await db.update(cashUp).set({ deleted: true }).where(eq(cashUp.cashupId, id));
  }
}

export async function getEmployee(
  personId: number,
): Promise<{ firstName: string; lastName: string; username: string } | null> {
  const db = await getDb();
  const rows = await db
    .select({
      firstName: people.firstName,
      lastName: people.lastName,
      username: employees.username,
    })
    .from(employees)
    .innerJoin(people, eq(people.personId, employees.personId))
    .where(eq(employees.personId, personId))
    .limit(1);
  return rows[0] ?? null;
}
