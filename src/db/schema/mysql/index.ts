import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  decimal,
  float,
  foreignKey,
  index,
  int,
  primaryKey,
  smallint,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
  mysqlTable,
} from "drizzle-orm/mysql-core";

const dec = (name: string, precision: number, scale: number) =>
  decimal(name, { precision, scale, mode: "string" });

const blob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "blob";
  },
});

// ---------------------------------------------------------------------------
// Core identity / RBAC
// ---------------------------------------------------------------------------

export const modules = mysqlTable("ospos_modules", {
  moduleId: varchar("module_id", { length: 255 }).primaryKey(),
  nameLangKey: varchar("name_lang_key", { length: 255 }).notNull(),
  descLangKey: varchar("desc_lang_key", { length: 255 }).notNull(),
  sort: int("sort").notNull(),
}, (t) => [
  uniqueIndex("desc_lang_key").on(t.descLangKey),
  uniqueIndex("name_lang_key").on(t.nameLangKey),
]);

export const stockLocations = mysqlTable("ospos_stock_locations", {
  locationId: int("location_id").autoincrement().primaryKey(),
  locationName: varchar("location_name", { length: 255 }),
  deleted: boolean("deleted").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: tinyint("sort_order", { unsigned: true }),
}, (t) => [uniqueIndex("sort_order").on(t.sortOrder)]);

export const permissions = mysqlTable("ospos_permissions", {
  permissionId: varchar("permission_id", { length: 255 }).primaryKey(),
  moduleId: varchar("module_id", { length: 255 }).notNull(),
  locationId: int("location_id"),
}, (t) => [
  index("module_id").on(t.moduleId),
  foreignKey({
    name: "ospos_permissions_ibfk_1",
    columns: [t.moduleId],
    foreignColumns: [modules.moduleId],
  }).onDelete("cascade"),
  foreignKey({
    name: "ospos_permissions_ibfk_2",
    columns: [t.locationId],
    foreignColumns: [stockLocations.locationId],
  }).onDelete("cascade"),
]);

export const people = mysqlTable("ospos_people", {
  personId: int("person_id").autoincrement().primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  gender: int("gender"),
  phoneNumber: varchar("phone_number", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  address1: varchar("address_1", { length: 255 }).notNull(),
  address2: varchar("address_2", { length: 255 }).notNull(),
  city: varchar("city", { length: 255 }).notNull(),
  state: varchar("state", { length: 255 }).notNull(),
  zip: varchar("zip", { length: 255 }).notNull(),
  country: varchar("country", { length: 255 }).notNull(),
  comments: text("comments").notNull(),
}, (t) => [
  index("email").on(t.email),
  index("first_name").on(
    sql`${t.firstName}(191)`,
    sql`${t.lastName}(191)`,
    sql`${t.email}(191)`,
    sql`${t.phoneNumber}(191)`,
  ),
]);

export const employees = mysqlTable("ospos_employees", {
  personId: int("person_id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  deleted: boolean("deleted").notNull().default(false),
  hashVersion: tinyint("hash_version").notNull().default(2),
  language: varchar("language", { length: 48 }),
  languageCode: varchar("language_code", { length: 8 }),
}, (t) => [
  uniqueIndex("username").on(t.username),
  foreignKey({
    name: "ospos_employees_ibfk_1",
    columns: [t.personId],
    foreignColumns: [people.personId],
  }),
]);

export const grants = mysqlTable("ospos_grants", {
  permissionId: varchar("permission_id", { length: 255 }).notNull(),
  personId: int("person_id").notNull(),
  menuGroup: varchar("menu_group", { length: 32 }).default("home"),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.permissionId, t.personId] }),
  foreignKey({
    name: "ospos_grants_ibfk_1",
    columns: [t.permissionId],
    foreignColumns: [permissions.permissionId],
  }).onDelete("cascade"),
  foreignKey({
    name: "ospos_grants_ibfk_2",
    columns: [t.personId],
    foreignColumns: [employees.personId],
  }).onDelete("cascade"),
]);

export const sessions = mysqlTable("ospos_sessions", {
  id: varchar("id", { length: 128 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  timestamp: timestamp("timestamp", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  data: blob("data").notNull(),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.id, t.ipAddress] }),
  index("ospos_sessions_timestamp").on(t.timestamp),
]);

// ---------------------------------------------------------------------------
// Config / migrations
// ---------------------------------------------------------------------------

export const appConfig = mysqlTable("ospos_app_config", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: varchar("value", { length: 500 }).notNull(),
});

export const migrations = mysqlTable("ospos_migrations", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  version: varchar("version", { length: 255 }).notNull(),
  class: varchar("class", { length: 255 }).notNull(),
  group: varchar("group", { length: 255 }).notNull(),
  namespace: varchar("namespace", { length: 255 }).notNull(),
  time: int("time").notNull(),
  batch: int("batch", { unsigned: true }).notNull(),
});

// ---------------------------------------------------------------------------
// Taxes
// ---------------------------------------------------------------------------

export const taxCategories = mysqlTable("ospos_tax_categories", {
  taxCategoryId: int("tax_category_id").autoincrement().primaryKey(),
  taxCategory: varchar("tax_category", { length: 32 }).notNull(),
  taxGroupSequence: tinyint("tax_group_sequence").notNull(),
  deleted: boolean("deleted").notNull().default(false),
});

export const taxJurisdictions = mysqlTable("ospos_tax_jurisdictions", {
  jurisdictionId: int("jurisdiction_id").autoincrement().primaryKey(),
  jurisdictionName: varchar("jurisdiction_name", { length: 255 }),
  taxGroup: varchar("tax_group", { length: 32 }).notNull(),
  taxType: smallint("tax_type").notNull(),
  reportingAuthority: varchar("reporting_authority", { length: 255 }),
  taxGroupSequence: tinyint("tax_group_sequence").notNull().default(0),
  cascadeSequence: tinyint("cascade_sequence").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
}, (t) => [uniqueIndex("tax_jurisdictions_uq1").on(t.taxGroup)]);

export const taxCodes = mysqlTable("ospos_tax_codes", {
  taxCodeId: int("tax_code_id").autoincrement().primaryKey(),
  taxCode: varchar("tax_code", { length: 32 }).notNull(),
  taxCodeName: varchar("tax_code_name", { length: 255 }).notNull().default(""),
  city: varchar("city", { length: 255 }).notNull().default(""),
  state: varchar("state", { length: 255 }).notNull().default(""),
  deleted: boolean("deleted").notNull().default(false),
});

export const taxRates = mysqlTable("ospos_tax_rates", {
  taxRateId: int("tax_rate_id").autoincrement().primaryKey(),
  rateTaxCodeId: int("rate_tax_code_id").notNull(),
  rateTaxCategoryId: int("rate_tax_category_id").notNull(),
  rateJurisdictionId: int("rate_jurisdiction_id").notNull(),
  taxRate: dec("tax_rate", 15, 4).notNull().default("0.0000"),
  taxRoundingCode: tinyint("tax_rounding_code").notNull().default(0),
}, (t) => [
  index("rate_tax_code_id").on(t.rateTaxCodeId),
  index("rate_tax_category_id").on(t.rateTaxCategoryId),
  index("rate_jurisdiction_id").on(t.rateJurisdictionId),
  foreignKey({
    name: "ospos_tax_rates_ibfk_1",
    columns: [t.rateTaxCategoryId],
    foreignColumns: [taxCategories.taxCategoryId],
  }),
  foreignKey({
    name: "ospos_tax_rates_ibfk_2",
    columns: [t.rateTaxCodeId],
    foreignColumns: [taxCodes.taxCodeId],
  }),
  foreignKey({
    name: "ospos_tax_rates_ibfk_3",
    columns: [t.rateJurisdictionId],
    foreignColumns: [taxJurisdictions.jurisdictionId],
  }),
]);

// ---------------------------------------------------------------------------
// People: customers, suppliers, packages, rewards
// ---------------------------------------------------------------------------

export const customerPackages = mysqlTable("ospos_customers_packages", {
  packageId: int("package_id").autoincrement().primaryKey(),
  packageName: varchar("package_name", { length: 255 }),
  pointsPercent: float("points_percent").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
});

export const customers = mysqlTable("ospos_customers", {
  personId: int("person_id").primaryKey(),
  companyName: varchar("company_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 255 }),
  taxable: boolean("taxable").notNull().default(true),
  taxId: varchar("tax_id", { length: 32 }).notNull().default(""),
  salesTaxCodeId: int("sales_tax_code_id"),
  packageId: int("package_id"),
  points: int("points"),
  deleted: boolean("deleted").notNull().default(false),
  discount: dec("discount", 15, 2).notNull().default("0"),
  discountType: tinyint("discount_type").notNull().default(0),
  date: timestamp("date", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  employeeId: int("employee_id").notNull(),
  consent: boolean("consent").notNull().default(false),
}, (t) => [
  index("account_number").on(t.accountNumber),
  index("sales_tax_code_id").on(t.salesTaxCodeId),
  index("package_id").on(t.packageId),
  index("company_name").on(t.companyName),
  foreignKey({
    name: "ospos_customers_ibfk_1",
    columns: [t.personId],
    foreignColumns: [people.personId],
  }),
  foreignKey({
    name: "ospos_customers_ibfk_2",
    columns: [t.packageId],
    foreignColumns: [customerPackages.packageId],
  }),
  foreignKey({
    name: "ospos_customers_ibfk_3",
    columns: [t.salesTaxCodeId],
    foreignColumns: [taxCodes.taxCodeId],
  }),
]);

export const suppliers = mysqlTable("ospos_suppliers", {
  personId: int("person_id").primaryKey(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  agencyName: varchar("agency_name", { length: 255 }).notNull(),
  accountNumber: varchar("account_number", { length: 255 }),
  taxId: varchar("tax_id", { length: 32 }).notNull().default(""),
  deleted: boolean("deleted").notNull().default(false),
  category: tinyint("category").notNull(),
}, (t) => [
  uniqueIndex("account_number").on(t.accountNumber),
  index("category").on(t.category),
  index("company_name").on(t.companyName, t.deleted),
  foreignKey({
    name: "ospos_suppliers_ibfk_1",
    columns: [t.personId],
    foreignColumns: [people.personId],
  }),
]);

// ---------------------------------------------------------------------------
// Items, kits, inventory
// ---------------------------------------------------------------------------

export const items = mysqlTable("ospos_items", {
  itemId: int("item_id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  supplierId: int("supplier_id"),
  itemNumber: varchar("item_number", { length: 255 }),
  description: varchar("description", { length: 255 }).notNull(),
  costPrice: dec("cost_price", 15, 2).notNull(),
  unitPrice: dec("unit_price", 15, 2).notNull(),
  reorderLevel: dec("reorder_level", 15, 3).notNull().default("0"),
  receivingQuantity: dec("receiving_quantity", 15, 3).notNull().default("1"),
  picFilename: varchar("pic_filename", { length: 255 }),
  allowAltDescription: boolean("allow_alt_description").notNull(),
  isSerialized: boolean("is_serialized").notNull(),
  deleted: boolean("deleted").notNull().default(false),
  stockType: tinyint("stock_type").notNull().default(0),
  itemType: tinyint("item_type").notNull().default(0),
  taxCategoryId: int("tax_category_id"),
  qtyPerPack: dec("qty_per_pack", 15, 3).notNull().default("1"),
  packName: varchar("pack_name", { length: 8 }).default("Each"),
  lowSellItemId: int("low_sell_item_id").default(0),
  hsnCode: varchar("hsn_code", { length: 32 }).notNull().default(""),
}, (t) => [
  index("item_number").on(t.itemNumber),
  index("supplier_id").on(t.supplierId),
  index("deleted").on(t.deleted, t.itemType),
  index("item_id").on(t.itemId, t.deleted),
  uniqueIndex("items_uq1").on(t.supplierId, t.itemId, t.deleted, t.itemType),
  foreignKey({
    name: "ospos_items_ibfk_1",
    columns: [t.supplierId],
    foreignColumns: [suppliers.personId],
  }),
]);

export const itemsTaxes = mysqlTable("ospos_items_taxes", {
  itemId: int("item_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  percent: dec("percent", 15, 3).notNull(),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.itemId, t.name, t.percent] }),
  foreignKey({
    name: "ospos_items_taxes_ibfk_1",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }).onDelete("cascade"),
]);

export const itemQuantities = mysqlTable("ospos_item_quantities", {
  itemId: int("item_id").notNull(),
  locationId: int("location_id").notNull(),
  quantity: dec("quantity", 15, 3).notNull().default("0"),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.itemId, t.locationId] }),
  index("item_id").on(t.itemId),
  index("location_id").on(t.locationId),
  foreignKey({
    name: "ospos_item_quantities_ibfk_1",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }),
  foreignKey({
    name: "ospos_item_quantities_ibfk_2",
    columns: [t.locationId],
    foreignColumns: [stockLocations.locationId],
  }),
]);

export const inventory = mysqlTable("ospos_inventory", {
  transId: int("trans_id").autoincrement().primaryKey(),
  transItems: int("trans_items").notNull().default(0),
  transUser: int("trans_user").notNull().default(0),
  transDate: timestamp("trans_date", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  transComment: text("trans_comment").notNull(),
  transLocation: int("trans_location").notNull(),
  transInventory: dec("trans_inventory", 15, 3).notNull().default("0"),
}, (t) => [
  index("trans_items").on(t.transItems),
  index("trans_user").on(t.transUser),
  index("trans_location").on(t.transLocation),
  index("trans_date").on(t.transDate),
  index("trans_items_trans_date").on(t.transItems, t.transDate),
  foreignKey({
    name: "ospos_inventory_ibfk_1",
    columns: [t.transItems],
    foreignColumns: [items.itemId],
  }),
  foreignKey({
    name: "ospos_inventory_ibfk_2",
    columns: [t.transUser],
    foreignColumns: [employees.personId],
  }),
  foreignKey({
    name: "ospos_inventory_ibfk_3",
    columns: [t.transLocation],
    foreignColumns: [stockLocations.locationId],
  }),
]);

export const itemKits = mysqlTable("ospos_item_kits", {
  itemKitId: int("item_kit_id").autoincrement().primaryKey(),
  itemKitNumber: varchar("item_kit_number", { length: 255 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  itemId: int("item_id").notNull().default(0),
  kitDiscount: dec("kit_discount", 15, 2).notNull().default("0"),
  kitDiscountType: tinyint("kit_discount_type").notNull().default(0),
  priceOption: tinyint("price_option").notNull().default(0),
  printOption: tinyint("print_option").notNull().default(0),
}, (t) => [
  index("item_kit_number").on(t.itemKitNumber),
  index("name").on(t.name, t.description),
]);

export const itemKitItems = mysqlTable("ospos_item_kit_items", {
  itemKitId: int("item_kit_id").notNull(),
  itemId: int("item_id").notNull(),
  quantity: dec("quantity", 15, 3).notNull(),
  kitSequence: int("kit_sequence").notNull().default(0),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.itemKitId, t.itemId, t.quantity] }),
  foreignKey({
    name: "ospos_item_kit_items_ibfk_1",
    columns: [t.itemKitId],
    foreignColumns: [itemKits.itemKitId],
  }).onDelete("cascade"),
  foreignKey({
    name: "ospos_item_kit_items_ibfk_2",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }).onDelete("cascade"),
]);

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

export const attributeDefinitions = mysqlTable("ospos_attribute_definitions", {
  definitionId: int("definition_id").autoincrement().primaryKey(),
  definitionName: varchar("definition_name", { length: 255 }).notNull(),
  definitionType: varchar("definition_type", { length: 45 }).notNull(),
  definitionUnit: varchar("definition_unit", { length: 16 }),
  definitionFlags: tinyint("definition_flags").notNull(),
  definitionFk: int("definition_fk"),
  deleted: boolean("deleted").notNull().default(false),
}, (t) => [
  index("definition_fk").on(t.definitionFk),
  index("definition_name").on(t.definitionName),
  index("definition_type").on(t.definitionType),
  foreignKey({
    name: "fk_ospos_attribute_definitions_ibfk_1",
    columns: [t.definitionFk],
    foreignColumns: [t.definitionId],
  }),
]);

export const attributeValues = mysqlTable("ospos_attribute_values", {
  attributeId: int("attribute_id").autoincrement().primaryKey(),
  attributeValue: varchar("attribute_value", { length: 255 }),
  attributeDate: date("attribute_date", { mode: "string" }),
  attributeDecimal: dec("attribute_decimal", 7, 3),
}, (t) => [
  uniqueIndex("attribute_value").on(t.attributeValue),
  uniqueIndex("attribute_date").on(t.attributeDate),
  uniqueIndex("attribute_decimal").on(t.attributeDecimal),
]);

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export const dinnerTables = mysqlTable("ospos_dinner_tables", {
  dinnerTableId: int("dinner_table_id").autoincrement().primaryKey(),
  name: varchar("name", { length: 30 }).notNull(),
  status: tinyint("status").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
}, (t) => [index("status").on(t.status)]);

export const sales = mysqlTable("ospos_sales", {
  saleId: int("sale_id").autoincrement().primaryKey(),
  saleTime: timestamp("sale_time", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  customerId: int("customer_id"),
  employeeId: int("employee_id").notNull().default(0),
  comment: text("comment").notNull(),
  invoiceNumber: varchar("invoice_number", { length: 32 }),
  quoteNumber: varchar("quote_number", { length: 32 }),
  saleStatus: tinyint("sale_status").notNull().default(0),
  workOrderNumber: varchar("work_order_number", { length: 32 }),
  saleType: tinyint("sale_type").notNull().default(0),
  dinnerTableId: int("dinner_table_id"),
}, (t) => [
  uniqueIndex("invoice_number").on(t.invoiceNumber),
  index("customer_id").on(t.customerId),
  index("employee_id").on(t.employeeId),
  index("sale_time").on(t.saleTime),
  index("dinner_table_id").on(t.dinnerTableId),
  foreignKey({
    name: "ospos_sales_ibfk_1",
    columns: [t.employeeId],
    foreignColumns: [employees.personId],
  }),
  foreignKey({
    name: "ospos_sales_ibfk_2",
    columns: [t.customerId],
    foreignColumns: [customers.personId],
  }),
  foreignKey({
    name: "ospos_sales_ibfk_3",
    columns: [t.dinnerTableId],
    foreignColumns: [dinnerTables.dinnerTableId],
  }),
]);

export const salesItems = mysqlTable("ospos_sales_items", {
  saleId: int("sale_id").notNull().default(0),
  itemId: int("item_id").notNull().default(0),
  description: varchar("description", { length: 255 }),
  serialnumber: varchar("serialnumber", { length: 30 }),
  line: int("line").notNull().default(0),
  quantityPurchased: dec("quantity_purchased", 15, 3).notNull().default("0"),
  itemCostPrice: dec("item_cost_price", 15, 2).notNull(),
  itemUnitPrice: dec("item_unit_price", 15, 2).notNull(),
  discount: dec("discount", 15, 2).notNull().default("0"),
  discountType: tinyint("discount_type").notNull().default(0),
  itemLocation: int("item_location").notNull(),
  printOption: tinyint("print_option").notNull().default(0),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.saleId, t.itemId, t.line] }),
  index("sale_id").on(t.saleId),
  index("item_id").on(t.itemId),
  index("item_location").on(t.itemLocation),
  foreignKey({
    name: "ospos_sales_items_ibfk_1",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }),
  foreignKey({
    name: "ospos_sales_items_ibfk_2",
    columns: [t.saleId],
    foreignColumns: [sales.saleId],
  }),
  foreignKey({
    name: "ospos_sales_items_ibfk_3",
    columns: [t.itemLocation],
    foreignColumns: [stockLocations.locationId],
  }),
]);

export const salesItemsTaxes = mysqlTable("ospos_sales_items_taxes", {
  saleId: int("sale_id").notNull(),
  itemId: int("item_id").notNull(),
  line: int("line").notNull().default(0),
  name: varchar("name", { length: 255 }).notNull(),
  percent: dec("percent", 15, 4).notNull().default("0.0000"),
  taxType: tinyint("tax_type").notNull().default(0),
  roundingCode: tinyint("rounding_code").notNull().default(0),
  cascadeSequence: tinyint("cascade_sequence").notNull().default(0),
  itemTaxAmount: dec("item_tax_amount", 15, 4).notNull().default("0"),
  salesTaxCodeId: int("sales_tax_code_id"),
  jurisdictionId: int("jurisdiction_id"),
  taxCategoryId: int("tax_category_id"),
}, (t) => [
  primaryKey({
    name: "PRIMARY",
    columns: [t.saleId, t.itemId, t.line, t.name, t.percent],
  }),
  index("sale_id").on(t.saleId),
  index("item_id").on(t.itemId),
  foreignKey({
    name: "ospos_sales_items_taxes_ibfk_1",
    columns: [t.saleId, t.itemId, t.line],
    foreignColumns: [salesItems.saleId, salesItems.itemId, salesItems.line],
  }),
  foreignKey({
    name: "ospos_sales_items_taxes_ibfk_2",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }),
]);

export const salesPayments = mysqlTable("ospos_sales_payments", {
  paymentId: int("payment_id").autoincrement().primaryKey(),
  saleId: int("sale_id").notNull(),
  paymentType: varchar("payment_type", { length: 40 }).notNull(),
  paymentAmount: dec("payment_amount", 15, 2).notNull(),
  cashRefund: dec("cash_refund", 15, 2).notNull().default("0"),
  cashAdjustment: boolean("cash_adjustment").notNull().default(false),
  employeeId: int("employee_id"),
  paymentTime: timestamp("payment_time", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  referenceCode: varchar("reference_code", { length: 40 }).notNull().default(""),
}, (t) => [
  index("payment_sale").on(t.saleId, t.paymentType),
  index("employee_id").on(t.employeeId),
  index("payment_time").on(t.paymentTime),
  foreignKey({
    name: "ospos_sales_payments_ibfk_1",
    columns: [t.saleId],
    foreignColumns: [sales.saleId],
  }),
  foreignKey({
    name: "ospos_sales_payments_ibfk_2",
    columns: [t.employeeId],
    foreignColumns: [employees.personId],
  }),
]);

export const salesRewardPoints = mysqlTable("ospos_sales_reward_points", {
  id: int("id").autoincrement().primaryKey(),
  saleId: int("sale_id").notNull(),
  earned: float("earned").notNull(),
  used: float("used").notNull(),
}, (t) => [
  index("sale_id").on(t.saleId),
  foreignKey({
    name: "ospos_sales_reward_points_ibfk_1",
    columns: [t.saleId],
    foreignColumns: [sales.saleId],
  }),
]);

export const customersPoints = mysqlTable("ospos_customers_points", {
  id: int("id").autoincrement().primaryKey(),
  personId: int("person_id").notNull(),
  packageId: int("package_id").notNull(),
  saleId: int("sale_id").notNull(),
  pointsEarned: int("points_earned").notNull(),
}, (t) => [
  index("person_id").on(t.personId),
  index("package_id").on(t.packageId),
  index("sale_id").on(t.saleId),
  foreignKey({
    name: "ospos_customers_points_ibfk_1",
    columns: [t.personId],
    foreignColumns: [customers.personId],
  }),
  foreignKey({
    name: "ospos_customers_points_ibfk_2",
    columns: [t.packageId],
    foreignColumns: [customerPackages.packageId],
  }),
  foreignKey({
    name: "ospos_customers_points_ibfk_3",
    columns: [t.saleId],
    foreignColumns: [sales.saleId],
  }),
]);

export const salesTaxes = mysqlTable("ospos_sales_taxes", {
  salesTaxesId: int("sales_taxes_id").autoincrement().primaryKey(),
  saleId: int("sale_id").notNull(),
  jurisdictionId: int("jurisdiction_id"),
  taxCategoryId: int("tax_category_id"),
  taxType: smallint("tax_type").notNull(),
  taxGroup: varchar("tax_group", { length: 32 }).notNull(),
  saleTaxBasis: dec("sale_tax_basis", 15, 4).notNull(),
  saleTaxAmount: dec("sale_tax_amount", 15, 4).notNull(),
  printSequence: tinyint("print_sequence").notNull().default(0),
  name: varchar("name", { length: 255 }).notNull(),
  taxRate: dec("tax_rate", 15, 4).notNull(),
  salesTaxCodeId: int("sales_tax_code_id"),
  roundingCode: tinyint("rounding_code").notNull().default(0),
}, (t) => [
  index("print_sequence").on(t.saleId, t.printSequence, t.taxGroup),
]);

// ---------------------------------------------------------------------------
// Receivings
// ---------------------------------------------------------------------------

export const receivings = mysqlTable("ospos_receivings", {
  receivingId: int("receiving_id").autoincrement().primaryKey(),
  receivingTime: timestamp("receiving_time", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  supplierId: int("supplier_id"),
  employeeId: int("employee_id").notNull().default(0),
  comment: text("comment").notNull(),
  paymentType: varchar("payment_type", { length: 20 }),
  reference: varchar("reference", { length: 32 }),
}, (t) => [
  index("supplier_id").on(t.supplierId),
  index("employee_id").on(t.employeeId),
  index("reference").on(t.reference),
  index("receiving_time").on(t.receivingTime),
  foreignKey({
    name: "ospos_receivings_ibfk_1",
    columns: [t.employeeId],
    foreignColumns: [employees.personId],
  }),
  foreignKey({
    name: "ospos_receivings_ibfk_2",
    columns: [t.supplierId],
    foreignColumns: [suppliers.personId],
  }),
]);

export const receivingsItems = mysqlTable("ospos_receivings_items", {
  receivingId: int("receiving_id").notNull().default(0),
  itemId: int("item_id").notNull().default(0),
  description: varchar("description", { length: 30 }),
  serialnumber: varchar("serialnumber", { length: 30 }),
  line: int("line").notNull(),
  quantityPurchased: dec("quantity_purchased", 15, 3).notNull().default("0"),
  itemCostPrice: dec("item_cost_price", 15, 2).notNull(),
  itemUnitPrice: dec("item_unit_price", 15, 2).notNull(),
  discount: dec("discount", 15, 2).notNull().default("0"),
  discountType: tinyint("discount_type").notNull().default(0),
  itemLocation: int("item_location").notNull(),
  receivingQuantity: dec("receiving_quantity", 15, 3).notNull().default("1"),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.receivingId, t.itemId, t.line] }),
  index("item_id").on(t.itemId),
  foreignKey({
    name: "ospos_receivings_items_ibfk_1",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }),
  foreignKey({
    name: "ospos_receivings_items_ibfk_2",
    columns: [t.receivingId],
    foreignColumns: [receivings.receivingId],
  }),
]);

// ---------------------------------------------------------------------------
// Attribute links (needs items/sales/receivings)
// ---------------------------------------------------------------------------

export const attributeLinks = mysqlTable("ospos_attribute_links", {
  attributeId: int("attribute_id"),
  definitionId: int("definition_id").notNull(),
  itemId: int("item_id"),
  saleId: int("sale_id"),
  receivingId: int("receiving_id"),
  generatedUniqueColumn: varchar("generated_unique_column", { length: 255 }).generatedAlwaysAs(
    sql`CASE WHEN \`sale_id\` IS NULL AND \`receiving_id\` IS NULL AND \`item_id\` IS NOT NULL THEN CONCAT(\`definition_id\`, '-', \`item_id\`) ELSE NULL END`,
    { mode: "stored" },
  ),
}, (t) => [
  index("attribute_id").on(t.attributeId),
  index("definition_id").on(t.definitionId),
  index("item_id").on(t.itemId),
  index("sale_id").on(t.saleId),
  index("receiving_id").on(t.receivingId),
  uniqueIndex("attribute_links_uq1").on(
    t.attributeId,
    t.definitionId,
    t.itemId,
    t.saleId,
    t.receivingId,
  ),
  uniqueIndex("attribute_links_uq2").on(
    t.itemId,
    t.receivingId,
    t.saleId,
    t.definitionId,
    t.attributeId,
  ),
  uniqueIndex("attribute_links_uq3").on(t.generatedUniqueColumn),
  foreignKey({
    name: "ospos_attribute_links_ibfk_1",
    columns: [t.definitionId],
    foreignColumns: [attributeDefinitions.definitionId],
  }).onDelete("restrict"),
  foreignKey({
    name: "ospos_attribute_links_ibfk_2",
    columns: [t.attributeId],
    foreignColumns: [attributeValues.attributeId],
  }).onDelete("restrict"),
  foreignKey({
    name: "ospos_attribute_links_ibfk_3",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }),
  foreignKey({
    name: "ospos_attribute_links_ibfk_4",
    columns: [t.receivingId],
    foreignColumns: [receivings.receivingId],
  }),
  foreignKey({
    name: "ospos_attribute_links_ibfk_5",
    columns: [t.saleId],
    foreignColumns: [sales.saleId],
  }),
]);

// ---------------------------------------------------------------------------
// Ancillary: giftcards, expenses, cashups
// ---------------------------------------------------------------------------

export const giftcards = mysqlTable("ospos_giftcards", {
  giftcardId: int("giftcard_id").autoincrement().primaryKey(),
  recordTime: timestamp("record_time", { mode: "string" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  giftcardNumber: varchar("giftcard_number", { length: 255 }),
  value: dec("value", 15, 2).notNull(),
  deleted: boolean("deleted").notNull().default(false),
  personId: int("person_id"),
}, (t) => [
  uniqueIndex("giftcard_number").on(t.giftcardNumber),
  index("person_id").on(t.personId),
  foreignKey({
    name: "ospos_giftcards_ibfk_1",
    columns: [t.personId],
    foreignColumns: [people.personId],
  }),
]);

export const expenseCategories = mysqlTable("ospos_expense_categories", {
  expenseCategoryId: int("expense_category_id").autoincrement().primaryKey(),
  categoryName: varchar("category_name", { length: 255 }),
  categoryDescription: varchar("category_description", { length: 255 }).notNull(),
  deleted: boolean("deleted").notNull().default(false),
}, (t) => [
  uniqueIndex("category_name").on(t.categoryName),
  index("category_description").on(t.categoryDescription),
]);

export const expenses = mysqlTable("ospos_expenses", {
  expenseId: int("expense_id").autoincrement().primaryKey(),
  date: timestamp("date", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`),
  amount: dec("amount", 15, 2).notNull(),
  paymentType: varchar("payment_type", { length: 40 }).notNull(),
  expenseCategoryId: int("expense_category_id").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  employeeId: int("employee_id").notNull(),
  deleted: boolean("deleted").notNull().default(false),
  supplierTaxCode: varchar("supplier_tax_code", { length: 255 }),
  taxAmount: dec("tax_amount", 15, 2),
  supplierId: int("supplier_id"),
}, (t) => [
  index("expense_category_id").on(t.expenseCategoryId),
  index("employee_id").on(t.employeeId),
  index("date").on(t.date),
  index("payment_type").on(t.paymentType),
  index("amount").on(t.amount),
  foreignKey({
    name: "ospos_expenses_ibfk_1",
    columns: [t.expenseCategoryId],
    foreignColumns: [expenseCategories.expenseCategoryId],
  }),
  foreignKey({
    name: "ospos_expenses_ibfk_2",
    columns: [t.employeeId],
    foreignColumns: [employees.personId],
  }),
  foreignKey({
    name: "ospos_expenses_ibfk_3",
    columns: [t.supplierId],
    foreignColumns: [suppliers.personId],
  }),
]);

export const cashUp = mysqlTable("ospos_cash_up", {
  cashupId: int("cashup_id").autoincrement().primaryKey(),
  openDate: timestamp("open_date", { mode: "string" }).default(sql`CURRENT_TIMESTAMP`),
  closeDate: timestamp("close_date", { mode: "string" }),
  openAmountCash: dec("open_amount_cash", 15, 2).notNull(),
  transferAmountCash: dec("transfer_amount_cash", 15, 2).notNull(),
  note: boolean("note").notNull().default(false),
  closedAmountCash: dec("closed_amount_cash", 15, 2).notNull(),
  closedAmountCard: dec("closed_amount_card", 15, 2).notNull(),
  closedAmountCheck: dec("closed_amount_check", 15, 2).notNull(),
  closedAmountTotal: dec("closed_amount_total", 15, 2).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  openEmployeeId: int("open_employee_id").notNull(),
  closeEmployeeId: int("close_employee_id").notNull(),
  deleted: boolean("deleted").notNull().default(false),
  closedAmountDue: dec("closed_amount_due", 15, 2).notNull(),
}, (t) => [
  index("open_employee_id").on(t.openEmployeeId),
  index("close_employee_id").on(t.closeEmployeeId),
  foreignKey({
    name: "ospos_cash_up_ibfk_1",
    columns: [t.openEmployeeId],
    foreignColumns: [employees.personId],
  }),
  foreignKey({
    name: "ospos_cash_up_ibfk_2",
    columns: [t.closeEmployeeId],
    foreignColumns: [employees.personId],
  }),
]);
