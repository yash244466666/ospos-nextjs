import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { people, stockLocations } from "./auth";

export const items = sqliteTable("items", {
  itemId: integer("item_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category"),
  supplierId: integer("supplier_id", { mode: "number" }).references(() => people.personId),
  itemNumber: text("item_number"),
  description: text("description"),
  costPrice: real("cost_price").notNull().default(0),
  unitPrice: real("unit_price").notNull().default(0),
  reorderLevel: real("reorder_level").notNull().default(0),
  receivingQuantity: real("receiving_quantity").notNull().default(1),
  picFilename: text("pic_filename"),
  allowAltDescription: integer("allow_alt_description", { mode: "boolean" }).notNull().default(false),
  isSerialized: integer("is_serialized", { mode: "boolean" }).notNull().default(false),
  stockType: integer("stock_type", { mode: "number" }).notNull().default(0),
  itemType: integer("item_type", { mode: "number" }).notNull().default(0),
  taxCategoryId: integer("tax_category_id", { mode: "number" }),
  qtyPerPack: real("qty_per_pack").notNull().default(1),
  packName: text("pack_name"),
  lowSellItemId: integer("low_sell_item_id", { mode: "number" }),
  hsnCode: text("hsn_code"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const itemsTaxes = sqliteTable("items_taxes", {
  itemId: integer("item_id", { mode: "number" }).notNull().references(() => items.itemId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  percent: real("percent").notNull().default(0),
});

export const itemQuantities = sqliteTable("item_quantities", {
  itemId: integer("item_id", { mode: "number" }).notNull().references(() => items.itemId, { onDelete: "cascade" }),
  locationId: integer("location_id", { mode: "number" }).notNull().references(() => stockLocations.locationId, { onDelete: "cascade" }),
  quantity: real("quantity").notNull().default(0),
});

export const inventory = sqliteTable("inventory", {
  transId: integer("trans_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  transItems: integer("trans_items", { mode: "number" }).references(() => items.itemId),
  transUser: integer("trans_user", { mode: "number" }).references(() => people.personId),
  transDate: integer("trans_date", { mode: "number" }).$defaultFn(() => Math.floor(Date.now() / 1000)),
  transComment: text("trans_comment"),
  transLocation: integer("trans_location", { mode: "number" }).references(() => stockLocations.locationId),
  transInventory: real("trans_inventory").notNull().default(0),
});

export const itemKits = sqliteTable("item_kits", {
  itemKitId: integer("item_kit_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  itemKitNumber: text("item_kit_number"),
  name: text("name").notNull(),
  description: text("description"),
  itemId: integer("item_id", { mode: "number" }).references(() => items.itemId),
  kitDiscount: real("kit_discount").notNull().default(0),
  kitDiscountType: integer("kit_discount_type", { mode: "number" }).notNull().default(0),
  priceOption: integer("price_option", { mode: "number" }).notNull().default(0),
  printOption: integer("print_option", { mode: "number" }).notNull().default(0),
});

export const itemKitItems = sqliteTable("item_kit_items", {
  itemKitId: integer("item_kit_id", { mode: "number" }).notNull().references(() => itemKits.itemKitId, { onDelete: "cascade" }),
  itemId: integer("item_id", { mode: "number" }).notNull().references(() => items.itemId, { onDelete: "cascade" }),
  quantity: real("quantity").notNull().default(1),
  kitSequence: integer("kit_sequence", { mode: "number" }).notNull().default(0),
});