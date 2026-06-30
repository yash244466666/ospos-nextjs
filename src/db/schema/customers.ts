import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { people } from "./auth";
import { taxCodes } from "./taxes";

export const customers = sqliteTable("customers", {
  personId: integer("person_id", { mode: "number" }).primaryKey().references(() => people.personId, { onDelete: "cascade" }),
  companyName: text("company_name"),
  accountNumber: text("account_number"),
  taxable: integer("taxable", { mode: "boolean" }).notNull().default(true),
  discount: real("discount").notNull().default(0),
  discountType: integer("discount_type", { mode: "number" }).notNull().default(0),
  points: integer("points", { mode: "number" }).notNull().default(0),
  salesTaxCodeId: integer("sales_tax_code_id", { mode: "number" }).references(() => taxCodes.taxCodeId),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const suppliers = sqliteTable("suppliers", {
  personId: integer("person_id", { mode: "number" }).primaryKey().references(() => people.personId, { onDelete: "cascade" }),
  companyName: text("company_name"),
  agencyName: text("agency_name"),
  accountNumber: text("account_number").unique(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const dinnerTables = sqliteTable("dinner_tables", {
  dinnerTableId: integer("dinner_table_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: integer("status", { mode: "number" }).notNull().default(0),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const rewards = sqliteTable("rewards", {
  rewardId: integer("reward_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pointsPercent: real("points_percent").notNull().default(0),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const customerRewards = sqliteTable("customer_rewards", {
  customerId: integer("customer_id", { mode: "number" }).notNull().references(() => customers.personId, { onDelete: "cascade" }),
  rewardId: integer("reward_id", { mode: "number" }).notNull().references(() => rewards.rewardId, { onDelete: "cascade" }),
});