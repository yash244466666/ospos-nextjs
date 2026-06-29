import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { items } from "./items";

export const attributeDefinitions = sqliteTable("attribute_definitions", {
  definitionId: integer("definition_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  definitionName: text("definition_name").notNull(),
  definitionType: text("definition_type", { enum: ["TEXT", "DROPDOWN", "DECIMAL", "DATE", "GROUP", "CHECKBOX"] }).notNull(),
  definitionUnit: text("definition_unit"),
  definitionFlags: integer("definition_flags", { mode: "number" }).notNull().default(0),
  definitionFk: integer("definition_fk", { mode: "number" }),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const attributeValues = sqliteTable("attribute_values", {
  attributeId: integer("attribute_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  attributeValue: text("attribute_value"),
  attributeDate: text("attribute_date"),
  attributeDecimal: real("attribute_decimal"),
});

export const attributeLinks = sqliteTable("attribute_links", {
  attributeId: integer("attribute_id", { mode: "number" }).references(() => attributeValues.attributeId),
  definitionId: integer("definition_id", { mode: "number" }).notNull().references(() => attributeDefinitions.definitionId),
  itemId: integer("item_id", { mode: "number" }).references(() => items.itemId, { onDelete: "cascade" }),
  saleId: integer("sale_id", { mode: "number" }),
  receivingId: integer("receiving_id", { mode: "number" }),
});