import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { people, employees, stockLocations } from "./auth";
import { items } from "./items";

export const receivings = sqliteTable("receivings", {
  receivingId: integer("receiving_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  receivingTime: integer("receiving_time", { mode: "number" }).$defaultFn(() => Math.floor(Date.now() / 1000)),
  supplierId: integer("supplier_id", { mode: "number" }).references(() => people.personId),
  employeeId: integer("employee_id", { mode: "number" }).references(() => employees.personId),
  comment: text("comment"),
  paymentType: text("payment_type"),
  receivingRef: integer("receiving_ref", { mode: "number" }),
  invoiceNumber: text("invoice_number"),
  receivingLocation: integer("receiving_location", { mode: "number" }).references(() => stockLocations.locationId),
});

export const receivingsItems = sqliteTable("receivings_items", {
  receivingId: integer("receiving_id", { mode: "number" }).notNull().references(() => receivings.receivingId, { onDelete: "cascade" }),
  itemId: integer("item_id", { mode: "number" }).notNull().references(() => items.itemId),
  description: text("description"),
  serialnumber: text("serialnumber"),
  quantityPurchased: real("quantity_purchased").notNull().default(0),
  itemCostPrice: real("item_cost_price").notNull().default(0),
  itemUnitPrice: real("item_unit_price").notNull().default(0),
  discount: real("discount").notNull().default(0),
  discountType: integer("discount_type", { mode: "number" }).notNull().default(0),
  line: integer("line", { mode: "number" }).notNull(),
  itemLocation: integer("item_location", { mode: "number" }).references(() => stockLocations.locationId),
  receivingQuantity: real("receiving_quantity").notNull().default(1),
  transferItemLocation: integer("transfer_item_location", { mode: "number" }),
});