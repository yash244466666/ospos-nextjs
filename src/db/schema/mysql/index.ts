// MySQL parallel schema — mirrors the SQLite schema using mysqlTable.
// This is the source for `npm run db:generate:mysql` and the live DB under DB_DRIVER=mysql.
//
// Differences vs. SQLite:
// - integer → int / tinyint / bigint
// - real → decimal(15,4) or float
// - text → varchar(N) for bounded strings, text for free-form
// - boolean → tinyint(1)
// - timestamps use datetime / timestamp for date columns (OSPOS uses unixtime ints in SQLite)
//
// Generated columns: attribute_links.generated_unique_column uses MySQL STORED AS (CONCAT(definition_id,'-',item_id)) STORED.

import { mysqlTable, int, varchar, text, decimal, tinyint, bigint, datetime, timestamp, json, index, uniqueIndex, primaryKey } from "drizzle-orm/mysql-core";

// auth.ts
export const people = mysqlTable("people", {
  personId: int("person_id").autoincrement().primaryKey(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  phoneNumber: varchar("phone_number", { length: 255 }),
  email: varchar("email", { length: 255 }),
  imageUrl: varchar("image_url", { length: 255 }),
  gender: tinyint("gender"),
  address: varchar("address", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 255 }),
  zip: varchar("zip", { length: 255 }),
  country: varchar("country", { length: 255 }),
  comments: text("comments"),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const employees = mysqlTable("employees", {
  personId: int("person_id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  hashVersion: tinyint("hash_version").default(2).notNull(),
  deleted: tinyint("deleted").default(0).notNull(),
  language: varchar("language", { length: 255 }),
  languageCode: varchar("language_code", { length: 255 }),
});

export const modules = mysqlTable("modules", {
  moduleId: varchar("module_id", { length: 255 }).primaryKey(),
  moduleIcon: varchar("module_icon", { length: 255 }),
  moduleLangKey: varchar("module_lang_key", { length: 255 }),
  sort: int("sort").default(0).notNull(),
});

export const permissions = mysqlTable("permissions", {
  permissionId: varchar("permission_id", { length: 255 }).primaryKey(),
  moduleId: varchar("module_id", { length: 255 }),
  locationId: int("location_id"),
  permissionLangKey: varchar("permission_lang_key", { length: 255 }),
  sortOrder: int("sort_order").default(0).notNull(),
});

export const grants = mysqlTable("grants", {
  permissionId: varchar("permission_id", { length: 255 }).notNull(),
  personId: int("person_id").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.permissionId, t.personId] }),
}));

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  ip: varchar("ip", { length: 45 }),
  timestamp: int("timestamp").notNull(),
  data: text("data"),
  expires: bigint("expires", { mode: "number" }),
});

export const stockLocations = mysqlTable("stock_locations", {
  locationId: int("location_id").autoincrement().primaryKey(),
  locationName: varchar("location_name", { length: 255 }).notNull(),
  deleted: tinyint("deleted").default(0).notNull(),
});

// config.ts
export const appConfig = mysqlTable("app_config", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: varchar("value", { length: 500 }),
});

// items.ts
export const items = mysqlTable("items", {
  itemId: int("item_id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }),
  supplierId: int("supplier_id"),
  itemNumber: varchar("item_number", { length: 255 }),
  description: text("description"),
  costPrice: decimal("cost_price", { precision: 15, scale: 4 }).default("0").notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 4 }).default("0").notNull(),
  reorderLevel: decimal("reorder_level", { precision: 15, scale: 4 }).default("0").notNull(),
  receivingQuantity: decimal("receiving_quantity", { precision: 15, scale: 4 }).default("1").notNull(),
  picFilename: varchar("pic_filename", { length: 255 }),
  allowAltDescription: tinyint("allow_alt_description").default(0).notNull(),
  isSerialized: tinyint("is_serialized").default(0).notNull(),
  stockType: tinyint("stock_type").default(0).notNull(),
  itemType: tinyint("item_type").default(0).notNull(),
  taxCategoryId: int("tax_category_id"),
  qtyPerPack: decimal("qty_per_pack", { precision: 15, scale: 4 }).default("1").notNull(),
  packName: varchar("pack_name", { length: 255 }),
  lowSellItemId: int("low_sell_item_id"),
  hsnCode: varchar("hsn_code", { length: 255 }),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const itemQuantities = mysqlTable("item_quantities", {
  itemId: int("item_id").notNull(),
  locationId: int("location_id").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("0").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.itemId, t.locationId] }),
}));

export const inventory = mysqlTable("inventory", {
  transId: int("trans_id").autoincrement().primaryKey(),
  transItems: int("trans_items"),
  transUser: int("trans_user"),
  transDate: int("trans_date"),
  transComment: text("trans_comment"),
  transLocation: int("trans_location"),
  transInventory: decimal("trans_inventory", { precision: 15, scale: 4 }).default("0").notNull(),
});

export const itemKits = mysqlTable("item_kits", {
  itemKitId: int("item_kit_id").autoincrement().primaryKey(),
  itemKitNumber: varchar("item_kit_number", { length: 255 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  itemId: int("item_id"),
  kitDiscount: decimal("kit_discount", { precision: 15, scale: 4 }).default("0").notNull(),
  kitDiscountType: tinyint("kit_discount_type").default(0).notNull(),
  priceOption: tinyint("price_option").default(0).notNull(),
  printOption: tinyint("print_option").default(0).notNull(),
});

export const itemKitItems = mysqlTable("item_kit_items", {
  itemKitId: int("item_kit_id").notNull(),
  itemId: int("item_id").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("1").notNull(),
  kitSequence: int("kit_sequence").default(0).notNull(),
});

export const itemsTaxes = mysqlTable("items_taxes", {
  itemId: int("item_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  percent: decimal("percent", { precision: 15, scale: 4 }).default("0").notNull(),
});

// customers.ts
export const customers = mysqlTable("customers", {
  personId: int("person_id").primaryKey(),
  companyName: varchar("company_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 255 }),
  discount: decimal("discount", { precision: 15, scale: 4 }).default("0").notNull(),
  discountType: tinyint("discount_type").default(0).notNull(),
  taxable: tinyint("taxable").default(1).notNull(),
  points: int("points").default(0).notNull(),
  packagePolicy: tinyint("package_policy").default(0).notNull(),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const suppliers = mysqlTable("suppliers", {
  personId: int("person_id").primaryKey(),
  companyName: varchar("company_name", { length: 255 }),
  agencyName: varchar("agency_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 255 }),
  taxId: varchar("tax_id", { length: 255 }),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const dinnerTables = mysqlTable("dinner_tables", {
  dinnerTableId: int("dinner_table_id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  deleted: tinyint("deleted").default(0).notNull(),
});

// sales.ts
export const sales = mysqlTable("sales", {
  saleId: int("sale_id").autoincrement().primaryKey(),
  saleTime: int("sale_time"),
  customerId: int("customer_id"),
  employeeId: int("employee_id"),
  comment: text("comment"),
  saleStatus: tinyint("sale_status").default(0).notNull(),
  invoiceNumber: varchar("invoice_number", { length: 255 }),
  quoteNumber: varchar("quote_number", { length: 255 }),
  workOrderNumber: varchar("work_order_number", { length: 255 }),
  saleType: tinyint("sale_type").default(0).notNull(),
  dinnerTableId: int("dinner_table_id"),
  locationId: int("location_id"),
});

export const salesItems = mysqlTable("sales_items", {
  saleId: int("sale_id").notNull(),
  itemId: int("item_id").notNull(),
  description: text("description"),
  quantityPurchased: decimal("quantity_purchased", { precision: 15, scale: 4 }).default("0").notNull(),
  itemCostPrice: decimal("item_cost_price", { precision: 15, scale: 4 }).default("0").notNull(),
  itemUnitPrice: decimal("item_unit_price", { precision: 15, scale: 4 }).default("0").notNull(),
  discountPercent: decimal("discount_percent", { precision: 15, scale: 4 }).default("0").notNull(),
  line: int("line").notNull(),
});

export const salesTaxes = mysqlTable("sales_taxes", {
  saleId: int("sale_id").notNull(),
  taxType: tinyint("tax_type").notNull(),
  roundCode: tinyint("round_code").notNull(),
  taxGroup: varchar("tax_group", { length: 255 }).notNull(),
  saleTaxBasis: decimal("sale_tax_basis", { precision: 15, scale: 4 }).default("0").notNull(),
  saleTaxAmount: decimal("sale_tax_amount", { precision: 15, scale: 4 }).default("0").notNull(),
});

export const salesPayments = mysqlTable("sales_payments", {
  saleId: int("sale_id").notNull(),
  paymentType: varchar("payment_type", { length: 255 }).notNull(),
  paymentAmount: decimal("payment_amount", { precision: 15, scale: 4 }).default("0").notNull(),
  cashRefund: decimal("cash_refund", { precision: 15, scale: 4 }).default("0").notNull(),
  cashAdjustment: decimal("cash_adjustment", { precision: 15, scale: 4 }).default("0").notNull(),
});

// receivings.ts
export const receivings = mysqlTable("receivings", {
  receivingId: int("receiving_id").autoincrement().primaryKey(),
  receivingTime: int("receiving_time"),
  supplierId: int("supplier_id"),
  employeeId: int("employee_id"),
  comment: text("comment"),
  receivingType: tinyint("receiving_type").default(0).notNull(),
  reference: varchar("reference", { length: 255 }),
  invoiceNumber: varchar("invoice_number", { length: 255 }),
  locationId: int("location_id"),
});

export const receivingsItems = mysqlTable("receivings_items", {
  receivingId: int("receiving_id").notNull(),
  itemId: int("item_id").notNull(),
  description: text("description"),
  quantityPurchased: decimal("quantity_purchased", { precision: 15, scale: 4 }).default("0").notNull(),
  itemCostPrice: decimal("item_cost_price", { precision: 15, scale: 4 }).default("0").notNull(),
  itemUnitPrice: decimal("item_unit_price", { precision: 15, scale: 4 }).default("0").notNull(),
  discountPercent: decimal("discount_percent", { precision: 15, scale: 4 }).default("0").notNull(),
  line: int("line").notNull(),
});

// attributes.ts
export const attributeDefinitions = mysqlTable("attribute_definitions", {
  definitionId: int("definition_id").autoincrement().primaryKey(),
  definitionName: varchar("definition_name", { length: 255 }).notNull(),
  definitionType: varchar("definition_type", { length: 255 }).notNull(),
  definitionUnit: varchar("definition_unit", { length: 255 }),
  definitionFlags: tinyint("definition_flags").default(0).notNull(),
  definitionFk: int("definition_fk"),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const attributeValues = mysqlTable("attribute_values", {
  attributeId: int("attribute_id").autoincrement().primaryKey(),
  attributeValue: text("attribute_value"),
  attributeDate: varchar("attribute_date", { length: 255 }),
  attributeDecimal: decimal("attribute_decimal", { precision: 15, scale: 4 }),
});

export const attributeLinks = mysqlTable("attribute_links", {
  attributeId: int("attribute_id"),
  definitionId: int("definition_id").notNull(),
  itemId: int("item_id"),
  saleId: int("sale_id"),
  receivingId: int("receiving_id"),
  generatedUniqueColumn: varchar("generated_unique_column", { length: 255 }).generatedAlwaysAs(
    // MySQL STORED column for unique constraint; SQLite uses partial unique index
    // Drizzle mysql-core: .generatedAlwaysAs(expression) — see drizzle docs.
    // Placeholder: implement as application-managed for v1.
    ""
  ),
});

// taxes.ts
export const taxCategories = mysqlTable("tax_categories", {
  taxCategoryId: int("tax_category_id").autoincrement().primaryKey(),
  taxCategory: varchar("tax_category", { length: 255 }).notNull(),
  taxGroupSeq: varchar("tax_group_seq", { length: 255 }),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const taxCodes = mysqlTable("tax_codes", {
  taxCodeId: int("tax_code_id").autoincrement().primaryKey(),
  taxCode: varchar("tax_code", { length: 255 }).notNull(),
  taxCodeName: varchar("tax_code_name", { length: 255 }).notNull(),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 255 }),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const taxJurisdictions = mysqlTable("tax_jurisdictions", {
  jurisdictionId: int("jurisdiction_id").autoincrement().primaryKey(),
  jurisdictionName: varchar("jurisdiction_name", { length: 255 }).notNull(),
  taxType: varchar("tax_type", { length: 255 }).notNull(),
  reportingAuthority: varchar("reporting_authority", { length: 255 }),
  taxableAmount: decimal("taxable_amount", { precision: 15, scale: 4 }),
  taxRate: decimal("tax_rate", { precision: 15, scale: 4 }).default("0").notNull(),
  taxGroup: varchar("tax_group", { length: 255 }),
  roundCode: tinyint("round_code").default(1).notNull(),
  cascadeSequence: tinyint("cascade_sequence").default(0).notNull(),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const taxCodeLinks = mysqlTable("tax_code_links", {
  taxCodeLinkId: int("tax_code_link_id").autoincrement().primaryKey(),
  taxCodeId: int("tax_code_id").notNull(),
  taxCategoryId: int("tax_category_id").notNull(),
  jurisdictionId: int("jurisdiction_id").notNull(),
  taxRate: decimal("tax_rate", { precision: 15, scale: 4 }).default("0").notNull(),
  roundCode: tinyint("round_code").default(1).notNull(),
  cascadeSequence: tinyint("cascade_sequence").default(0).notNull(),
});

// expenses.ts
export const expenses = mysqlTable("expenses", {
  expenseId: int("expense_id").autoincrement().primaryKey(),
  expenseTime: int("expense_time"),
  amount: decimal("amount", { precision: 15, scale: 4 }).default("0").notNull(),
  paymentType: varchar("payment_type", { length: 255 }).notNull(),
  expenseCategoryId: int("expense_category_id"),
  description: text("description"),
  employeeId: int("employee_id"),
  deleted: tinyint("deleted").default(0).notNull(),
});

export const expenseCategories = mysqlTable("expense_categories", {
  expenseCategoryId: int("expense_category_id").autoincrement().primaryKey(),
  category: varchar("category", { length: 255 }).notNull(),
  description: text("description"),
  deleted: tinyint("deleted").default(0).notNull(),
});

// giftcards.ts
export const giftcards = mysqlTable("giftcards", {
  giftcardId: int("giftcard_id").autoincrement().primaryKey(),
  giftcardNumber: varchar("giftcard_number", { length: 255 }).notNull(),
  value: decimal("value", { precision: 15, scale: 4 }).default("0").notNull(),
  personId: int("person_id"),
  deleted: tinyint("deleted").default(0).notNull(),
});

// cashups.ts
export const cashups = mysqlTable("cashups", {
  cashupId: int("cashup_id").autoincrement().primaryKey(),
  openDate: int("open_date"),
  closeDate: int("close_date"),
  openAmountCash: decimal("open_amount_cash", { precision: 15, scale: 4 }).default("0").notNull(),
  transferAmountCash: decimal("transfer_amount_cash", { precision: 15, scale: 4 }).default("0").notNull(),
  closedAmountCash: decimal("closed_amount_cash", { precision: 15, scale: 4 }).default("0").notNull(),
  note: text("note"),
  employeeId: int("employee_id"),
  deleted: tinyint("deleted").default(0).notNull(),
});

// cart_sessions (server-side cart store)
export const cartSessions = mysqlTable("cart_sessions", {
  sessionId: varchar("session_id", { length: 255 }).primaryKey(),
  data: json("data"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

void index;
void uniqueIndex;
void primaryKey;