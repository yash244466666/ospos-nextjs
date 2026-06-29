import { sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";

export interface ReportColumn { name: string; label: string; align?: "left" | "right"; }

export interface ReportDef {
  key: string;
  title: string;
  permission: string; // top-level grant, e.g. "reports_sales"
  hasDateRange?: boolean;
  columns: ReportColumn[];
  chart?: "bar" | "hbar" | "line" | "pie";
  /** SQL template. Use ${start} and ${end} placeholders for date range (unix timestamps). */
  buildSql: (filters: { start?: number; end?: number }) => ReturnType<typeof sql>;
}

function ts(d: string | undefined, end: boolean): number | undefined {
  if (!d) return undefined;
  const t = new Date(d + (end ? "T23:59:59" : "T00:00:00")).getTime() / 1000;
  return Number.isNaN(t) ? undefined : Math.floor(t);
}

export function runReport(def: ReportDef, filters: { start?: string; end?: string }): Record<string, unknown>[] {
  const start = ts(filters.start, false);
  const end = ts(filters.end, true);
  const db = getDbSync();
  const query = def.buildSql({ start, end });
  return db.all(query) as Record<string, unknown>[];
}

export const REPORTS: ReportDef[] = [
  {
    key: "summary_sales",
    title: "Summary Sales (by day)",
    permission: "reports_sales",
    hasDateRange: true,
    columns: [
      { name: "sale_date", label: "Date" },
      { name: "count", label: "Sales", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT date(s.sale_time, 'unixepoch') AS sale_date,
        COUNT(*) AS count, SUM(si.subtotal) AS total
      FROM sales s
      JOIN (SELECT sale_id,
              SUM(quantity_purchased * item_unit_price - (CASE WHEN discount_type = 0 THEN quantity_purchased * item_unit_price * discount / 100 ELSE discount END)) AS subtotal
            FROM sales_items GROUP BY sale_id) si ON si.sale_id = s.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY sale_date ORDER BY sale_date DESC`,
  },
  {
    key: "detailed_sales",
    title: "Detailed Sales",
    permission: "reports_sales",
    hasDateRange: true,
    columns: [
      { name: "sale_id", label: "Sale ID", align: "right" },
      { name: "sale_time", label: "Date" },
      { name: "item_name", label: "Item" },
      { name: "quantity", label: "Qty", align: "right" },
      { name: "unit_price", label: "Price", align: "right" },
      { name: "subtotal", label: "Subtotal", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT s.sale_id, s.sale_time, i.name AS item_name,
        si.quantity_purchased, si.item_unit_price, (si.quantity_purchased * si.item_unit_price * (CASE WHEN si.discount_type = 0 THEN 1 - si.discount/100 ELSE 1 END) - (CASE WHEN si.discount_type = 1 THEN si.discount ELSE 0 END)) AS subtotal
      FROM sales s
      JOIN sales_items si ON si.sale_id = s.sale_id
      JOIN items i ON i.item_id = si.item_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      ORDER BY s.sale_time DESC LIMIT 500`,
  },
  {
    key: "summary_payments",
    title: "Summary Payments",
    permission: "reports_payments",
    hasDateRange: true,
    columns: [
      { name: "payment_type", label: "Type" },
      { name: "count", label: "Count", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT sp.payment_type, COUNT(*) AS count, SUM(sp.payment_amount) AS total
      FROM sales_payments sp
      JOIN sales s ON s.sale_id = sp.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY sp.payment_type ORDER BY total DESC`,
  },
  {
    key: "detailed_payments",
    title: "Detailed Payments",
    permission: "reports_payments",
    hasDateRange: true,
    columns: [
      { name: "sale_id", label: "Sale ID", align: "right" },
      { name: "sale_time", label: "Date" },
      { name: "payment_type", label: "Type" },
      { name: "payment_amount", label: "Amount", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT s.sale_id, s.sale_time, sp.payment_type, sp.payment_amount
      FROM sales_payments sp
      JOIN sales s ON s.sale_id = sp.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      ORDER BY s.sale_time DESC LIMIT 500`,
  },
  {
    key: "detailed_receivings",
    title: "Detailed Receivings",
    permission: "reports_receivings",
    hasDateRange: true,
    columns: [
      { name: "receiving_id", label: "Recv ID", align: "right" },
      { name: "receiving_time", label: "Date" },
      { name: "item_name", label: "Item" },
      { name: "quantity", label: "Qty", align: "right" },
      { name: "item_unit_price", label: "Cost", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT r.receiving_id, r.receiving_time, i.name AS item_name,
        ri.quantity_purchased, ri.item_unit_price
      FROM receivings r
      JOIN receivings_items ri ON ri.receiving_id = r.receiving_id
      JOIN items i ON i.item_id = ri.item_id
      WHERE 1=1
        ${start !== undefined ? sql`AND r.receiving_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND r.receiving_time <= ${end}` : sql``}
      ORDER BY r.receiving_time DESC LIMIT 500`,
  },
  {
    key: "inventory_summary",
    title: "Inventory Summary",
    permission: "reports_inventory",
    hasDateRange: false,
    columns: [
      { name: "item_name", label: "Item" },
      { name: "item_number", label: "Number" },
      { name: "quantity", label: "Quantity", align: "right" },
    ],
    buildSql: () => sql`SELECT i.name AS item_name, i.item_number, COALESCE(q.quantity, 0) AS quantity
      FROM items i
      LEFT JOIN item_quantities q ON q.item_id = i.item_id
      WHERE i.deleted = 0
      ORDER BY i.name LIMIT 500`,
  },
  {
    key: "inventory_low",
    title: "Low Inventory",
    permission: "reports_inventory",
    hasDateRange: false,
    columns: [
      { name: "item_name", label: "Item" },
      { name: "quantity", label: "Quantity", align: "right" },
      { name: "reorder_level", label: "Reorder", align: "right" },
    ],
    buildSql: () => sql`SELECT i.name AS item_name, COALESCE(q.quantity, 0) AS quantity, i.reorder_level
      FROM items i
      LEFT JOIN item_quantities q ON q.item_id = i.item_id
      WHERE i.deleted = 0 AND COALESCE(q.quantity, 0) <= i.reorder_level
      ORDER BY (q.quantity - i.reorder_level) ASC LIMIT 500`,
  },
  {
    key: "summary_customers",
    title: "Summary Customers",
    permission: "reports_customers",
    hasDateRange: true,
    columns: [
      { name: "customer_name", label: "Customer" },
      { name: "count", label: "Sales", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT COALESCE(p.first_name || ' ' || p.last_name, '') AS customer_name,
        COUNT(*) AS count, SUM(si.subtotal) AS total
      FROM sales s
      LEFT JOIN people p ON p.person_id = s.customer_id
      JOIN (SELECT sale_id, SUM(quantity_purchased * item_unit_price - (CASE WHEN discount_type = 0 THEN quantity_purchased * item_unit_price * discount / 100 ELSE discount END)) AS subtotal FROM sales_items GROUP BY sale_id) si ON si.sale_id = s.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY customer_name ORDER BY total DESC LIMIT 500`,
  },
  {
    key: "summary_employees",
    title: "Summary Employees",
    permission: "reports_employees",
    hasDateRange: true,
    columns: [
      { name: "employee_name", label: "Employee" },
      { name: "count", label: "Sales", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT COALESCE(p.first_name || ' ' || p.last_name, '') AS employee_name,
        COUNT(*) AS count, SUM(si.subtotal) AS total
      FROM sales s
      LEFT JOIN people p ON p.person_id = s.employee_id
      JOIN (SELECT sale_id, SUM(quantity_purchased * item_unit_price - (CASE WHEN discount_type = 0 THEN quantity_purchased * item_unit_price * discount / 100 ELSE discount END)) AS subtotal FROM sales_items GROUP BY sale_id) si ON si.sale_id = s.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY employee_name ORDER BY total DESC LIMIT 500`,
  },
  {
    key: "summary_suppliers",
    title: "Summary Suppliers",
    permission: "reports_suppliers",
    hasDateRange: true,
    columns: [
      { name: "supplier_name", label: "Supplier" },
      { name: "count", label: "Receivings", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT COALESCE(p.first_name || ' ' || p.last_name, p.company_name, '') AS supplier_name,
        COUNT(*) AS count, SUM(ri.quantity_purchased * ri.item_unit_price) AS total
      FROM receivings r
      LEFT JOIN people p ON p.person_id = r.supplier_id
      JOIN receivings_items ri ON ri.receiving_id = r.receiving_id
      WHERE 1=1
        ${start !== undefined ? sql`AND r.receiving_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND r.receiving_time <= ${end}` : sql``}
      GROUP BY supplier_name ORDER BY total DESC LIMIT 500`,
  },
  {
    key: "summary_categories",
    title: "Summary Categories",
    permission: "reports_items",
    hasDateRange: true,
    columns: [
      { name: "category", label: "Category" },
      { name: "count", label: "Sales", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT i.category, COUNT(*) AS count, SUM(si.quantity_purchased * si.item_unit_price * (CASE WHEN si.discount_type = 0 THEN 1 - si.discount/100 ELSE 1 END) - (CASE WHEN si.discount_type = 1 THEN si.discount ELSE 0 END)) AS total
      FROM sales s
      JOIN sales_items si ON si.sale_id = s.sale_id
      JOIN items i ON i.item_id = si.item_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY i.category ORDER BY total DESC`,
  },
  {
    key: "summary_taxes",
    title: "Summary Taxes",
    permission: "reports_taxes",
    hasDateRange: true,
    columns: [
      { name: "tax_name", label: "Tax" },
      { name: "total", label: "Collected", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT st.name AS tax_name, SUM(st.amount) AS total
      FROM sales_taxes st
      JOIN sales s ON s.sale_id = st.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY st.name ORDER BY total DESC`,
  },
  {
    key: "summary_discounts",
    title: "Summary Discounts",
    permission: "reports_discounts",
    hasDateRange: true,
    columns: [
      { name: "discount_percent", label: "Discount %", align: "right" },
      { name: "count", label: "Lines", align: "right" },
      { name: "total", label: "Total Discount", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT si.discount, si.discount_type, COUNT(*) AS count,
        SUM(CASE WHEN si.discount_type = 0 THEN si.quantity_purchased * si.item_unit_price * si.discount / 100 ELSE si.discount END) AS total
      FROM sales_items si
      JOIN sales s ON s.sale_id = si.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY si.discount, si.discount_type ORDER BY total DESC`,
  },
  {
    key: "summary_expenses",
    title: "Summary Expenses",
    permission: "reports_expenses",
    hasDateRange: true,
    columns: [
      { name: "expense_category", label: "Category" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT ec.category AS expense_category, SUM(e.amount) AS total
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.expense_category_id = e.expense_category_id
      WHERE e.deleted = 0
        ${start !== undefined ? sql`AND e.expense_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND e.expense_time <= ${end}` : sql``}
      GROUP BY expense_category ORDER BY total DESC`,
  },
  {
    key: "summary_expenses_categories",
    title: "Summary Expenses by Category",
    permission: "reports_expenses",
    hasDateRange: true,
    columns: [
      { name: "category", label: "Category" },
      { name: "count", label: "Entries", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT ec.category, COUNT(*) AS count, SUM(e.amount) AS total
      FROM expenses e
      JOIN expense_categories ec ON ec.expense_category_id = e.expense_category_id
      WHERE e.deleted = 0
        ${start !== undefined ? sql`AND e.expense_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND e.expense_time <= ${end}` : sql``}
      GROUP BY ec.category ORDER BY total DESC`,
  },
  {
    key: "summary_cashups",
    title: "Summary Cashups",
    permission: "reports_cashups",
    hasDateRange: true,
    columns: [
      { name: "open_date", label: "Open Date" },
      { name: "open_amount_cash", label: "Open Cash", align: "right" },
      { name: "closed_amount_cash", label: "Closed Cash", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT c.open_date, c.open_amount_cash, c.closed_amount_cash
      FROM cashups c
      WHERE c.deleted = 0
        ${start !== undefined ? sql`AND c.open_date >= ${start}` : sql``}
        ${end !== undefined ? sql`AND c.open_date <= ${end}` : sql``}
      ORDER BY c.open_date DESC LIMIT 500`,
  },
  {
    key: "summary_giftcards",
    title: "Summary Giftcards",
    permission: "reports_giftcards",
    hasDateRange: false,
    columns: [
      { name: "giftcard_number", label: "Number" },
      { name: "value", label: "Value", align: "right" },
    ],
    buildSql: () => sql`SELECT g.giftcard_number, g.value
      FROM giftcards g
      WHERE g.deleted = 0
      ORDER BY g.giftcard_number LIMIT 500`,
  },
  {
    key: "specific_customer",
    title: "Specific Customer",
    permission: "reports_customers",
    hasDateRange: true,
    columns: [
      { name: "sale_id", label: "Sale ID", align: "right" },
      { name: "sale_time", label: "Date" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT s.sale_id, s.sale_time, SUM(si.quantity_purchased * si.item_unit_price * (CASE WHEN si.discount_type = 0 THEN 1 - si.discount/100 ELSE 1 END) - (CASE WHEN si.discount_type = 1 THEN si.discount ELSE 0 END)) AS total
      FROM sales s
      JOIN sales_items si ON si.sale_id = s.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY s.sale_id ORDER BY s.sale_time DESC LIMIT 500`,
  },
  {
    key: "specific_employee",
    title: "Specific Employee",
    permission: "reports_employees",
    hasDateRange: true,
    columns: [
      { name: "sale_id", label: "Sale ID", align: "right" },
      { name: "sale_time", label: "Date" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT s.sale_id, s.sale_time, SUM(si.quantity_purchased * si.item_unit_price * (CASE WHEN si.discount_type = 0 THEN 1 - si.discount/100 ELSE 1 END) - (CASE WHEN si.discount_type = 1 THEN si.discount ELSE 0 END)) AS total
      FROM sales s
      JOIN sales_items si ON si.sale_id = s.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY s.sale_id ORDER BY s.sale_time DESC LIMIT 500`,
  },
  {
    key: "specific_supplier",
    title: "Specific Supplier",
    permission: "reports_suppliers",
    hasDateRange: true,
    columns: [
      { name: "receiving_id", label: "Recv ID", align: "right" },
      { name: "receiving_time", label: "Date" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT r.receiving_id, r.receiving_time, SUM(ri.quantity_purchased * ri.item_unit_price) AS total
      FROM receivings r
      JOIN receivings_items ri ON ri.receiving_id = r.receiving_id
      WHERE 1=1
        ${start !== undefined ? sql`AND r.receiving_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND r.receiving_time <= ${end}` : sql``}
      GROUP BY r.receiving_id ORDER BY r.receiving_time DESC LIMIT 500`,
  },
  {
    key: "specific_discount",
    title: "Specific Discount",
    permission: "reports_discounts",
    hasDateRange: true,
    columns: [
      { name: "sale_id", label: "Sale ID", align: "right" },
      { name: "discount_percent", label: "Discount %", align: "right" },
      { name: "total", label: "Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT s.sale_id, si.discount, si.discount_type,
        (CASE WHEN si.discount_type = 0 THEN si.quantity_purchased * si.item_unit_price * si.discount / 100 ELSE si.discount END) AS total
      FROM sales s
      JOIN sales_items si ON si.sale_id = s.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      ORDER BY s.sale_time DESC LIMIT 500`,
  },
  {
    key: "summary_items",
    title: "Summary Items Sold",
    permission: "reports_items",
    hasDateRange: true,
    columns: [
      { name: "item_name", label: "Item" },
      { name: "item_number", label: "Number" },
      { name: "quantity", label: "Qty Sold", align: "right" },
      { name: "subtotal", label: "Subtotal", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT i.name AS item_name, i.item_number,
        SUM(si.quantity_purchased) AS quantity,
        SUM(si.quantity_purchased * si.item_unit_price - (CASE WHEN si.discount_type = 0 THEN si.quantity_purchased * si.item_unit_price * si.discount / 100 ELSE si.discount END)) AS subtotal
      FROM sales_items si
      JOIN sales s ON s.sale_id = si.sale_id
      JOIN items i ON i.item_id = si.item_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY i.item_id ORDER BY subtotal DESC LIMIT 500`,
  },
  {
    key: "summary_sales_taxes",
    title: "Summary Sales Taxes Collected",
    permission: "reports_taxes",
    hasDateRange: true,
    columns: [
      { name: "name", label: "Tax" },
      { name: "count", label: "Lines", align: "right" },
      { name: "total", label: "Tax Total", align: "right" },
    ],
    buildSql: ({ start, end }) => sql`SELECT sit.name, COUNT(*) AS count, SUM(sit.item_tax_amount) AS total
      FROM sales_items_taxes sit
      JOIN sales s ON s.sale_id = sit.sale_id
      WHERE s.sale_status = 0
        ${start !== undefined ? sql`AND s.sale_time >= ${start}` : sql``}
        ${end !== undefined ? sql`AND s.sale_time <= ${end}` : sql``}
      GROUP BY sit.name ORDER BY total DESC`,
  },
];

// Graphical variants — mirrors the tabular report with a chart renderer.
// OSPOS PHP has 11 graphical_summary_* methods; each gets a parallel entry here.
const GRAPHICAL_TWINS: { key: string; chart: "bar" | "hbar" | "line" | "pie" }[] = [
  { key: "summary_sales", chart: "line" },
  { key: "summary_payments", chart: "pie" },
  { key: "summary_categories", chart: "pie" },
  { key: "summary_customers", chart: "hbar" },
  { key: "summary_employees", chart: "hbar" },
  { key: "summary_suppliers", chart: "hbar" },
  { key: "summary_taxes", chart: "pie" },
  { key: "summary_discounts", chart: "bar" },
  { key: "summary_expenses", chart: "pie" },
  { key: "summary_expenses_categories", chart: "pie" },
  { key: "summary_cashups", chart: "line" },
];

for (const twin of GRAPHICAL_TWINS) {
  const base = REPORTS.find((r) => r.key === twin.key);
  if (base) {
    REPORTS.push({
      ...base,
      key: `${twin.key}_graphical`,
      title: `${base.title} (graphical)`,
      chart: twin.chart,
    });
  }
}

export function getReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}