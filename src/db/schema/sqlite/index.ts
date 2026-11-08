import { sql } from "drizzle-orm";
import {
  blob,
  foreignKey,
  index,
  integer,
  numeric,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * SQLite mirror of the final OSPOS MySQL schema.
 *
 * Logical names, nullability, defaults, primary keys, unique constraints and
 * foreign keys match `docs/reconstruction/11-database.md` §1.2 plus the
 * `sales_payments.cash_adjustment` column added by migration
 * `20201108100000_cashrounding.php`. SQLite has no DECIMAL/BLOB/TIMESTAMP
 * distinctions: money and quantities use NUMERIC affinity with string mode so
 * values round-trip at their stored scale, and timestamps are
 * `YYYY-MM-DD HH:MM:SS` text in the database's local timezone.
 */

const now = sql`(datetime('now','localtime'))`;
const dec = (name: string) => numeric(name);

// ---------------------------------------------------------------------------
// Core identity / RBAC
// ---------------------------------------------------------------------------

export const modules = sqliteTable("ospos_modules", {
  moduleId: text("module_id").primaryKey(),
  nameLangKey: text("name_lang_key").notNull(),
  descLangKey: text("desc_lang_key").notNull(),
  sort: integer("sort").notNull(),
}, (t) => [
  uniqueIndex("modules_desc_lang_key").on(t.descLangKey),
  uniqueIndex("modules_name_lang_key").on(t.nameLangKey),
]);

export const stockLocations = sqliteTable("ospos_stock_locations", {
  locationId: integer("location_id").primaryKey({ autoIncrement: true }),
  locationName: text("location_name"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order"),
}, (t) => [uniqueIndex("stock_locations_sort_order").on(t.sortOrder)]);

export const permissions = sqliteTable("ospos_permissions", {
  permissionId: text("permission_id").primaryKey(),
  moduleId: text("module_id").notNull(),
  locationId: integer("location_id"),
}, (t) => [
  index("stock_locations_module_id").on(t.moduleId),
  index("stock_locations_ospos_permissions_ibfk_2").on(t.locationId),
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

export const people = sqliteTable("ospos_people", {
  personId: integer("person_id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: integer("gender"),
  phoneNumber: text("phone_number").notNull(),
  email: text("email").notNull(),
  address1: text("address_1").notNull(),
  address2: text("address_2").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  country: text("country").notNull(),
  comments: text("comments").notNull(),
}, (t) => [
  index("people_email").on(t.email),
  index("people_first_name").on(t.firstName, t.lastName, t.email, t.phoneNumber),
]);

export const employees = sqliteTable("ospos_employees", {
  personId: integer("person_id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  hashVersion: integer("hash_version").notNull().default(2),
  language: text("language"),
  languageCode: text("language_code"),
}, (t) => [
  uniqueIndex("employees_username").on(t.username),
  foreignKey({
    name: "ospos_employees_ibfk_1",
    columns: [t.personId],
    foreignColumns: [people.personId],
  }),
]);

export const grants = sqliteTable("ospos_grants", {
  permissionId: text("permission_id").notNull(),
  personId: integer("person_id").notNull(),
  menuGroup: text("menu_group").default("home"),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.permissionId, t.personId] }),
  index("grants_ospos_grants_ibfk_2").on(t.personId),
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

export const sessions = sqliteTable("ospos_sessions", {
  id: text("id").notNull(),
  ipAddress: text("ip_address").notNull(),
  timestamp: text("timestamp").notNull().default(now),
  data: blob("data", { mode: "buffer" }).notNull(),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.id, t.ipAddress] }),
  index("sessions_ospos_sessions_timestamp").on(t.timestamp),
]);

// ---------------------------------------------------------------------------
// Config / migrations
// ---------------------------------------------------------------------------

export const appConfig = sqliteTable("ospos_app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const migrations = sqliteTable("ospos_migrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull(),
  class: text("class").notNull(),
  group: text("group").notNull(),
  namespace: text("namespace").notNull(),
  time: integer("time").notNull(),
  batch: integer("batch").notNull(),
});

// ---------------------------------------------------------------------------
// Taxes
// ---------------------------------------------------------------------------

export const taxCategories = sqliteTable("ospos_tax_categories", {
  taxCategoryId: integer("tax_category_id").primaryKey({ autoIncrement: true }),
  taxCategory: text("tax_category").notNull(),
  taxGroupSequence: integer("tax_group_sequence").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const taxJurisdictions = sqliteTable("ospos_tax_jurisdictions", {
  jurisdictionId: integer("jurisdiction_id").primaryKey({ autoIncrement: true }),
  jurisdictionName: text("jurisdiction_name"),
  taxGroup: text("tax_group").notNull(),
  taxType: integer("tax_type").notNull(),
  reportingAuthority: text("reporting_authority"),
  taxGroupSequence: integer("tax_group_sequence").notNull().default(0),
  cascadeSequence: integer("cascade_sequence").notNull().default(0),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
}, (t) => [uniqueIndex("app_config_tax_jurisdictions_uq1").on(t.taxGroup)]);

export const taxCodes = sqliteTable("ospos_tax_codes", {
  taxCodeId: integer("tax_code_id").primaryKey({ autoIncrement: true }),
  taxCode: text("tax_code").notNull(),
  taxCodeName: text("tax_code_name").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const taxRates = sqliteTable("ospos_tax_rates", {
  taxRateId: integer("tax_rate_id").primaryKey({ autoIncrement: true }),
  rateTaxCodeId: integer("rate_tax_code_id").notNull(),
  rateTaxCategoryId: integer("rate_tax_category_id").notNull(),
  rateJurisdictionId: integer("rate_jurisdiction_id").notNull(),
  taxRate: dec("tax_rate").notNull().default("0.0000"),
  taxRoundingCode: integer("tax_rounding_code").notNull().default(0),
}, (t) => [
  index("app_config_rate_tax_code_id").on(t.rateTaxCodeId),
  index("app_config_rate_tax_category_id").on(t.rateTaxCategoryId),
  index("app_config_rate_jurisdiction_id").on(t.rateJurisdictionId),
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

export const customerPackages = sqliteTable("ospos_customers_packages", {
  packageId: integer("package_id").primaryKey({ autoIncrement: true }),
  packageName: text("package_name"),
  pointsPercent: real("points_percent").notNull().default(0),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const customers = sqliteTable("ospos_customers", {
  personId: integer("person_id").primaryKey(),
  companyName: text("company_name"),
  accountNumber: text("account_number"),
  taxable: integer("taxable", { mode: "boolean" }).notNull().default(true),
  taxId: text("tax_id").notNull().default(""),
  salesTaxCodeId: integer("sales_tax_code_id"),
  packageId: integer("package_id"),
  points: integer("points"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  discount: dec("discount").notNull().default("0"),
  discountType: integer("discount_type").notNull().default(0),
  date: text("date").notNull().default(now),
  employeeId: integer("employee_id").notNull(),
  consent: integer("consent", { mode: "boolean" }).notNull().default(false),
}, (t) => [
  index("customers_packages_account_number").on(t.accountNumber),
  index("customers_packages_sales_tax_code_id").on(t.salesTaxCodeId),
  index("customers_packages_package_id").on(t.packageId),
  index("customers_packages_company_name").on(t.companyName),
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

export const suppliers = sqliteTable("ospos_suppliers", {
  personId: integer("person_id").primaryKey(),
  companyName: text("company_name").notNull(),
  agencyName: text("agency_name").notNull(),
  accountNumber: text("account_number"),
  taxId: text("tax_id").notNull().default(""),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  category: integer("category").notNull(),
}, (t) => [
  uniqueIndex("suppliers_account_number").on(t.accountNumber),
  index("suppliers_category").on(t.category),
  index("suppliers_company_name").on(t.companyName, t.deleted),
  foreignKey({
    name: "ospos_suppliers_ibfk_1",
    columns: [t.personId],
    foreignColumns: [people.personId],
  }),
]);

// ---------------------------------------------------------------------------
// Items, kits, inventory
// ---------------------------------------------------------------------------

export const items = sqliteTable("ospos_items", {
  itemId: integer("item_id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  supplierId: integer("supplier_id"),
  itemNumber: text("item_number"),
  description: text("description").notNull(),
  costPrice: dec("cost_price").notNull(),
  unitPrice: dec("unit_price").notNull(),
  reorderLevel: dec("reorder_level").notNull().default("0"),
  receivingQuantity: dec("receiving_quantity").notNull().default("1"),
  picFilename: text("pic_filename"),
  allowAltDescription: integer("allow_alt_description", { mode: "boolean" }).notNull(),
  isSerialized: integer("is_serialized", { mode: "boolean" }).notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  stockType: integer("stock_type").notNull().default(0),
  itemType: integer("item_type").notNull().default(0),
  taxCategoryId: integer("tax_category_id"),
  qtyPerPack: dec("qty_per_pack").notNull().default("1"),
  packName: text("pack_name").default("Each"),
  lowSellItemId: integer("low_sell_item_id").default(0),
  hsnCode: text("hsn_code").notNull().default(""),
}, (t) => [
  index("items_item_number").on(t.itemNumber),
  index("items_supplier_id").on(t.supplierId),
  index("items_deleted").on(t.deleted, t.itemType),
  index("items_item_id").on(t.itemId, t.deleted),
  uniqueIndex("items_items_uq1").on(t.supplierId, t.itemId, t.deleted, t.itemType),
  foreignKey({
    name: "ospos_items_ibfk_1",
    columns: [t.supplierId],
    foreignColumns: [suppliers.personId],
  }),
]);

export const itemsTaxes = sqliteTable("ospos_items_taxes", {
  itemId: integer("item_id").notNull(),
  name: text("name").notNull(),
  percent: dec("percent").notNull(),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.itemId, t.name, t.percent] }),
  foreignKey({
    name: "ospos_items_taxes_ibfk_1",
    columns: [t.itemId],
    foreignColumns: [items.itemId],
  }).onDelete("cascade"),
]);

export const itemQuantities = sqliteTable("ospos_item_quantities", {
  itemId: integer("item_id").notNull(),
  locationId: integer("location_id").notNull(),
  quantity: dec("quantity").notNull().default("0"),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.itemId, t.locationId] }),
  index("item_quantities_item_id").on(t.itemId),
  index("item_quantities_location_id").on(t.locationId),
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

export const inventory = sqliteTable("ospos_inventory", {
  transId: integer("trans_id").primaryKey({ autoIncrement: true }),
  transItems: integer("trans_items").notNull().default(0),
  transUser: integer("trans_user").notNull().default(0),
  transDate: text("trans_date").notNull().default(now),
  transComment: text("trans_comment").notNull(),
  transLocation: integer("trans_location").notNull(),
  transInventory: dec("trans_inventory").notNull().default("0"),
}, (t) => [
  index("inventory_trans_items").on(t.transItems),
  index("inventory_trans_user").on(t.transUser),
  index("inventory_trans_location").on(t.transLocation),
  index("inventory_trans_date").on(t.transDate),
  index("inventory_trans_items_trans_date").on(t.transItems, t.transDate),
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

export const itemKits = sqliteTable("ospos_item_kits", {
  itemKitId: integer("item_kit_id").primaryKey({ autoIncrement: true }),
  itemKitNumber: text("item_kit_number"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  itemId: integer("item_id").notNull().default(0),
  kitDiscount: dec("kit_discount").notNull().default("0"),
  kitDiscountType: integer("kit_discount_type").notNull().default(0),
  priceOption: integer("price_option").notNull().default(0),
  printOption: integer("print_option").notNull().default(0),
}, (t) => [
  index("item_kits_item_kit_number").on(t.itemKitNumber),
  index("item_kits_name").on(t.name, t.description),
]);

export const itemKitItems = sqliteTable("ospos_item_kit_items", {
  itemKitId: integer("item_kit_id").notNull(),
  itemId: integer("item_id").notNull(),
  quantity: dec("quantity").notNull(),
  kitSequence: integer("kit_sequence").notNull().default(0),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.itemKitId, t.itemId, t.quantity] }),
  index("item_kit_items_ospos_item_kit_items_ibfk_2").on(t.itemId),
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

export const attributeDefinitions = sqliteTable("ospos_attribute_definitions", {
  definitionId: integer("definition_id").primaryKey({ autoIncrement: true }),
  definitionName: text("definition_name").notNull(),
  definitionType: text("definition_type").notNull(),
  definitionUnit: text("definition_unit"),
  definitionFlags: integer("definition_flags").notNull(),
  definitionFk: integer("definition_fk"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
}, (t) => [
  index("attribute_definitions_definition_fk").on(t.definitionFk),
  index("attribute_definitions_definition_name").on(t.definitionName),
  index("attribute_definitions_definition_type").on(t.definitionType),
  foreignKey({
    name: "fk_ospos_attribute_definitions_ibfk_1",
    columns: [t.definitionFk],
    foreignColumns: [t.definitionId],
  }),
]);

export const attributeValues = sqliteTable("ospos_attribute_values", {
  attributeId: integer("attribute_id").primaryKey({ autoIncrement: true }),
  attributeValue: text("attribute_value"),
  attributeDate: text("attribute_date"),
  attributeDecimal: dec("attribute_decimal"),
}, (t) => [
  uniqueIndex("attribute_values_attribute_value").on(t.attributeValue),
  uniqueIndex("attribute_values_attribute_date").on(t.attributeDate),
  uniqueIndex("attribute_values_attribute_decimal").on(t.attributeDecimal),
]);

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export const dinnerTables = sqliteTable("ospos_dinner_tables", {
  dinnerTableId: integer("dinner_table_id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: integer("status").notNull().default(0),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
}, (t) => [index("dinner_tables_status").on(t.status)]);

export const sales = sqliteTable("ospos_sales", {
  saleId: integer("sale_id").primaryKey({ autoIncrement: true }),
  saleTime: text("sale_time").notNull().default(now),
  customerId: integer("customer_id"),
  employeeId: integer("employee_id").notNull().default(0),
  comment: text("comment").notNull(),
  invoiceNumber: text("invoice_number"),
  quoteNumber: text("quote_number"),
  saleStatus: integer("sale_status").notNull().default(0),
  workOrderNumber: text("work_order_number"),
  saleType: integer("sale_type").notNull().default(0),
  dinnerTableId: integer("dinner_table_id"),
}, (t) => [
  uniqueIndex("dinner_tables_invoice_number").on(t.invoiceNumber),
  index("dinner_tables_customer_id").on(t.customerId),
  index("dinner_tables_employee_id").on(t.employeeId),
  index("dinner_tables_sale_time").on(t.saleTime),
  index("dinner_tables_dinner_table_id").on(t.dinnerTableId),
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

export const salesItems = sqliteTable("ospos_sales_items", {
  saleId: integer("sale_id").notNull().default(0),
  itemId: integer("item_id").notNull().default(0),
  description: text("description"),
  serialnumber: text("serialnumber"),
  line: integer("line").notNull().default(0),
  quantityPurchased: dec("quantity_purchased").notNull().default("0"),
  itemCostPrice: dec("item_cost_price").notNull(),
  itemUnitPrice: dec("item_unit_price").notNull(),
  discount: dec("discount").notNull().default("0"),
  discountType: integer("discount_type").notNull().default(0),
  itemLocation: integer("item_location").notNull(),
  printOption: integer("print_option").notNull().default(0),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.saleId, t.itemId, t.line] }),
  index("sales_items_sale_id").on(t.saleId),
  index("sales_items_item_id").on(t.itemId),
  index("sales_items_item_location").on(t.itemLocation),
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

export const salesItemsTaxes = sqliteTable("ospos_sales_items_taxes", {
  saleId: integer("sale_id").notNull(),
  itemId: integer("item_id").notNull(),
  line: integer("line").notNull().default(0),
  name: text("name").notNull(),
  percent: dec("percent").notNull().default("0.0000"),
  taxType: integer("tax_type").notNull().default(0),
  roundingCode: integer("rounding_code").notNull().default(0),
  cascadeSequence: integer("cascade_sequence").notNull().default(0),
  itemTaxAmount: dec("item_tax_amount").notNull().default("0"),
  salesTaxCodeId: integer("sales_tax_code_id"),
  jurisdictionId: integer("jurisdiction_id"),
  taxCategoryId: integer("tax_category_id"),
}, (t) => [
  primaryKey({
    name: "PRIMARY",
    columns: [t.saleId, t.itemId, t.line, t.name, t.percent],
  }),
  index("sales_items_taxes_sale_id").on(t.saleId),
  index("sales_items_taxes_item_id").on(t.itemId),
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

export const salesPayments = sqliteTable("ospos_sales_payments", {
  paymentId: integer("payment_id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull(),
  paymentType: text("payment_type").notNull(),
  paymentAmount: dec("payment_amount").notNull(),
  cashRefund: dec("cash_refund").notNull().default("0"),
  cashAdjustment: integer("cash_adjustment", { mode: "boolean" }).notNull().default(false),
  employeeId: integer("employee_id"),
  paymentTime: text("payment_time").notNull().default(now),
  referenceCode: text("reference_code").notNull().default(""),
}, (t) => [
  index("sales_payments_payment_sale").on(t.saleId, t.paymentType),
  index("sales_payments_employee_id").on(t.employeeId),
  index("sales_payments_payment_time").on(t.paymentTime),
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

export const salesRewardPoints = sqliteTable("ospos_sales_reward_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull(),
  earned: real("earned").notNull(),
  used: real("used").notNull(),
}, (t) => [
  index("sales_reward_points_sale_id").on(t.saleId),
  foreignKey({
    name: "ospos_sales_reward_points_ibfk_1",
    columns: [t.saleId],
    foreignColumns: [sales.saleId],
  }),
]);

export const customersPoints = sqliteTable("ospos_customers_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id").notNull(),
  packageId: integer("package_id").notNull(),
  saleId: integer("sale_id").notNull(),
  pointsEarned: integer("points_earned").notNull(),
}, (t) => [
  index("customers_points_person_id").on(t.personId),
  index("customers_points_package_id").on(t.packageId),
  index("customers_points_sale_id").on(t.saleId),
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

export const salesTaxes = sqliteTable("ospos_sales_taxes", {
  salesTaxesId: integer("sales_taxes_id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull(),
  jurisdictionId: integer("jurisdiction_id"),
  taxCategoryId: integer("tax_category_id"),
  taxType: integer("tax_type").notNull(),
  taxGroup: text("tax_group").notNull(),
  saleTaxBasis: dec("sale_tax_basis").notNull(),
  saleTaxAmount: dec("sale_tax_amount").notNull(),
  printSequence: integer("print_sequence").notNull().default(0),
  name: text("name").notNull(),
  taxRate: dec("tax_rate").notNull(),
  salesTaxCodeId: integer("sales_tax_code_id"),
  roundingCode: integer("rounding_code").notNull().default(0),
}, (t) => [
  index("sales_taxes_print_sequence").on(t.saleId, t.printSequence, t.taxGroup),
]);

// ---------------------------------------------------------------------------
// Receivings
// ---------------------------------------------------------------------------

export const receivings = sqliteTable("ospos_receivings", {
  receivingId: integer("receiving_id").primaryKey({ autoIncrement: true }),
  receivingTime: text("receiving_time").notNull().default(now),
  supplierId: integer("supplier_id"),
  employeeId: integer("employee_id").notNull().default(0),
  comment: text("comment").notNull(),
  paymentType: text("payment_type"),
  reference: text("reference"),
}, (t) => [
  index("receivings_supplier_id").on(t.supplierId),
  index("receivings_employee_id").on(t.employeeId),
  index("receivings_reference").on(t.reference),
  index("receivings_receiving_time").on(t.receivingTime),
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

export const receivingsItems = sqliteTable("ospos_receivings_items", {
  receivingId: integer("receiving_id").notNull().default(0),
  itemId: integer("item_id").notNull().default(0),
  description: text("description"),
  serialnumber: text("serialnumber"),
  line: integer("line").notNull(),
  quantityPurchased: dec("quantity_purchased").notNull().default("0"),
  itemCostPrice: dec("item_cost_price").notNull(),
  itemUnitPrice: dec("item_unit_price").notNull(),
  discount: dec("discount").notNull().default("0"),
  discountType: integer("discount_type").notNull().default(0),
  itemLocation: integer("item_location").notNull(),
  receivingQuantity: dec("receiving_quantity").notNull().default("1"),
}, (t) => [
  primaryKey({ name: "PRIMARY", columns: [t.receivingId, t.itemId, t.line] }),
  index("receivings_items_item_id").on(t.itemId),
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

export const attributeLinks = sqliteTable("ospos_attribute_links", {
  attributeId: integer("attribute_id"),
  definitionId: integer("definition_id").notNull(),
  itemId: integer("item_id"),
  saleId: integer("sale_id"),
  receivingId: integer("receiving_id"),
}, (t) => [
  index("attribute_links_attribute_id").on(t.attributeId),
  index("attribute_links_definition_id").on(t.definitionId),
  index("attribute_links_item_id").on(t.itemId),
  index("attribute_links_sale_id").on(t.saleId),
  index("attribute_links_receiving_id").on(t.receivingId),
  uniqueIndex("attribute_links_attribute_links_uq1").on(
    t.attributeId,
    t.definitionId,
    t.itemId,
    t.saleId,
    t.receivingId,
  ),
  uniqueIndex("attribute_links_attribute_links_uq2").on(
    t.itemId,
    t.receivingId,
    t.saleId,
    t.definitionId,
    t.attributeId,
  ),
  uniqueIndex("attribute_links_attribute_links_uq3")
    .on(t.definitionId, t.itemId)
    .where(
      sql`${t.itemId} IS NOT NULL AND ${t.saleId} IS NULL AND ${t.receivingId} IS NULL`,
    ),
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

export const giftcards = sqliteTable("ospos_giftcards", {
  giftcardId: integer("giftcard_id").primaryKey({ autoIncrement: true }),
  recordTime: text("record_time").notNull().default(now),
  giftcardNumber: text("giftcard_number"),
  value: dec("value").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  personId: integer("person_id"),
}, (t) => [
  uniqueIndex("giftcards_giftcard_number").on(t.giftcardNumber),
  index("giftcards_person_id").on(t.personId),
  foreignKey({
    name: "ospos_giftcards_ibfk_1",
    columns: [t.personId],
    foreignColumns: [people.personId],
  }),
]);

export const expenseCategories = sqliteTable("ospos_expense_categories", {
  expenseCategoryId: integer("expense_category_id").primaryKey({ autoIncrement: true }),
  categoryName: text("category_name"),
  categoryDescription: text("category_description").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
}, (t) => [
  uniqueIndex("expense_categories_category_name").on(t.categoryName),
  index("expense_categories_category_description").on(t.categoryDescription),
]);

export const expenses = sqliteTable("ospos_expenses", {
  expenseId: integer("expense_id").primaryKey({ autoIncrement: true }),
  date: text("date").default(now),
  amount: dec("amount").notNull(),
  paymentType: text("payment_type").notNull(),
  expenseCategoryId: integer("expense_category_id").notNull(),
  description: text("description").notNull(),
  employeeId: integer("employee_id").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  supplierTaxCode: text("supplier_tax_code"),
  taxAmount: dec("tax_amount"),
  supplierId: integer("supplier_id"),
}, (t) => [
  index("expenses_expense_category_id").on(t.expenseCategoryId),
  index("expenses_employee_id").on(t.employeeId),
  index("expenses_date").on(t.date),
  index("expenses_payment_type").on(t.paymentType),
  index("expenses_amount").on(t.amount),
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

export const cashUp = sqliteTable("ospos_cash_up", {
  cashupId: integer("cashup_id").primaryKey({ autoIncrement: true }),
  openDate: text("open_date").default(now),
  closeDate: text("close_date"),
  openAmountCash: dec("open_amount_cash").notNull(),
  transferAmountCash: dec("transfer_amount_cash").notNull(),
  note: integer("note", { mode: "boolean" }).notNull().default(false),
  closedAmountCash: dec("closed_amount_cash").notNull(),
  closedAmountCard: dec("closed_amount_card").notNull(),
  closedAmountCheck: dec("closed_amount_check").notNull(),
  closedAmountTotal: dec("closed_amount_total").notNull(),
  description: text("description").notNull(),
  openEmployeeId: integer("open_employee_id").notNull(),
  closeEmployeeId: integer("close_employee_id").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  closedAmountDue: dec("closed_amount_due").notNull(),
}, (t) => [
  index("cash_up_open_employee_id").on(t.openEmployeeId),
  index("cash_up_close_employee_id").on(t.closeEmployeeId),
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
