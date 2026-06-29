import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { people, employees, stockLocations } from "./auth";
import { items } from "./items";

export const sales = sqliteTable("sales", {
  saleId: integer("sale_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  saleTime: integer("sale_time", { mode: "number" }).$defaultFn(() => Math.floor(Date.now() / 1000)),
  customerId: integer("customer_id", { mode: "number" }).references(() => people.personId),
  employeeId: integer("employee_id", { mode: "number" }).references(() => employees.personId),
  comment: text("comment"),
  invoiceNumber: text("invoice_number"),
  quoteNumber: text("quote_number"),
  saleStatus: integer("sale_status", { mode: "number" }).notNull().default(0),
  saleType: integer("sale_type", { mode: "number" }).notNull().default(0),
  dinnerTableId: integer("dinner_table_id", { mode: "number" }),
  workOrderNumber: text("work_order_number"),
  saleLocation: integer("sale_location", { mode: "number" }).references(() => stockLocations.locationId),
  saleCashAdjustment: real("sale_cash_adjustment").default(0),
  saleCashRefund: real("sale_cash_refund").default(0),
});

export const salesItems = sqliteTable("sales_items", {
  saleId: integer("sale_id", { mode: "number" }).notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  itemId: integer("item_id", { mode: "number" }).notNull().references(() => items.itemId),
  line: integer("line", { mode: "number" }).notNull(),
  description: text("description"),
  serialnumber: text("serialnumber"),
  quantityPurchased: real("quantity_purchased").notNull().default(0),
  discount: real("discount").notNull().default(0),
  discountType: integer("discount_type", { mode: "number" }).notNull().default(0),
  itemCostPrice: real("item_cost_price").notNull().default(0),
  itemUnitPrice: real("item_unit_price").notNull().default(0),
  itemLocation: integer("item_location", { mode: "number" }).references(() => stockLocations.locationId),
  printOption: integer("print_option", { mode: "number" }).notNull().default(0),
});

export const salesItemsTaxes = sqliteTable("sales_items_taxes", {
  saleId: integer("sale_id", { mode: "number" }).notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  itemId: integer("item_id", { mode: "number" }).notNull(),
  line: integer("line", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  percent: real("percent").notNull().default(0),
  itemTaxAmount: real("item_tax_amount").notNull().default(0),
});

export const salesTaxes = sqliteTable("sales_taxes", {
  saleId: integer("sale_id", { mode: "number" }).notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  taxType: integer("tax_type", { mode: "number" }).notNull(),
  roundCode: integer("round_code", { mode: "number" }).notNull(),
  taxGroup: text("tax_group").notNull(),
  saleTaxBasis: real("sale_tax_basis").notNull().default(0),
  saleTaxAmount: real("sale_tax_amount").notNull().default(0),
});

export const salesPayments = sqliteTable("sales_payments", {
  saleId: integer("sale_id", { mode: "number" }).notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  paymentType: text("payment_type").notNull(),
  paymentAmount: real("payment_amount").notNull().default(0),
  cashRefund: real("cash_refund").notNull().default(0),
  cashAdjustment: real("cash_adjustment").notNull().default(0),
  employeeId: integer("employee_id", { mode: "number" }).references(() => employees.personId),
  paymentTime: integer("payment_time", { mode: "number" }).$defaultFn(() => Math.floor(Date.now() / 1000)),
});