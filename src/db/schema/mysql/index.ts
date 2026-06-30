// MySQL parallel schema — mirrors the SQLite schema using mysqlTable.
// This is the source for `npm run db:generate:mysql` and the live DB under DB_DRIVER=mysql.
//
// Type mapping:
// - integer (SQLite) -> int / tinyint
// - real (SQLite) -> decimal(15,4)
// - text (SQLite) -> varchar(255) for bounded strings, text for free-form
// - boolean (SQLite) -> tinyint(1) with 0/1 defaults
// - unix timestamps (SQLite integer) -> int with $defaultFn(() => unixtime)

import { mysqlTable, int, varchar, text, decimal, tinyint, uniqueIndex, primaryKey } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// auth.ts
export const people = mysqlTable("people", {
  personId: int("person_id").autoincrement().primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }),
  gender: tinyint("gender").default(0),
  phoneNumber: varchar("phone_number", { length: 255 }),
  email: varchar("email", { length: 255 }),
  address1: varchar("address_1", { length: 255 }),
  address2: varchar("address_2", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 255 }),
  zip: varchar("zip", { length: 255 }),
  country: varchar("country", { length: 255 }),
  comments: text("comments"),
});

export const employees = mysqlTable("employees", {
  personId: int("person_id").primaryKey().references(() => people.personId, { onDelete: "cascade" }),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  hashVersion: tinyint("hash_version").notNull().default(2),
  deleted: tinyint("deleted").notNull().default(0),
  language: varchar("language", { length: 255 }),
  languageCode: varchar("language_code", { length: 255 }),
});

export const modules = mysqlTable("modules", {
  moduleId: varchar("module_id", { length: 255 }).primaryKey(),
  nameLangKey: varchar("name_lang_key", { length: 255 }).notNull(),
  descLangKey: varchar("desc_lang_key", { length: 255 }).notNull().unique(),
  sort: int("sort").notNull().default(0),
});

export const stockLocations = mysqlTable("stock_locations", {
  locationId: int("location_id").autoincrement().primaryKey(),
  locationName: varchar("location_name", { length: 255 }).notNull(),
  deleted: tinyint("deleted").notNull().default(0),
});

export const permissions = mysqlTable("permissions", {
  permissionId: varchar("permission_id", { length: 255 }).primaryKey(),
  moduleId: varchar("module_id", { length: 255 }).notNull().references(() => modules.moduleId, { onDelete: "cascade" }),
  locationId: int("location_id").references(() => stockLocations.locationId, { onDelete: "cascade" }),
});

export const grants = mysqlTable("grants", {
  permissionId: varchar("permission_id", { length: 255 }).notNull().references(() => permissions.permissionId, { onDelete: "cascade" }),
  personId: int("person_id").notNull().references(() => employees.personId, { onDelete: "cascade" }),
  menuGroup: varchar("menu_group", { length: 10 }).notNull().default("both"),
}, (t) => ({
  pk: primaryKey({ columns: [t.permissionId, t.personId] }),
}));

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  ipAddress: varchar("ip_address", { length: 45 }),
  timestamp: int("timestamp").notNull(),
  data: text("data"),
});

export const cartSessions = mysqlTable("cart_sessions", {
  sessionId: varchar("session_id", { length: 255 }).primaryKey(),
  personId: int("person_id").notNull(),
  data: text("data").notNull(),
  updatedAt: int("updated_at").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// config.ts
export const appConfig = mysqlTable("app_config", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: varchar("value", { length: 500 }).notNull(),
});

// items.ts
export const items = mysqlTable("items", {
  itemId: int("item_id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }),
  supplierId: int("supplier_id").references(() => people.personId),
  itemNumber: varchar("item_number", { length: 255 }),
  description: text("description"),
  costPrice: decimal("cost_price", { precision: 15, scale: 4 }).notNull().default("0"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 4 }).notNull().default("0"),
  reorderLevel: decimal("reorder_level", { precision: 15, scale: 4 }).notNull().default("0"),
  receivingQuantity: decimal("receiving_quantity", { precision: 15, scale: 4 }).notNull().default("1"),
  picFilename: varchar("pic_filename", { length: 255 }),
  allowAltDescription: tinyint("allow_alt_description").notNull().default(0),
  isSerialized: tinyint("is_serialized").notNull().default(0),
  stockType: tinyint("stock_type").notNull().default(0),
  itemType: tinyint("item_type").notNull().default(0),
  taxCategoryId: int("tax_category_id"),
  qtyPerPack: decimal("qty_per_pack", { precision: 15, scale: 4 }).notNull().default("1"),
  packName: varchar("pack_name", { length: 255 }),
  lowSellItemId: int("low_sell_item_id"),
  hsnCode: varchar("hsn_code", { length: 255 }),
  deleted: tinyint("deleted").notNull().default(0),
});

export const itemsTaxes = mysqlTable("items_taxes", {
  itemId: int("item_id").notNull().references(() => items.itemId, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  percent: decimal("percent", { precision: 15, scale: 4 }).notNull().default("0"),
});

export const itemQuantities = mysqlTable("item_quantities", {
  itemId: int("item_id").notNull().references(() => items.itemId, { onDelete: "cascade" }),
  locationId: int("location_id").notNull().references(() => stockLocations.locationId, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull().default("0"),
}, (t) => ({
  pk: primaryKey({ columns: [t.itemId, t.locationId] }),
}));

export const inventory = mysqlTable("inventory", {
  transId: int("trans_id").autoincrement().primaryKey(),
  transItems: int("trans_items").references(() => items.itemId),
  transUser: int("trans_user").references(() => people.personId),
  transDate: int("trans_date").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  transComment: text("trans_comment"),
  transLocation: int("trans_location").references(() => stockLocations.locationId),
  transInventory: decimal("trans_inventory", { precision: 15, scale: 4 }).notNull().default("0"),
});

export const itemKits = mysqlTable("item_kits", {
  itemKitId: int("item_kit_id").autoincrement().primaryKey(),
  itemKitNumber: varchar("item_kit_number", { length: 255 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  itemId: int("item_id").references(() => items.itemId),
  kitDiscount: decimal("kit_discount", { precision: 15, scale: 4 }).notNull().default("0"),
  kitDiscountType: tinyint("kit_discount_type").notNull().default(0),
  priceOption: tinyint("price_option").notNull().default(0),
  printOption: tinyint("print_option").notNull().default(0),
});

export const itemKitItems = mysqlTable("item_kit_items", {
  itemKitId: int("item_kit_id").notNull().references(() => itemKits.itemKitId, { onDelete: "cascade" }),
  itemId: int("item_id").notNull().references(() => items.itemId, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull().default("1"),
  kitSequence: int("kit_sequence").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.itemKitId, t.itemId, t.kitSequence] }),
}));

// customers.ts
export const customers = mysqlTable("customers", {
  personId: int("person_id").primaryKey().references(() => people.personId, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 255 }),
  taxable: tinyint("taxable").notNull().default(1),
  discount: decimal("discount", { precision: 15, scale: 4 }).notNull().default("0"),
  discountType: tinyint("discount_type").notNull().default(0),
  points: int("points").notNull().default(0),
  salesTaxCodeId: int("sales_tax_code_id").references(() => taxCodes.taxCodeId),
  deleted: tinyint("deleted").notNull().default(0),
});

export const suppliers = mysqlTable("suppliers", {
  personId: int("person_id").primaryKey().references(() => people.personId, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 255 }),
  agencyName: varchar("agency_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 255 }).unique(),
  deleted: tinyint("deleted").notNull().default(0),
});

export const dinnerTables = mysqlTable("dinner_tables", {
  dinnerTableId: int("dinner_table_id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  status: tinyint("status").notNull().default(0),
  deleted: tinyint("deleted").notNull().default(0),
});

export const rewards = mysqlTable("rewards", {
  rewardId: int("reward_id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  pointsPercent: decimal("points_percent", { precision: 15, scale: 4 }).notNull().default("0"),
  deleted: tinyint("deleted").notNull().default(0),
});

export const customerRewards = mysqlTable("customer_rewards", {
  customerId: int("customer_id").notNull().references(() => customers.personId, { onDelete: "cascade" }),
  rewardId: int("reward_id").notNull().references(() => rewards.rewardId, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.customerId, t.rewardId] }),
}));

// sales.ts
export const sales = mysqlTable("sales", {
  saleId: int("sale_id").autoincrement().primaryKey(),
  saleTime: int("sale_time").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  customerId: int("customer_id").references(() => people.personId),
  employeeId: int("employee_id").references(() => employees.personId),
  comment: text("comment"),
  invoiceNumber: varchar("invoice_number", { length: 255 }),
  quoteNumber: varchar("quote_number", { length: 255 }),
  saleStatus: tinyint("sale_status").notNull().default(0),
  saleType: tinyint("sale_type").notNull().default(0),
  dinnerTableId: int("dinner_table_id"),
  workOrderNumber: varchar("work_order_number", { length: 255 }),
  saleLocation: int("sale_location").references(() => stockLocations.locationId),
  saleCashAdjustment: decimal("sale_cash_adjustment", { precision: 15, scale: 4 }).notNull().default("0"),
  saleCashRefund: decimal("sale_cash_refund", { precision: 15, scale: 4 }).notNull().default("0"),
});

export const salesItems = mysqlTable("sales_items", {
  saleId: int("sale_id").notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  itemId: int("item_id").notNull().references(() => items.itemId),
  line: int("line").notNull(),
  description: text("description"),
  serialnumber: text("serialnumber"),
  quantityPurchased: decimal("quantity_purchased", { precision: 15, scale: 4 }).notNull().default("0"),
  discount: decimal("discount", { precision: 15, scale: 4 }).notNull().default("0"),
  discountType: tinyint("discount_type").notNull().default(0),
  itemCostPrice: decimal("item_cost_price", { precision: 15, scale: 4 }).notNull().default("0"),
  itemUnitPrice: decimal("item_unit_price", { precision: 15, scale: 4 }).notNull().default("0"),
  itemLocation: int("item_location").references(() => stockLocations.locationId),
  printOption: tinyint("print_option").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.saleId, t.itemId, t.line] }),
}));

export const salesItemsTaxes = mysqlTable("sales_items_taxes", {
  saleId: int("sale_id").notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  itemId: int("item_id").notNull(),
  line: int("line").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  percent: decimal("percent", { precision: 15, scale: 4 }).notNull().default("0"),
  itemTaxAmount: decimal("item_tax_amount", { precision: 15, scale: 4 }).notNull().default("0"),
});

export const salesTaxes = mysqlTable("sales_taxes", {
  saleId: int("sale_id").notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  taxType: tinyint("tax_type").notNull(),
  roundCode: tinyint("round_code").notNull(),
  taxGroup: varchar("tax_group", { length: 255 }).notNull(),
  saleTaxBasis: decimal("sale_tax_basis", { precision: 15, scale: 4 }).notNull().default("0"),
  saleTaxAmount: decimal("sale_tax_amount", { precision: 15, scale: 4 }).notNull().default("0"),
});

export const salesPayments = mysqlTable("sales_payments", {
  saleId: int("sale_id").notNull().references(() => sales.saleId, { onDelete: "cascade" }),
  paymentType: varchar("payment_type", { length: 255 }).notNull(),
  paymentAmount: decimal("payment_amount", { precision: 15, scale: 4 }).notNull().default("0"),
  cashRefund: decimal("cash_refund", { precision: 15, scale: 4 }).notNull().default("0"),
  cashAdjustment: decimal("cash_adjustment", { precision: 15, scale: 4 }).notNull().default("0"),
  employeeId: int("employee_id").references(() => employees.personId),
  paymentTime: int("payment_time").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
});

// receivings.ts
export const receivings = mysqlTable("receivings", {
  receivingId: int("receiving_id").autoincrement().primaryKey(),
  receivingTime: int("receiving_time").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  supplierId: int("supplier_id").references(() => people.personId),
  employeeId: int("employee_id").references(() => employees.personId),
  comment: text("comment"),
  paymentType: text("payment_type"),
  receivingRef: int("receiving_ref"),
  invoiceNumber: varchar("invoice_number", { length: 255 }),
  receivingLocation: int("receiving_location").references(() => stockLocations.locationId),
});

export const receivingsItems = mysqlTable("receivings_items", {
  receivingId: int("receiving_id").notNull().references(() => receivings.receivingId, { onDelete: "cascade" }),
  itemId: int("item_id").notNull().references(() => items.itemId),
  description: text("description"),
  serialnumber: text("serialnumber"),
  quantityPurchased: decimal("quantity_purchased", { precision: 15, scale: 4 }).notNull().default("0"),
  itemCostPrice: decimal("item_cost_price", { precision: 15, scale: 4 }).notNull().default("0"),
  itemUnitPrice: decimal("item_unit_price", { precision: 15, scale: 4 }).notNull().default("0"),
  discount: decimal("discount", { precision: 15, scale: 4 }).notNull().default("0"),
  discountType: tinyint("discount_type").notNull().default(0),
  line: int("line").notNull(),
  itemLocation: int("item_location").references(() => stockLocations.locationId),
  receivingQuantity: decimal("receiving_quantity", { precision: 15, scale: 4 }).notNull().default("1"),
  transferItemLocation: int("transfer_item_location"),
}, (t) => ({
  pk: primaryKey({ columns: [t.receivingId, t.itemId, t.line] }),
}));

// attributes.ts
export const attributeDefinitions = mysqlTable("attribute_definitions", {
  definitionId: int("definition_id").autoincrement().primaryKey(),
  definitionName: varchar("definition_name", { length: 255 }).notNull(),
  definitionType: varchar("definition_type", { length: 255 }).notNull(),
  definitionUnit: varchar("definition_unit", { length: 255 }),
  definitionFlags: tinyint("definition_flags").notNull().default(0),
  definitionFk: int("definition_fk"),
  deleted: tinyint("deleted").notNull().default(0),
});

export const attributeValues = mysqlTable("attribute_values", {
  attributeId: int("attribute_id").autoincrement().primaryKey(),
  attributeValue: text("attribute_value"),
  attributeDate: varchar("attribute_date", { length: 255 }),
  attributeDecimal: decimal("attribute_decimal", { precision: 15, scale: 4 }),
});

export const attributeLinks = mysqlTable("attribute_links", {
  attributeId: int("attribute_id").references(() => attributeValues.attributeId),
  definitionId: int("definition_id").notNull().references(() => attributeDefinitions.definitionId),
  itemId: int("item_id").references(() => items.itemId, { onDelete: "cascade" }),
  saleId: int("sale_id"),
  receivingId: int("receiving_id"),
  generatedUniqueColumn: varchar("generated_unique_column", { length: 255 }).generatedAlwaysAs(
    sql`CONCAT(definition_id, '-', item_id)`,
    { mode: "stored" }
  ),
}, (t) => ({
  uniqueGenerated: uniqueIndex("attribute_links_generated_unique_column_idx").on(t.generatedUniqueColumn),
}));

// taxes.ts
export const taxCategories = mysqlTable("tax_categories", {
  taxCategoryId: int("tax_category_id").autoincrement().primaryKey(),
  taxCategory: varchar("tax_category", { length: 255 }).notNull(),
  taxGroupSeq: varchar("tax_group_seq", { length: 255 }),
  deleted: tinyint("deleted").notNull().default(0),
});

export const taxCodes = mysqlTable("tax_codes", {
  taxCodeId: int("tax_code_id").autoincrement().primaryKey(),
  taxCode: varchar("tax_code", { length: 255 }).notNull(),
  taxCodeName: varchar("tax_code_name", { length: 255 }).notNull(),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 255 }),
  deleted: tinyint("deleted").notNull().default(0),
});

export const taxJurisdictions = mysqlTable("tax_jurisdictions", {
  jurisdictionId: int("jurisdiction_id").autoincrement().primaryKey(),
  jurisdictionName: varchar("jurisdiction_name", { length: 255 }).notNull(),
  taxType: varchar("tax_type", { length: 255 }).notNull(),
  reportingAuthority: varchar("reporting_authority", { length: 255 }),
  taxableAmount: decimal("taxable_amount", { precision: 15, scale: 4 }),
  taxRate: decimal("tax_rate", { precision: 15, scale: 4 }).notNull().default("0"),
  taxGroup: varchar("tax_group", { length: 255 }),
  roundCode: tinyint("round_code").notNull().default(1),
  cascadeSequence: tinyint("cascade_sequence").notNull().default(0),
  deleted: tinyint("deleted").notNull().default(0),
});

export const taxCodeLinks = mysqlTable("tax_code_links", {
  taxCodeLinkId: int("tax_code_link_id").autoincrement().primaryKey(),
  taxCodeId: int("tax_code_id").notNull(),
  taxCategoryId: int("tax_category_id").notNull(),
  jurisdictionId: int("jurisdiction_id").notNull(),
  taxRate: decimal("tax_rate", { precision: 15, scale: 4 }).notNull().default("0"),
  roundCode: tinyint("round_code").notNull().default(1),
  cascadeSequence: tinyint("cascade_sequence").notNull().default(0),
});

// expenses.ts
export const expenses = mysqlTable("expenses", {
  expenseId: int("expense_id").autoincrement().primaryKey(),
  expenseTime: int("expense_time").notNull().$defaultFn(() => Math.floor(Date.now() / 1000)),
  amount: decimal("amount", { precision: 15, scale: 4 }).notNull().default("0"),
  paymentType: varchar("payment_type", { length: 255 }).notNull(),
  expenseCategoryId: int("expense_category_id"),
  description: text("description"),
  employeeId: int("employee_id").references(() => employees.personId),
  deleted: tinyint("deleted").notNull().default(0),
});

export const expenseCategories = mysqlTable("expense_categories", {
  expenseCategoryId: int("expense_category_id").autoincrement().primaryKey(),
  category: varchar("category", { length: 255 }).notNull(),
  description: text("description"),
  deleted: tinyint("deleted").notNull().default(0),
});

// cashups.ts
export const cashups = mysqlTable("cashups", {
  cashupId: int("cashup_id").autoincrement().primaryKey(),
  openDate: int("open_date"),
  closeDate: int("close_date"),
  openAmountCash: decimal("open_amount_cash", { precision: 15, scale: 4 }).notNull().default("0"),
  transferAmountCash: decimal("transfer_amount_cash", { precision: 15, scale: 4 }).notNull().default("0"),
  closedAmountCash: decimal("closed_amount_cash", { precision: 15, scale: 4 }).notNull().default("0"),
  note: text("note"),
  employeeId: int("employee_id").references(() => employees.personId),
  deleted: tinyint("deleted").notNull().default(0),
});

// giftcards.ts
export const giftcards = mysqlTable("giftcards", {
  giftcardId: int("giftcard_id").autoincrement().primaryKey(),
  giftcardNumber: varchar("giftcard_number", { length: 255 }).notNull().unique(),
  value: decimal("value", { precision: 15, scale: 4 }).notNull().default("0"),
  personId: int("person_id").references(() => people.personId),
  deleted: tinyint("deleted").notNull().default(0),
});

// misc.ts (legacy CodeIgniter migrations table, mirrored for parity)
export const migrations = mysqlTable("migrations", {
  id: int("id").autoincrement().primaryKey(),
  version: int("version").notNull(),
  class: varchar("class", { length: 255 }).notNull(),
  namespace: varchar("namespace", { length: 255 }).notNull(),
  time: int("time").notNull(),
});
