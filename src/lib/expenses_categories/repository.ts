import { and, asc, eq, like, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { expenseCategories } from "@/db/schema";

export interface ExpenseCategoryRow {
  expenseCategoryId: number;
  category: string;
  description: string;
  deleted: boolean;
}

function mapRow(row: typeof expenseCategories.$inferSelect): ExpenseCategoryRow {
  return {
    expenseCategoryId: row.expenseCategoryId,
    category: row.categoryName ?? "",
    description: row.categoryDescription,
    deleted: row.deleted,
  };
}

export async function getAll(noDeleted = true): Promise<ExpenseCategoryRow[]> {
  const db = await getDb();
  const query = db.select().from(expenseCategories).orderBy(asc(expenseCategories.categoryName));
  const rows = noDeleted
    ? await query.where(eq(expenseCategories.deleted, false))
    : await query;
  return rows.map(mapRow);
}

export async function getInfo(expenseCategoryId: number): Promise<ExpenseCategoryRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.expenseCategoryId, expenseCategoryId),
        eq(expenseCategories.deleted, false),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getName(expenseCategoryId: number): Promise<string | null> {
  return (await getInfo(expenseCategoryId))?.category ?? null;
}

export function getEmptyRow(): ExpenseCategoryRow {
  return { expenseCategoryId: 0, category: "", description: "", deleted: false };
}

export async function exists(expenseCategoryId: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: expenseCategories.expenseCategoryId })
    .from(expenseCategories)
    .where(eq(expenseCategories.expenseCategoryId, expenseCategoryId))
    .limit(1);
  return rows.length === 1;
}

export async function saveValue(input: ExpenseCategoryRow): Promise<number> {
  const db = await getDb();
  const values = {
    categoryName: input.category,
    categoryDescription: input.description,
    deleted: false,
  };
  if (input.expenseCategoryId && (await exists(input.expenseCategoryId))) {
    await db
      .update(expenseCategories)
      .set(values)
      .where(eq(expenseCategories.expenseCategoryId, input.expenseCategoryId));
    return input.expenseCategoryId;
  }
  const inserted = await insertReturning(db, expenseCategories, values, expenseCategories.expenseCategoryId);
  const result = Array.isArray(inserted) ? inserted[0] : inserted;
  return result.id;
}

export async function deleteCategory(expenseCategoryId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(expenseCategories)
    .set({ deleted: true })
    .where(eq(expenseCategories.expenseCategoryId, expenseCategoryId));
}

export async function deleteList(ids: number[]): Promise<void> {
  for (const id of ids) await deleteCategory(id);
}

export async function search(term: string, limit = 25): Promise<ExpenseCategoryRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.deleted, false),
        like(expenseCategories.categoryName, `%${term}%`),
      ),
    )
    .orderBy(asc(expenseCategories.categoryName))
    .limit(limit);
  return rows.map(mapRow);
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(expenseCategories)
    .where(eq(expenseCategories.deleted, false));
  return Number(rows[0]?.value ?? 0);
}
