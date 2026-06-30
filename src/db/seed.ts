import { createSqliteDb } from "@/lib/db/sqlite";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import path from "node:path";
import {
  people, employees, modules, permissions, grants, stockLocations, appConfig,
} from "@/db/schema";

const BCRYPT_COST = 10;

const APP_CONFIG_DEFAULTS: Record<string, string> = {
  company: "Open Source Point of Sale",
  address: "123 Main Street",
  phone: "555-555-5555",
  email: "admin@example.com",
  fax: "",
  website: "https://opensourcepos.org",
  return_policy: "Returns accepted within 30 days of purchase with receipt.",
  timezone: "UTC",
  default_tax_rate: "8",
  default_tax_1_name: "Sales Tax",
  default_tax_1_rate: "8",
  default_tax_2_name: "",
  default_tax_2_rate: "0",
  tax_included: "0",
  use_destination_based_tax: "0",
  currency_symbol: "$",
  number_locale: "en-US",
  thousands_separator: "1",
  currency_decimals: "2",
  tax_decimals: "2",
  quantity_decimals: "0",
  cash_decimals: "2",
  cash_rounding_code: "1",
  dateformat: "m/d/Y",
  timeformat: "H:i",
  language: "english",
  language_code: "en",
  country_codes: "US",
  barcode_content: "id",
  barcode_type: "C128",
  barcode_font: "Arial",
  barcode_font_size: "10",
  barcode_height: "50",
  barcode_width: "250",
  barcode_first_row: "name",
  barcode_second_row: "category",
  barcode_third_row: "cost_price",
  barcode_num_in_row: "2",
  barcode_page_width: "150",
  barcode_page_cellspacing: "5",
  barcode_generate_if_empty: "1",
  receipt_template: "receipt_default",
  receipt_show_taxes: "0",
  receipt_show_total_discount: "1",
  receipt_show_description: "1",
  receipt_show_serialnumber: "0",
  print_silently: "1",
  print_header: "",
  print_footer: "",
  print_top_margin: "0",
  print_left_margin: "0",
  print_bottom_margin: "0",
  print_right_margin: "0",
  invoice_enable: "1",
  sales_invoice_format: "{CO}",
  recv_invoice_format: "{CO}",
  invoice_email_message: "Invoice attached",
  invoice_default_comments: "",
  invoice_type: "invoice",
  last_used_invoice_number: "0",
  last_used_quote_number: "0",
  last_used_work_order_number: "0",
  receipt_invoice_count: "0",
  receipt_quote_count: "0",
  default_sales_discount: "0",
  lines_per_page: "25",
  payment_options_order: "cashdebitcreditcheckdue",
  dinner_table_enable: "0",
  multi_pack_enabled: "0",
  gcaptcha_enable: "0",
  statistics: "1",
  theme: "flatly",
  allow_duplicate_barcodes: "0",
  msg_msg: "",
  msg_uid: "",
  msg_src: "",
  msg_pwd: "",
  protocol: "mail",
  mailpath: "/usr/sbin/sendmail",
  smtp_host: "",
  smtp_port: "587",
  smtp_timeout: "5",
  smtp_crypto: "tls",
  smtp_user: "",
  smtp_pass: "",
  mailchimp_api_key: "",
  mailchimp_list_id: "",
  notify_horizontal_position: "right",
  notify_vertical_position: "top",
  include_hsn: "0",
};

const MODULE_DEFS = [
  { id: "config", name: "Config", desc: "Config", sort: 0 },
  { id: "customers", name: "Customers", desc: "Customers", sort: 0 },
  { id: "employees", name: "Employees", desc: "Employees", sort: 0 },
  { id: "giftcards", name: "Gift Cards", desc: "Gift Cards", sort: 0 },
  { id: "items", name: "Items", desc: "Items", sort: 0 },
  { id: "item_kits", name: "Item Kits", desc: "Item Kits", sort: 0 },
  { id: "messages", name: "Messages", desc: "Messages", sort: 0 },
  { id: "receivings", name: "Receivings", desc: "Receivings", sort: 0 },
  { id: "reports", name: "Reports", desc: "Reports", sort: 0 },
  { id: "sales", name: "Sales", desc: "Sales", sort: 0 },
  { id: "suppliers", name: "Suppliers", desc: "Suppliers", sort: 0 },
  { id: "office", name: "Office", desc: "Office group", sort: 999 },
  { id: "home", name: "Home", desc: "Home", sort: 0 },
  { id: "attributes", name: "Attributes", desc: "Attributes", sort: 0 },
  { id: "expenses", name: "Expenses", desc: "Expenses", sort: 0 },
  { id: "expenses_categories", name: "Expense Categories", desc: "Expense Categories", sort: 0 },
  { id: "taxes", name: "Taxes", desc: "Taxes", sort: 0 },
  { id: "cashups", name: "Cashups", desc: "Cashups", sort: 0 },
];

const PERMISSION_DEFS = [
  { id: "config", moduleId: "config" },
  { id: "customers", moduleId: "customers" },
  { id: "employees", moduleId: "employees" },
  { id: "giftcards", moduleId: "giftcards" },
  { id: "items", moduleId: "items" },
  { id: "item_kits", moduleId: "item_kits" },
  { id: "messages", moduleId: "messages" },
  { id: "receivings", moduleId: "receivings" },
  { id: "reports", moduleId: "reports" },
  { id: "reports_sales", moduleId: "reports" },
  { id: "reports_receivings", moduleId: "reports" },
  { id: "reports_items", moduleId: "reports" },
  { id: "reports_inventory", moduleId: "reports" },
  { id: "reports_customers", moduleId: "reports" },
  { id: "reports_suppliers", moduleId: "reports" },
  { id: "reports_employees", moduleId: "reports" },
  { id: "reports_expenses", moduleId: "reports" },
  { id: "reports_taxes", moduleId: "reports" },
  { id: "reports_discounts", moduleId: "reports" },
  { id: "reports_payments", moduleId: "reports" },
  { id: "reports_cashups", moduleId: "reports" },
  { id: "reports_categories", moduleId: "reports" },
  { id: "items_stock", moduleId: "items", locationId: 1 },
  { id: "sales_stock", moduleId: "sales", locationId: 1 },
  { id: "receivings_stock", moduleId: "receivings", locationId: 1 },
  { id: "sales_delete", moduleId: "sales" },
  { id: "sales_change_price", moduleId: "sales" },
  { id: "sales", moduleId: "sales" },
  { id: "office", moduleId: "office" },
  { id: "home", moduleId: "home" },
  { id: "module_home", moduleId: "home" },
  { id: "suppliers", moduleId: "suppliers" },
  { id: "attributes", moduleId: "attributes" },
  { id: "expenses", moduleId: "expenses" },
  { id: "expenses_categories", moduleId: "expenses_categories" },
  { id: "taxes", moduleId: "taxes" },
  { id: "cashups", moduleId: "cashups" },
];

export async function seedDatabase() {
  const db = createSqliteDb();
  const migrationsFolder = path.resolve(process.cwd(), "drizzle/sqlite");
  console.log("Running migrations...");
  migrate(db, { migrationsFolder });

  const existing = db.select().from(employees).where(eq(employees.username, "admin")).get();
  if (existing) {
    console.log("Seed already present; skipping.");
    return existing.personId;
  }

  console.log("Seeding initial data...");
  const adminHash = await hash("pointofsale", BCRYPT_COST);

  const adminPerson = db.insert(people).values({
    firstName: "John",
    lastName: "Doe",
    email: "admin@example.com",
  }).returning().get();

  db.insert(employees).values({
    personId: adminPerson.personId,
    username: "admin",
    password: adminHash,
    hashVersion: 2,
    deleted: false,
  }).run();

  db.insert(stockLocations).values({
    locationName: "stock",
    deleted: false,
  }).run();

  for (const m of MODULE_DEFS) {
    db.insert(modules).values({
      moduleId: m.id,
      nameLangKey: m.name,
      descLangKey: m.desc,
      sort: m.sort,
    }).run();
  }

  for (const p of PERMISSION_DEFS) {
    db.insert(permissions).values({
      permissionId: p.id,
      moduleId: p.moduleId,
    }).run();
  }

  for (const p of PERMISSION_DEFS) {
    db.insert(grants).values({
      permissionId: p.id,
      personId: adminPerson.personId,
      menuGroup: "both",
    }).run();
  }

  for (const [key, value] of Object.entries(APP_CONFIG_DEFAULTS)) {
    db.insert(appConfig).values({ key, value }).onConflictDoUpdate({
      target: appConfig.key,
      set: { value },
    }).run();
  }

  console.log("Seed complete. Admin login: admin / pointofsale");
  return adminPerson.personId;
}

async function main() {
  await seedDatabase();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});