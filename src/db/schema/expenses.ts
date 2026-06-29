import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { people, employees } from "./auth";

export const expenses = sqliteTable("expenses", {
  expenseId: integer("expense_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  expenseTime: integer("expense_time", { mode: "number" }).$defaultFn(() => Math.floor(Date.now() / 1000)),
  amount: real("amount").notNull().default(0),
  paymentType: text("payment_type").notNull(),
  expenseCategoryId: integer("expense_category_id", { mode: "number" }),
  description: text("description"),
  employeeId: integer("employee_id", { mode: "number" }).references(() => employees.personId),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const expenseCategories = sqliteTable("expense_categories", {
  expenseCategoryId: integer("expense_category_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  description: text("description"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

void people;