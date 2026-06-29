import { eq, and, sql, like, desc, asc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { expenseCategories } from "@/db/schema";

export interface ExpenseCategoryRow {
  expenseCategoryId: number;
  category: string;
  description: string | null;
  deleted: boolean;
}

export function getAll(): ExpenseCategoryRow[] {
  return getDbSync().select().from(expenseCategories)
    .where(eq(expenseCategories.deleted, false))
    .orderBy(asc(expenseCategories.category))
    .all() as ExpenseCategoryRow[];
}

export function getInfo(expenseCategoryId: number): ExpenseCategoryRow | null {
  return (getDbSync().select().from(expenseCategories)
    .where(eq(expenseCategories.expenseCategoryId, expenseCategoryId))
    .get() as ExpenseCategoryRow) ?? null;
}

export function getName(expenseCategoryId: number): string | null {
  return getInfo(expenseCategoryId)?.category ?? null;
}

export function getEmptyRow(): ExpenseCategoryRow {
  return { expenseCategoryId: 0, category: "", description: null, deleted: false };
}

export function saveValue(input: ExpenseCategoryRow): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.expenseCategoryId) {
      tx.update(expenseCategories).set({
        category: input.category, description: input.description,
      }).where(eq(expenseCategories.expenseCategoryId, input.expenseCategoryId)).run();
      return input.expenseCategoryId;
    }
    return tx.insert(expenseCategories).values({
      category: input.category, description: input.description, deleted: false,
    }).returning({ id: expenseCategories.expenseCategoryId }).get().id;
  });
}

export function deleteCategory(expenseCategoryId: number): void {
  getDbSync().update(expenseCategories).set({ deleted: true })
    .where(eq(expenseCategories.expenseCategoryId, expenseCategoryId)).run();
}

export function search(term: string, limit = 25): ExpenseCategoryRow[] {
  return getDbSync().select().from(expenseCategories)
    .where(and(eq(expenseCategories.deleted, false), like(expenseCategories.category, `%${term}%`)))
    .orderBy(asc(expenseCategories.category)).limit(limit).all() as ExpenseCategoryRow[];
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` }).from(expenseCategories)
    .where(eq(expenseCategories.deleted, false)).get();
  return r?.c ?? 0;
}

export function deleteList(ids: number[]): void {
  const db = getDbSync();
  for (const id of ids) db.update(expenseCategories).set({ deleted: true })
    .where(eq(expenseCategories.expenseCategoryId, id)).run();
}

void desc;
