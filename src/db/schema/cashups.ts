import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { employees } from "./auth";

export const cashups = sqliteTable("cashups", {
  cashupId: integer("cashup_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  openDate: integer("open_date", { mode: "number" }),
  closeDate: integer("close_date", { mode: "number" }),
  openAmountCash: real("open_amount_cash").notNull().default(0),
  transferAmountCash: real("transfer_amount_cash").notNull().default(0),
  closedAmountCash: real("closed_amount_cash").notNull().default(0),
  note: text("note"),
  employeeId: integer("employee_id", { mode: "number" }).references(() => employees.personId),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});