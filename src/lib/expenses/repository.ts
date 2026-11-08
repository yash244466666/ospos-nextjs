import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { expenseCategories, expenses, people, suppliers } from "@/db/schema";
import { dateOrTimeFormat } from "@/lib/config";
import { lang } from "@/lib/i18n/lang";
import { nowDb } from "@/lib/datetime";

export interface ExpenseRow {
  expenseId: number;
  expenseTime: string;
  amount: string;
  paymentType: string;
  description: string;
  expenseCategoryId: number;
  employeeId: number;
  deleted: boolean;
  supplierTaxCode: string | null;
  taxAmount: string | null;
  supplierId: number | null;
  categoryName?: string;
  employeeName?: string;
  supplierName?: string;
  employeeFirstName?: string | null;
  employeeLastName?: string | null;
}

export interface ExpenseFilters {
  is_deleted?: boolean;
  start_date?: string;
  end_date?: string;
  only_debit?: boolean;
  only_credit?: boolean;
  only_cash?: boolean;
  only_due?: boolean;
  only_check?: boolean;
}

export async function search(
  search: string,
  filters: ExpenseFilters,
  rows = 0,
  limitFrom = 0,
  sort = "expense_id",
  order: "asc" | "desc" = "asc",
  countOnly = false,
): Promise<ExpenseRow[] | number> {
  const db = await getDb();
  const likeTerm = `%${search}%`;
  const conditions = [eq(expenses.deleted, filters.is_deleted ?? false)];

  conditions.push(
    or(
      like(people.firstName, likeTerm),
      like(expenses.date, likeTerm),
      like(people.lastName, likeTerm),
      like(expenses.paymentType, likeTerm),
      like(expenses.amount, likeTerm),
      like(expenseCategories.categoryName, likeTerm),
      like(sql`CONCAT(${people.firstName}, ' ', ${people.lastName})`, likeTerm),
    )!,
  );

  if (filters.start_date && filters.end_date) {
    if (!dateOrTimeFormat()) {
      conditions.push(
        sql`DATE_FORMAT(${expenses.date}, '%Y-%m-%d') BETWEEN ${filters.start_date} AND ${filters.end_date}`,
      );
    } else {
      conditions.push(
        sql`${expenses.date} BETWEEN ${decodeURIComponent(filters.start_date)} AND ${decodeURIComponent(filters.end_date)}`,
      );
    }
  }
  if (filters.only_debit) conditions.push(like(expenses.paymentType, `%${lang("Expenses.debit")}%`));
  if (filters.only_credit) conditions.push(like(expenses.paymentType, `%${lang("Expenses.credit")}%`));
  if (filters.only_cash) {
    conditions.push(
      or(like(expenses.paymentType, `%${lang("Expenses.cash")}%`), sql`${expenses.paymentType} IS NULL`)!,
    );
  }
  if (filters.only_due) conditions.push(like(expenses.paymentType, `%${lang("Expenses.due")}%`));
  if (filters.only_check) conditions.push(like(expenses.paymentType, `%${lang("Expenses.check")}%`));

  if (countOnly) {
    const countRows = await db
      .select({ value: sql<number>`COUNT(DISTINCT ${expenses.expenseId})` })
      .from(expenses)
      .leftJoin(people, eq(people.personId, expenses.employeeId))
      .leftJoin(expenseCategories, eq(expenseCategories.expenseCategoryId, expenses.expenseCategoryId))
      .where(and(...conditions));
    return Number(countRows[0]?.value ?? 0);
  }

  const orderColumn =
    sort === "date"
      ? expenses.date
      : sort === "amount"
        ? expenses.amount
        : sort === "payment_type"
          ? expenses.paymentType
          : sort === "category_name"
            ? expenseCategories.categoryName
            : sort === "first_name"
              ? people.firstName
              : expenses.expenseId;

  const query = db
    .select({
      expenseId: expenses.expenseId,
      expenseTime: expenses.date,
      amount: expenses.amount,
      paymentType: expenses.paymentType,
      description: expenses.description,
      expenseCategoryId: expenses.expenseCategoryId,
      employeeId: expenses.employeeId,
      deleted: expenses.deleted,
      supplierTaxCode: expenses.supplierTaxCode,
      taxAmount: expenses.taxAmount,
      supplierId: expenses.supplierId,
      categoryName: expenseCategories.categoryName,
      employeeFirstName: people.firstName,
      employeeLastName: people.lastName,
      supplierName: suppliers.companyName,
    })
    .from(expenses)
    .leftJoin(people, eq(people.personId, expenses.employeeId))
    .leftJoin(expenseCategories, eq(expenseCategories.expenseCategoryId, expenses.expenseCategoryId))
    .leftJoin(suppliers, eq(suppliers.personId, expenses.supplierId))
    .where(and(...conditions))
    .groupBy(expenses.expenseId)
    .orderBy(order === "asc" ? asc(orderColumn) : desc(orderColumn));

  const result = rows > 0 ? await query.limit(rows).offset(limitFrom) : await query;
  return result.map((row): ExpenseRow => ({
    ...row,
    categoryName: row.categoryName ?? undefined,
    expenseTime: row.expenseTime ?? "",
    description: row.description ?? "",
    employeeName: `${row.employeeFirstName ?? ""} ${row.employeeLastName ?? ""}`.trim(),
    supplierName: row.supplierName ?? "",
  }));
}

export async function getAll(limit = 25, offset = 0): Promise<ExpenseRow[]> {
  return (await search("", { is_deleted: false }, limit, offset)) as ExpenseRow[];
}

export async function getInfo(expenseId: number): Promise<ExpenseRow | null> {
  const db = await getDb();
  const rows = await db
    .select({
      expenseId: expenses.expenseId,
      expenseTime: expenses.date,
      amount: expenses.amount,
      paymentType: expenses.paymentType,
      description: expenses.description,
      expenseCategoryId: expenses.expenseCategoryId,
      employeeId: expenses.employeeId,
      deleted: expenses.deleted,
      supplierTaxCode: expenses.supplierTaxCode,
      taxAmount: expenses.taxAmount,
      supplierId: expenses.supplierId,
      categoryName: expenseCategories.categoryName,
      employeeFirstName: people.firstName,
      employeeLastName: people.lastName,
      supplierName: suppliers.companyName,
    })
    .from(expenses)
    .leftJoin(people, eq(people.personId, expenses.employeeId))
    .leftJoin(expenseCategories, eq(expenseCategories.expenseCategoryId, expenses.expenseCategoryId))
    .leftJoin(suppliers, eq(suppliers.personId, expenses.supplierId))
    .where(eq(expenses.expenseId, expenseId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    categoryName: row.categoryName ?? undefined,
    expenseTime: row.expenseTime ?? "",
    description: row.description ?? "",
    employeeName: `${row.employeeFirstName ?? ""} ${row.employeeLastName ?? ""}`.trim(),
    supplierName: row.supplierName ?? "",
  };
}

export function getEmptyRow(employeeId = 0): ExpenseRow {
  return {
    expenseId: 0,
    expenseTime: nowDb(),
    amount: "0",
    paymentType: lang("Expenses.cash"),
    description: "",
    expenseCategoryId: 0,
    employeeId,
    deleted: false,
    supplierTaxCode: "",
    taxAmount: null,
    supplierId: null,
  };
}

export async function saveValue(input: ExpenseRow): Promise<number> {
  const db = await getDb();
  const values = {
    date: input.expenseTime || nowDb(),
    amount: input.amount,
    paymentType: input.paymentType,
    expenseCategoryId: input.expenseCategoryId,
    description: input.description,
    employeeId: input.employeeId,
    deleted: false,
    supplierTaxCode: input.supplierTaxCode ?? "",
    taxAmount: input.taxAmount ?? null,
    supplierId: input.supplierId ?? null,
  };
  if (input.expenseId) {
    await db.update(expenses).set(values).where(eq(expenses.expenseId, input.expenseId));
    return input.expenseId;
  }
  const inserted = await insertReturning(db, expenses, values, expenses.expenseId);
  const result = Array.isArray(inserted) ? inserted[0] : inserted;
  return result.id;
}

export async function deleteExpense(expenseId: number): Promise<void> {
  const db = await getDb();
  await db.update(expenses).set({ deleted: true }).where(eq(expenses.expenseId, expenseId));
}

export async function deleteList(ids: number[]): Promise<void> {
  for (const id of ids) await deleteExpense(id);
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(expenses)
    .where(eq(expenses.deleted, false));
  return Number(rows[0]?.value ?? 0);
}

