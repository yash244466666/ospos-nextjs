import { eq, and, sql, like, desc, asc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { expenses, expenseCategories, employees, people } from "@/db/schema";

export interface ExpenseRow {
  expenseId: number;
  expenseTime: number;
  amount: number;
  paymentType: string;
  description: string | null;
  expenseCategoryId: number | null;
  employeeId: number | null;
  deleted: boolean;
  categoryName?: string;
  employeeName?: string;
}

export function getAll(limit = 25, offset = 0): ExpenseRow[] {
  return baseQuery().orderBy(desc(expenses.expenseTime)).limit(limit).offset(offset).all() as ExpenseRow[];
}

export function getInfo(expenseId: number): ExpenseRow | null {
  return (baseQuery().where(eq(expenses.expenseId, expenseId)).get() as ExpenseRow) ?? null;
}

function baseQuery() {
  const db = getDbSync();
  return db.select({
    expenseId: expenses.expenseId,
    expenseTime: expenses.expenseTime,
    amount: expenses.amount,
    paymentType: expenses.paymentType,
    description: expenses.description,
    expenseCategoryId: expenses.expenseCategoryId,
    employeeId: expenses.employeeId,
    deleted: expenses.deleted,
    categoryName: expenseCategories.category,
    employeeName: sql<string>`(SELECT first_name || ' ' || last_name FROM people WHERE person_id = ${expenses.employeeId})`,
  })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.expenseCategoryId, expenses.expenseCategoryId));
}

export function getEmptyRow(): ExpenseRow {
  return { expenseId: 0, expenseTime: Math.floor(Date.now() / 1000), amount: 0, paymentType: "Cash", description: null, expenseCategoryId: null, employeeId: null, deleted: false };
}

export function saveValue(input: ExpenseRow): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.expenseId) {
      tx.update(expenses).set({
        expenseTime: input.expenseTime, amount: input.amount, paymentType: input.paymentType,
        description: input.description, expenseCategoryId: input.expenseCategoryId,
        employeeId: input.employeeId,
      }).where(eq(expenses.expenseId, input.expenseId)).run();
      return input.expenseId;
    }
    return tx.insert(expenses).values({
      expenseTime: input.expenseTime, amount: input.amount, paymentType: input.paymentType,
      description: input.description, expenseCategoryId: input.expenseCategoryId,
      employeeId: input.employeeId, deleted: false,
    }).returning({ id: expenses.expenseId }).get().id;
  });
}

export function deleteExpense(expenseId: number): void {
  getDbSync().update(expenses).set({ deleted: true }).where(eq(expenses.expenseId, expenseId)).run();
}

export function search(filters: { startDate?: number; endDate?: number; description?: string }, limit = 25, offset = 0): ExpenseRow[] {
  const conditions = [eq(expenses.deleted, false)];
  if (filters.startDate) conditions.push(sql`${expenses.expenseTime} >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(sql`${expenses.expenseTime} <= ${filters.endDate}`);
  if (filters.description) conditions.push(like(expenses.description, `%${filters.description}%`));
  return baseQuery().where(and(...conditions)).orderBy(desc(expenses.expenseTime)).limit(limit).offset(offset).all() as ExpenseRow[];
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` }).from(expenses)
    .where(eq(expenses.deleted, false)).get();
  return r?.c ?? 0;
}

export function deleteList(ids: number[]): void {
  const db = getDbSync();
  for (const id of ids) db.update(expenses).set({ deleted: true }).where(eq(expenses.expenseId, id)).run();
}

void employees;
void people;
void asc;
