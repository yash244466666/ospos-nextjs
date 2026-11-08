import {
  dateFormat,
  dateOrTimeFormat,
  getConfig,
  getConfigBool,
  loadConfig,
  quantityDecimals,
  timeFormat,
  totalsDecimals,
} from "@/lib/config";
import { IS_SQLITE } from "@/lib/db";
import { reportQuery } from "./query";
import { toCurrency, toCurrencyTax, toQuantityDecimals, toDecimals } from "@/lib/i18n/format";
import { formatDb } from "@/lib/datetime";
import { lang } from "@/lib/i18n/lang";

export interface ReportColumn {
  name: string;
  label: string;
  align?: "left" | "right";
}

export type ReportChart = "bar" | "hbar" | "line" | "pie";

export interface ReportFilters {
  start?: string;
  end?: string;
  saleType?: string;
  locationId?: string;
  itemCount?: string;
  discountType?: string;
  discount?: string;
  customerId?: string;
  employeeId?: string;
  supplierId?: string;
  paymentType?: string;
  receivingType?: string;
}

export interface ReportDef {
  key: string;
  title: string;
  permission: string;
  hasDateRange: boolean;
  inputs: string[];
  columns: ReportColumn[];
  chart?: ReportChart;
  run: (filters: ReportFilters) => Promise<Record<string, unknown>[]>;
  summary?: (
    rows: Record<string, unknown>[],
    filters: ReportFilters,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

function concatExpr(...parts: string[]): string {
  return IS_SQLITE ? parts.join(" || ") : `CONCAT(${parts.join(", ")})`;
}

function dialectDate(column: string): string {
  return IS_SQLITE ? `date(${column})` : `DATE(${column})`;
}

function datePredicate(column: string, filters: ReportFilters): {
  clause: string;
  params: unknown[];
} {
  if (!filters.start || !filters.end) return { clause: "1 = 1", params: [] };
  if (!dateOrTimeFormat()) {
    return {
      clause: `${dialectDate(column)} BETWEEN ? AND ?`,
      params: [filters.start, filters.end],
    };
  }
  return {
    clause: `${column} BETWEEN ? AND ?`,
    params: [decodeURIComponent(filters.start), decodeURIComponent(filters.end)],
  };
}

function saleTypePredicate(saleTypes: string | undefined, alias = "sales"): string {
  switch (saleTypes) {
    case "complete":
      return `${alias}.sale_status = 0 AND ${alias}.sale_type IN (0, 1, 4)`;
    case "sales":
      return `${alias}.sale_status = 0 AND ${alias}.sale_type IN (0, 1)`;
    case "quotes":
      return `${alias}.sale_status = 1 AND ${alias}.sale_type = 3`;
    case "work_orders":
      return `${alias}.sale_status = 1 AND ${alias}.sale_type = 2`;
    case "canceled":
      return `${alias}.sale_status = 2`;
    case "returns":
      return `${alias}.sale_status = 0 AND ${alias}.sale_type = 4`;
    default:
      return "1 = 1";
  }
}

function salePriceExpression(d: number): string {
  return `CASE WHEN si.discount_type = 0
    THEN si.quantity_purchased * si.item_unit_price
      - ROUND(si.quantity_purchased * si.item_unit_price * si.discount / 100, ${d})
    ELSE si.quantity_purchased * (si.item_unit_price - si.discount)
  END`;
}

function taxTemp(d: number): string {
  return `(SELECT sale_id, item_id, line,
      SUM(ROUND(item_tax_amount, ${d})) AS tax,
      SUM(ROUND(CASE WHEN tax_type = 0 THEN item_tax_amount ELSE 0 END, ${d})) AS internal_tax,
      SUM(ROUND(CASE WHEN tax_type = 1 THEN item_tax_amount ELSE 0 END, ${d})) AS sales_tax
    FROM ospos_sales_items_taxes
    GROUP BY sale_id, item_id, line)`;
}

function paymentTemp(): string {
  const concat = IS_SQLITE
    ? `GROUP_CONCAT(payment_type || ' ' || (payment_amount - cash_refund), ', ')`
    : `GROUP_CONCAT(CONCAT(payment_type, ' ', (payment_amount - cash_refund)) SEPARATOR ', ')`;
  return `(SELECT sale_id,
      SUM(CASE WHEN cash_adjustment = 0 THEN payment_amount ELSE 0 END) AS sale_payment_amount,
      SUM(CASE WHEN cash_adjustment = 1 THEN payment_amount ELSE 0 END) AS sale_cash_adjustment,
      SUM(cash_refund) AS sale_cash_refund,
      ${concat} AS payment_type
    FROM ospos_sales_payments GROUP BY sale_id)`;
}

function saleFrom(d: number): string {
  return `FROM ospos_sales_items si
    INNER JOIN ospos_sales sales ON si.sale_id = sales.sale_id
    LEFT JOIN ${taxTemp(d)} t ON t.sale_id = si.sale_id AND t.item_id = si.item_id AND t.line = si.line
    LEFT JOIN ${paymentTemp()} p ON p.sale_id = sales.sale_id`;
}

function commonTotals(d: number): string {
  return `ROUND(SUM(${salePriceExpression(d)}), ${d}) + IFNULL(SUM(p.sale_cash_adjustment), 0) AS base_amount,
    IFNULL(SUM(t.tax), 0) AS tax_amount,
    SUM(si.item_cost_price * si.quantity_purchased) AS cost_amount`;
}

function totalsFor(
  row: Record<string, unknown>,
  included: boolean,
): { subtotal: number; tax: number; total: number; cost: number; profit: number } {
  const base = Number(row.base_amount ?? 0);
  const tax = Number(row.tax_amount ?? 0);
  const cost = Number(row.cost_amount ?? 0);
  const subtotal = included ? base - tax : base;
  const total = included ? base : base + tax;
  return { subtotal, tax, total, cost, profit: subtotal - cost };
}

const money = (value: unknown) => toCurrency(String(value ?? 0));
const taxMoney = (value: unknown) => toCurrencyTax(String(value ?? 0));
const quantity = (value: unknown) => toQuantityDecimals(String(value ?? 0));

function displayDate(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  try {
    return formatDb(value, dateFormat());
  } catch {
    return value;
  }
}

function displayDateTime(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  try {
    return formatDb(value, `${dateFormat()} ${timeFormat()}`);
  } catch {
    return value;
  }
}

function totalsSummary(rows: Record<string, unknown>[]): Record<string, unknown> {
  const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  return {
    subtotal: sum("subtotalRaw"),
    tax: sum("taxRaw"),
    total: sum("totalRaw"),
    cost: sum("costRaw"),
    profit: sum("profitRaw"),
  };
}

function totalColumns(): ReportColumn[] {
  return [
    { name: "subtotal", label: lang("Reports.subtotal"), align: "right" },
    { name: "tax", label: lang("Reports.tax"), align: "right" },
    { name: "total", label: lang("Reports.total"), align: "right" },
    { name: "cost", label: lang("Reports.cost"), align: "right" },
    { name: "profit", label: lang("Reports.profit"), align: "right" },
  ];
}

function mapSalesRows(
  rows: Record<string, unknown>[],
  included: boolean,
  extra: (row: Record<string, unknown>, totals: ReturnType<typeof totalsFor>) => Record<string, unknown>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const totals = totalsFor(row, included);
    return {
      ...extra(row, totals),
      subtotal: money(totals.subtotal),
      tax: taxMoney(totals.tax),
      total: money(totals.total),
      cost: money(totals.cost),
      profit: money(totals.profit),
      subtotalRaw: totals.subtotal,
      taxRaw: totals.tax,
      totalRaw: totals.total,
      costRaw: totals.cost,
      profitRaw: totals.profit,
    };
  });
}

function salesWhere(
  filters: ReportFilters,
  options: { extraWhere?: string[]; includeLocation?: boolean } = {},
): { clause: string; params: unknown[] } {
  const date = datePredicate("sales.sale_time", filters);
  const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
  const params = [...date.params];
  if (options.includeLocation !== false && filters.locationId && filters.locationId !== "all") {
    clauses.push("si.item_location = ?");
    params.push(Number(filters.locationId));
  }
  clauses.push(...(options.extraWhere ?? []));
  return { clause: clauses.map((clause) => `(${clause})`).join(" AND "), params };
}

async function salesAggregate(
  filters: ReportFilters,
  selection: string,
  groupBy: string,
  orderBy: string,
  options: { extraWhere?: string[]; includeLocation?: boolean } = {},
): Promise<{ rows: Record<string, unknown>[]; included: boolean }> {
  await loadConfig();
  const d = totalsDecimals();
  const included = getConfigBool("tax_included", false);
  const where = salesWhere(filters, options);
  const rows = await reportQuery<Record<string, unknown>>(
    `SELECT ${commonTotals(d)}, ${selection}
     ${saleFrom(d)}
     WHERE ${where.clause}
     GROUP BY ${groupBy}
     ORDER BY ${orderBy}`,
    where.params,
  );
  return { rows, included };
}

/**
 * `Summary_report::getSummaryData()` — the overall aggregate for the filter,
 * independent of how the rows are grouped. Summing displayed rows is only
 * equivalent when the grouping covers every sale (it does not for customers
 * or suppliers, where walk-in sales have no row).
 */
async function salesTotalsSummary(
  _rows: Record<string, unknown>[],
  filters: ReportFilters,
): Promise<Record<string, unknown>> {
  await loadConfig();
  const d = totalsDecimals();
  const included = getConfigBool("tax_included", false);
  const where = salesWhere(filters);
  const rows = await reportQuery<Record<string, unknown>>(
    `SELECT ${commonTotals(d)} ${saleFrom(d)} WHERE ${where.clause}`,
    where.params,
  );
  const totals = totalsFor(rows[0] ?? {}, included);
  return {
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    cost: totals.cost,
    profit: totals.profit,
  };
}

function summarySales(): ReportDef {
  return {
    key: "summary_sales",
    title: lang("Reports.sales_summary_report"),
    permission: "reports_sales",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id"],
    columns: [
      { name: "sale_date", label: lang("Reports.date") },
      { name: "sales", label: lang("Reports.sales"), align: "right" },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      ...totalColumns(),
    ],
    chart: "line",
    summary: salesTotalsSummary,
    async run(filters) {
      const { rows, included } = await salesAggregate(
        filters,
        `${dialectDate("sales.sale_time")} AS sale_date,
         COUNT(DISTINCT sales.sale_id) AS sale_count,
         SUM(si.quantity_purchased) AS quantity_purchased`,
        "sale_date",
        "sale_date",
      );
      return mapSalesRows(rows, included, (row) => ({
        sale_date: displayDate(row.sale_date),
        sale_dateRaw: String(row.sale_date ?? ""),
        sales: toQuantityDecimals(String(Number(row.sale_count ?? 0))),
        quantity: quantity(row.quantity_purchased),
      }));
    },
  };
}

function summaryCategories(): ReportDef {
  return {
    key: "summary_categories",
    title: lang("Reports.categories_summary_report"),
    permission: "reports_categories",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id"],
    columns: [
      { name: "category", label: lang("Reports.category") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      ...totalColumns(),
    ],
    chart: "pie",
    summary: salesTotalsSummary,
    async run(filters) {
      const d = totalsDecimals();
      const baseIncluded = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const data = await reportQuery<Record<string, unknown>>(
        `SELECT ${commonTotals(d)}, items.category AS category,
                SUM(si.quantity_purchased) AS quantity_purchased
         ${saleFrom(d)}
         INNER JOIN ospos_items items ON si.item_id = items.item_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY items.category ORDER BY items.category`,
        params,
      );
      return mapSalesRows(data, baseIncluded, (row) => ({
        category: row.category ?? "",
        quantity: quantity(row.quantity_purchased),
      }));
    },
  };
}

function summaryExpensesCategories(): ReportDef {
  return {
    key: "summary_expenses_categories",
    title: lang("Reports.expenses_categories_summary_report"),
    permission: "reports_expenses_categories",
    hasDateRange: true,
    inputs: ["start_date", "end_date"],
    columns: [
      { name: "category_name", label: lang("Reports.expenses_category") },
      { name: "count", label: lang("Reports.count"), align: "right" },
      { name: "total_amount", label: lang("Reports.expenses_amount"), align: "right" },
      { name: "total_tax_amount", label: lang("Reports.expenses_tax_amount"), align: "right" },
    ],
    chart: "pie",
    async run(filters) {
      await loadConfig();
      const date = datePredicate("expenses.date", filters);
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT expense_categories.category_name AS category_name,
                COUNT(expenses.expense_id) AS count,
                SUM(expenses.amount) AS total_amount,
                SUM(expenses.tax_amount) AS total_tax_amount
         FROM ospos_expenses expenses
         LEFT JOIN ospos_expense_categories expense_categories
           ON expense_categories.expense_category_id = expenses.expense_category_id
         WHERE ${date.clause} AND expenses.deleted = 0
         GROUP BY expense_categories.category_name
         ORDER BY expense_categories.category_name`,
        date.params,
      );
      return rows.map((row) => ({
        category_name: row.category_name ?? "",
        count: Number(row.count ?? 0),
        total_amount: money(row.total_amount),
        total_tax_amount: money(row.total_tax_amount),
        total_amountRaw: Number(row.total_amount ?? 0),
        // SUM() over all-NULL tax amounts is NULL upstream; keep it null so the
        // summary block matches instead of reporting 0.
        total_tax_amountRaw:
          row.total_tax_amount === null || row.total_tax_amount === undefined
            ? null
            : Number(row.total_tax_amount),
      }));
    },
    summary(rows) {
      return {
        expenses_total_amount: rows.reduce(
          (total, row) => total + Number(row.total_amountRaw ?? 0),
          0,
        ),
        expenses_total_tax_amount: rows.every(
          (row) => row.total_tax_amountRaw === null || row.total_tax_amountRaw === undefined,
        )
          ? null
          : rows.reduce((total, row) => total + Number(row.total_tax_amountRaw ?? 0), 0),
      };
    },
  };
}

function summaryCustomers(): ReportDef {
  return {
    key: "summary_customers",
    title: lang("Reports.customers_summary_report"),
    permission: "reports_customers",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id"],
    columns: [
      { name: "customer_name", label: lang("Reports.customer") },
      { name: "sales", label: lang("Reports.sales"), align: "right" },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      ...totalColumns(),
    ],
    chart: "hbar",
    summary: salesTotalsSummary,
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const data = await reportQuery<Record<string, unknown>>(
        `SELECT ${commonTotals(d)},
                MAX(${concatExpr("customer_p.first_name", "' '", "customer_p.last_name")}) AS customer,
                SUM(si.quantity_purchased) AS quantity_purchased,
                COUNT(DISTINCT sales.sale_id) AS sale_count
         ${saleFrom(d)}
         INNER JOIN ospos_people customer_p ON sales.customer_id = customer_p.person_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY sales.customer_id
         ORDER BY customer_p.last_name`,
        params,
      );
      return mapSalesRows(data, included, (row) => ({
        customer_name: row.customer ?? "",
        sales: toQuantityDecimals(String(Number(row.sale_count ?? 0))),
        quantity: quantity(row.quantity_purchased),
      }));
    },
  };
}

function summarySuppliers(): ReportDef {
  return {
    key: "summary_suppliers",
    title: lang("Reports.suppliers_summary_report"),
    permission: "reports_suppliers",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id"],
    columns: [
      { name: "supplier_name", label: lang("Reports.supplier") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      ...totalColumns(),
    ],
    chart: "pie",
    summary: salesTotalsSummary,
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const data = await reportQuery<Record<string, unknown>>(
        `SELECT ${commonTotals(d)},
                MAX(${concatExpr("supplier_c.company_name", "' ('", "supplier_p.first_name", "' '", "supplier_p.last_name", "')'")}) AS supplier,
                SUM(si.quantity_purchased) AS quantity_purchased
         ${saleFrom(d)}
         INNER JOIN ospos_items items ON si.item_id = items.item_id
         INNER JOIN ospos_suppliers supplier_c ON items.supplier_id = supplier_c.person_id
         INNER JOIN ospos_people supplier_p ON items.supplier_id = supplier_p.person_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY items.supplier_id
         ORDER BY supplier`,
        params,
      );
      return mapSalesRows(data, included, (row) => ({
        supplier_name: row.supplier ?? "",
        quantity: quantity(row.quantity_purchased),
      }));
    },
  };
}

function summaryItems(): ReportDef {
  return {
    key: "summary_items",
    title: lang("Reports.items_summary_report"),
    permission: "reports_items",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id"],
    columns: [
      { name: "item_name", label: lang("Reports.item_name") },
      { name: "category", label: lang("Reports.category") },
      { name: "cost_price", label: lang("Reports.cost_price"), align: "right" },
      { name: "unit_price", label: lang("Reports.unit_price"), align: "right" },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      ...totalColumns(),
    ],
    chart: "hbar",
    summary: salesTotalsSummary,
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const data = await reportQuery<Record<string, unknown>>(
        `SELECT ${commonTotals(d)},
                MAX(items.name) AS name,
                MAX(items.category) AS category,
                MAX(items.cost_price) AS cost_price,
                MAX(items.unit_price) AS unit_price,
                SUM(si.quantity_purchased) AS quantity_purchased
         ${saleFrom(d)}
         INNER JOIN ospos_items items ON si.item_id = items.item_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY items.item_id
         ORDER BY name`,
        params,
      );
      return mapSalesRows(data, included, (row) => ({
        item_name: row.name ?? "",
        category: row.category ?? "",
        cost_price: String(row.cost_price ?? ""),
        unit_price: String(row.unit_price ?? ""),
        quantity: quantity(row.quantity_purchased),
      }));
    },
  };
}

function summaryEmployees(): ReportDef {
  return {
    key: "summary_employees",
    title: lang("Reports.employees_summary_report"),
    permission: "reports_employees",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id"],
    columns: [
      { name: "employee_name", label: lang("Reports.employee") },
      { name: "sales", label: lang("Reports.sales"), align: "right" },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      ...totalColumns(),
    ],
    chart: "pie",
    summary: salesTotalsSummary,
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const data = await reportQuery<Record<string, unknown>>(
        `SELECT ${commonTotals(d)},
                MAX(${concatExpr("employee_p.first_name", "' '", "employee_p.last_name")}) AS employee,
                SUM(si.quantity_purchased) AS quantity_purchased,
                COUNT(DISTINCT sales.sale_id) AS sale_count
         ${saleFrom(d)}
         INNER JOIN ospos_people employee_p ON sales.employee_id = employee_p.person_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY sales.employee_id
         ORDER BY employee_p.last_name`,
        params,
      );
      return mapSalesRows(data, included, (row) => ({
        employee_name: row.employee ?? "",
        sales: toQuantityDecimals(String(Number(row.sale_count ?? 0))),
        quantity: quantity(row.quantity_purchased),
      }));
    },
  };
}

function summaryTaxes(): ReportDef {
  return {
    key: "summary_taxes",
    title: lang("Reports.taxes_summary_report"),
    permission: "reports_taxes",
    hasDateRange: true,
    inputs: ["start_date", "end_date"],
    columns: [
      { name: "tax_name", label: lang("Reports.tax_name") },
      { name: "tax_percent", label: lang("Reports.tax_percent"), align: "right" },
      { name: "report_count", label: lang("Reports.sales"), align: "right" },
      ...totalColumns(),
    ],
    chart: "pie",
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const saleAmount = salePriceExpression(d);
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT name, percent,
                COUNT(DISTINCT sale_id) AS count,
                ROUND(SUM(subtotal), ${d}) AS subtotal,
                ROUND(SUM(tax), ${d}) AS tax,
                ROUND(SUM(total), ${d}) AS total
         FROM (
           SELECT sales_items_taxes.name AS name,
                  ${IS_SQLITE ? `(IFNULL(ROUND(sales_items_taxes.percent, ${d}), 0) || '%')` : `CONCAT(IFNULL(ROUND(sales_items_taxes.percent, ${d}), 0), '%')`} AS percent,
                  sales.sale_id AS sale_id,
                  ROUND(${included ? `${saleAmount} - IFNULL(sales_items_taxes.item_tax_amount, 0)` : saleAmount}, ${d}) AS subtotal,
                  ROUND(IFNULL(sales_items_taxes.item_tax_amount, 0), ${d}) AS tax,
                  ROUND(${saleAmount}, ${d}) + ${included ? "0" : `ROUND(IFNULL(sales_items_taxes.item_tax_amount, 0), ${d})`} AS total
           FROM ospos_sales_items si
           INNER JOIN ospos_sales sales ON si.sale_id = sales.sale_id
           LEFT JOIN ospos_sales_items_taxes sales_items_taxes
             ON si.sale_id = sales_items_taxes.sale_id
            AND si.item_id = sales_items_taxes.item_id
            AND si.line = sales_items_taxes.line
           WHERE sales.sale_status = 0 AND ${date.clause}
         ) AS temp_taxes
         GROUP BY percent, name`,
        date.params,
      );
      return rows.map((row) => {
        const subtotal = Number(row.subtotal ?? 0);
        const tax = Number(row.tax ?? 0);
        const total = Number(row.total ?? 0);
        return {
          tax_name: row.name ?? "",
          tax_percent: row.percent ?? "0%",
          report_count: Number(row.count ?? 0),
          subtotal: money(subtotal),
          tax: taxMoney(tax),
          total: money(total),
          cost: money(0),
          profit: money(subtotal),
          subtotalRaw: subtotal,
          taxRaw: tax,
          totalRaw: total,
          costRaw: 0,
          profitRaw: subtotal,
        };
      });
    },
    summary(rows) {
      const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
      return {
        subtotal: sum("subtotalRaw"),
        tax: sum("taxRaw"),
        total: sum("totalRaw"),
        count: rows.reduce((total, row) => total + Number(row.report_count ?? 0), 0),
      };
    },
  };
}

function summarySalesTaxes(): ReportDef {
  return {
    key: "summary_sales_taxes",
    title: lang("Reports.sales_taxes_summary_report"),
    permission: "reports_sales_taxes",
    hasDateRange: true,
    inputs: ["start_date", "end_date"],
    columns: [
      { name: "reporting_authority", label: lang("Reports.authority") },
      { name: "jurisdiction_name", label: lang("Reports.jurisdiction") },
      { name: "tax_category", label: lang("Reports.tax_category") },
      { name: "tax_rate", label: lang("Reports.tax_rate"), align: "right" },
      { name: "tax", label: lang("Reports.tax"), align: "right" },
    ],
    chart: "pie",
    async run(filters) {
      await loadConfig();
      const date = datePredicate("sales.sale_time", filters);
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT tj.reporting_authority, tj.jurisdiction_name, tc.tax_category, st.tax_rate,
                SUM(st.sale_tax_amount) AS tax
         FROM ospos_sales_taxes st
         LEFT JOIN ospos_sales sales ON st.sale_id = sales.sale_id
         LEFT JOIN ospos_tax_categories tc ON st.tax_category_id = tc.tax_category_id
         LEFT JOIN ospos_tax_jurisdictions tj ON st.jurisdiction_id = tj.jurisdiction_id
         WHERE ${date.clause}
         GROUP BY tj.reporting_authority, tj.jurisdiction_name, tc.tax_category, st.tax_rate`,
        date.params,
      );
      return rows.map((row) => ({
        reporting_authority: row.reporting_authority ?? "",
        jurisdiction_name: row.jurisdiction_name ?? "",
        tax_category: row.tax_category ?? "",
        tax_rate: row.tax_rate ?? "",
        tax: taxMoney(row.tax),
        taxRaw: Number(row.tax ?? 0),
      }));
    },
    summary: salesTotalsSummary,
  };
}

function summaryDiscounts(): ReportDef {
  return {
    key: "summary_discounts",
    title: lang("Reports.discounts_summary_report"),
    permission: "reports_discounts",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id", "discount_type"],
    columns: [
      { name: "discount", label: lang("Reports.discount") },
      { name: "count", label: lang("Reports.count"), align: "right" },
      { name: "total", label: lang("Reports.total"), align: "right" },
    ],
    chart: "bar",
    async run(filters) {
      await loadConfig();
      const discountType = filters.discountType ?? "0";
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const where = clauses.map((clause) => `(${clause})`).join(" AND ");
      if (discountType === "1") {
        return (
          await reportQuery<Record<string, unknown>>(
            `SELECT SUM(si.discount) AS total,
                    MAX(${IS_SQLITE ? `'$' || si.discount` : `CONCAT('$', si.discount)`}) AS discount,
                    COUNT(*) AS count
             FROM ospos_sales_items si
             INNER JOIN ospos_sales sales ON si.sale_id = sales.sale_id
             WHERE si.discount_type = 1 AND si.discount > 0 AND ${where}
             GROUP BY si.discount ORDER BY si.discount`,
            params,
          )
        ).map((row) => ({
          discount: row.discount ?? "",
          count: Number(row.count ?? 0),
          total: money(row.total),
        }));
      }
      return (
        await reportQuery<Record<string, unknown>>(
          `SELECT SUM(si.item_unit_price) * si.discount / 100.0 AS total,
                  MAX(${IS_SQLITE ? `si.discount || '%'` : `CONCAT(si.discount, '%')`}) AS discount,
                  COUNT(*) AS count
           FROM ospos_sales_items si
           INNER JOIN ospos_sales sales ON si.sale_id = sales.sale_id
           WHERE si.discount_type = 0 AND si.discount > 0 AND ${where}
           GROUP BY si.discount ORDER BY si.discount`,
          params,
        )
      ).map((row) => ({
        discount: row.discount ?? "",
        count: Number(row.count ?? 0),
        total: money(row.total),
      }));
    },
    summary: salesTotalsSummary,
  };
}

function summaryPayments(): ReportDef {
  return {
    key: "summary_payments",
    title: lang("Reports.payments_summary_report"),
    permission: "reports_payments",
    hasDateRange: true,
    inputs: ["start_date", "end_date"],
    columns: [
      { name: "trans_group", label: lang("Reports.trans_group") },
      { name: "trans_type", label: lang("Reports.trans_type") },
      { name: "trans_sales", label: lang("Reports.sales"), align: "right" },
      { name: "trans_amount", label: lang("Reports.trans_amount"), align: "right" },
      { name: "trans_payments", label: lang("Reports.trans_payments"), align: "right" },
      { name: "trans_refunded", label: lang("Reports.trans_refunded"), align: "right" },
      { name: "trans_due", label: lang("Reports.trans_due"), align: "right" },
    ],
    chart: "pie",
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const itemExpr = `(SELECT sales2.sale_id,
          SUM(${salePriceExpression(d)}) + IFNULL((SELECT SUM(sst.sale_tax_amount)
             FROM ospos_sales_taxes sst WHERE sst.sale_id = sales2.sale_id AND sst.tax_type = 1), 0) AS trans_amount
        FROM ospos_sales sales2
        LEFT JOIN ospos_sales_items si ON si.sale_id = sales2.sale_id
        WHERE ${date.clause.replace(/sales\.sale_time/g, "sales2.sale_time")}
        GROUP BY sales2.sale_id)`;
      const paymentExpr = `(SELECT sale_id, COUNT(*) AS number_payments,
          SUM(CASE WHEN cash_adjustment = 0 THEN payment_amount ELSE 0 END) AS total_payments,
          SUM(CASE WHEN cash_adjustment = 1 THEN payment_amount ELSE 0 END) AS total_cash_adjustment,
          SUM(cash_refund) AS total_cash_refund
        FROM ospos_sales_payments GROUP BY sale_id)`;
      const transRows = await reportQuery<Record<string, unknown>>(
        `SELECT '${lang("Reports.trans_sales")}' AS trans_group,
                CASE sales.sale_type WHEN 0 THEN '${lang("Reports.code_pos")}'
                  WHEN 1 THEN '${lang("Sales.invoice")}' WHEN 4 THEN '${lang("Sales.return")}' END AS trans_type,
                COUNT(sales.sale_id) AS trans_sales,
                SUM(items.trans_amount) AS trans_amount,
                IFNULL(SUM(payments.total_payments), 0) AS trans_payments,
                IFNULL(SUM(payments.total_cash_refund), 0) AS trans_refunded,
                SUM(CASE WHEN items.trans_amount - IFNULL(payments.total_payments, 0) > 0
                         THEN items.trans_amount - IFNULL(payments.total_payments, 0) ELSE 0 END) AS trans_due
         FROM ospos_sales sales
         LEFT JOIN ${itemExpr} items ON sales.sale_id = items.sale_id
         LEFT JOIN ${paymentExpr} payments ON sales.sale_id = payments.sale_id
         WHERE sales.sale_status = 0 AND ${date.clause}
         GROUP BY trans_type`,
        [...date.params, ...date.params],
      );
      const paymentRows = await reportQuery<Record<string, unknown>>(
        `SELECT '${lang("Reports.trans_payments")}' AS trans_group,
                sales_payments.payment_type AS trans_type,
                COUNT(sales.sale_id) AS trans_sales,
                SUM(payment_amount - cash_refund) AS trans_amount,
                SUM(payment_amount) AS trans_payments,
                SUM(cash_refund) AS trans_refunded,
                0 AS trans_due
         FROM ospos_sales sales
         LEFT JOIN ospos_sales_payments sales_payments ON sales.sale_id = sales_payments.sale_id
         WHERE sales.sale_status = 0 AND ${date.clause}
         GROUP BY sales_payments.payment_type`,
        date.params,
      );
      void included;
      let giftCardCount = 0;
      let giftCardAmount = 0;
      const payments = [];
      for (const payment of paymentRows) {
        const type = String(payment.trans_type ?? "");
        if (type.includes(lang("Sales.giftcard"))) {
          giftCardCount += Number(payment.trans_sales ?? 0);
          giftCardAmount += Number(payment.trans_amount ?? 0);
        } else {
          payments.push(payment);
        }
      }
      if (giftCardCount > 0) {
        payments.push({
          trans_group: lang("Reports.trans_payments"),
          trans_type: lang("Sales.giftcard"),
          trans_sales: giftCardCount,
          trans_amount: giftCardAmount,
          trans_payments: giftCardAmount,
          trans_refunded: 0,
          trans_due: 0,
        });
      }
      const separator = {
        trans_group: "<HR>",
        trans_type: "",
        trans_sales: "",
        trans_amount: "",
        trans_payments: "",
        trans_refunded: "",
        trans_due: "",
      };
      return [...transRows, separator, ...payments].map((row) => ({
        ...row,
        trans_sales: row.trans_sales === "" ? "" : Number(row.trans_sales ?? 0),
        trans_amount: row.trans_amount === "" ? "" : money(row.trans_amount),
        trans_payments: row.trans_payments === "" ? "" : money(row.trans_payments),
        trans_refunded: row.trans_refunded === "" ? "" : money(row.trans_refunded),
        trans_due: row.trans_due === "" ? "" : money(row.trans_due),
      }));
    },
    summary: salesTotalsSummary,
  };
}

function inventoryLow(): ReportDef {
  return {
    key: "inventory_low",
    title: lang("Reports.inventory_low_report"),
    permission: "reports_inventory",
    hasDateRange: false,
    inputs: [],
    columns: [
      { name: "item_name", label: lang("Reports.item_name") },
      { name: "item_number", label: lang("Reports.item_number") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      { name: "reorder_level", label: lang("Reports.reorder_level"), align: "right" },
      { name: "location_name", label: lang("Reports.stock_location") },
    ],
    async run() {
      await loadConfig();
      const multiPack = getConfigBool("multi_pack_enabled", false);
      const nameExpr = multiPack
        ? `${IS_SQLITE ? "items.name || ' | ' || items.pack_name" : "CONCAT(items.name, ' | ', items.pack_name)"}`
        : "items.name";
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT ${nameExpr} AS item_name, items.item_number, item_quantities.quantity,
                items.reorder_level, stock_locations.location_name
         FROM ospos_items items
         JOIN ospos_item_quantities item_quantities ON items.item_id = item_quantities.item_id
         JOIN ospos_stock_locations stock_locations ON item_quantities.location_id = stock_locations.location_id
         WHERE items.deleted = 0 AND items.stock_type = 0
           AND item_quantities.quantity <= items.reorder_level
           AND stock_locations.deleted = 0
         ORDER BY items.name`,
      );
      return rows.map((row) => ({
        item_name: row.item_name ?? "",
        item_number: row.item_number ?? "",
        quantity: quantity(row.quantity),
        reorder_level: quantity(row.reorder_level),
        location_name: row.location_name ?? "",
      }));
    },
    summary: () => ({}),
  };
}

function inventorySummary(): ReportDef {
  return {
    key: "inventory_summary",
    title: lang("Reports.inventory_summary_report"),
    permission: "reports_inventory",
    hasDateRange: false,
    inputs: ["location_id", "item_count"],
    columns: [
      { name: "item_name", label: lang("Reports.item_name") },
      { name: "item_number", label: lang("Reports.item_number") },
      { name: "category", label: lang("Reports.category") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      { name: "low_sell_quantity", label: lang("Reports.low_sell_quantity"), align: "right" },
      { name: "reorder_level", label: lang("Reports.reorder_level"), align: "right" },
      { name: "location_name", label: lang("Reports.stock_location") },
      { name: "cost_price", label: lang("Reports.cost_price"), align: "right" },
      { name: "unit_price", label: lang("Reports.unit_price"), align: "right" },
      { name: "subtotal", label: lang("Reports.subtotal"), align: "right" },
    ],
    async run(filters) {
      await loadConfig();
      const multiPack = getConfigBool("multi_pack_enabled", false);
      const nameExpr = multiPack
        ? `${IS_SQLITE ? "items.name || ' | ' || items.pack_name" : "CONCAT(items.name, ' | ', items.pack_name)"}`
        : "items.name";
      const clauses = [
        "items.deleted = 0",
        "items.stock_type = 0",
        "stock_locations.deleted = 0",
      ];
      const params: unknown[] = [];
      if (filters.itemCount === "zero_and_less") clauses.push("item_quantities.quantity <= 0");
      if (filters.itemCount === "more_than_zero") clauses.push("item_quantities.quantity > 0");
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("stock_locations.location_id = ?");
        params.push(Number(filters.locationId));
      }
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT ${nameExpr} AS item_name, items.item_number, items.category,
                item_quantities.quantity,
                (item_quantities.quantity * items.qty_per_pack) AS low_sell_quantity,
                items.reorder_level, stock_locations.location_name,
                items.cost_price, items.unit_price,
                (items.cost_price * item_quantities.quantity) AS sub_total_value
         FROM ospos_items items
         JOIN ospos_item_quantities item_quantities ON items.item_id = item_quantities.item_id
         JOIN ospos_stock_locations stock_locations ON item_quantities.location_id = stock_locations.location_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY items.name, items.qty_per_pack`,
        params,
      );
      return rows.map((row) => ({
        item_name: row.item_name ?? "",
        item_number: row.item_number ?? "",
        category: row.category ?? "",
        quantity: quantity(row.quantity),
        low_sell_quantity: quantity(row.low_sell_quantity),
        reorder_level: quantity(row.reorder_level),
        location_name: row.location_name ?? "",
        cost_price: money(row.cost_price),
        unit_price: money(row.unit_price),
        subtotal: money(row.sub_total_value),
        quantityRaw: Number(row.quantity ?? 0),
        lowSellRaw: Number(row.low_sell_quantity ?? 0),
        subtotalRaw: Number(row.sub_total_value ?? 0),
        retailRaw: Number(row.unit_price ?? 0) * Number(row.quantity ?? 0),
      }));
    },
    summary(rows) {
      return {
        total_inventory_value: rows.reduce(
          (total, row) => total + Number(row.subtotalRaw ?? 0),
          0,
        ),
        total_quantity: rows.reduce((total, row) => total + Number(row.quantityRaw ?? 0), 0),
        total_low_sell_quantity: rows.reduce(
          (total, row) => total + Number(row.lowSellRaw ?? 0),
          0,
        ),
        total_retail: rows.reduce((total, row) => total + Number(row.retailRaw ?? 0), 0),
      };
    },
  };
}

function detailedItemSales(): ReportDef {
  return {
    key: "detailed_item_sales",
    title: lang("Reports.detailed_item_sales_report"),
    permission: "reports_sales",
    hasDateRange: true,
    inputs: ["startDate", "endDate", "saleType", "locationId", "discountType"],
    columns: [
      { name: "sale_time", label: lang("Reports.date") },
      { name: "sale_id", label: lang("Reports.sale_id"), align: "right" },
      { name: "customer_name", label: lang("Reports.sold_to") },
      { name: "item_name", label: lang("Reports.item") },
      { name: "category", label: lang("Reports.category") },
      { name: "item_number", label: lang("Reports.item_number") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      { name: "unit_price", label: lang("Reports.unit_price"), align: "right" },
      { name: "discount", label: lang("Reports.discount"), align: "right" },
      ...totalColumns(),
      { name: "employee_name", label: lang("Reports.sold_by") },
      { name: "payment_type", label: lang("Reports.payment_type") },
      { name: "comment", label: lang("Reports.comments") },
    ],
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "sales")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      if (filters.discountType && filters.discountType !== "all") {
        clauses.push("si.discount_type = ?");
        params.push(Number(filters.discountType));
      }
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT sales.sale_time, sales.sale_id,
                ${concatExpr("customer_p.first_name", "' '", "customer_p.last_name")} AS customer_name,
                items.name AS item_name, items.category, items.item_number,
                si.quantity_purchased, si.item_unit_price, si.discount, si.discount_type,
                ${salePriceExpression(d)} AS line_amount,
                IFNULL((SELECT SUM(ROUND(sit.item_tax_amount, ${d}))
                        FROM ospos_sales_items_taxes sit
                        WHERE sit.sale_id = si.sale_id AND sit.item_id = si.item_id AND sit.line = si.line), 0) AS line_tax,
                IFNULL((SELECT SUM(sp.payment_amount) FROM ospos_sales_payments sp
                        WHERE sp.sale_id = sales.sale_id AND sp.cash_adjustment = 1), 0) AS cash_adjustment,
                si.item_cost_price * si.quantity_purchased AS line_cost,
                ${concatExpr("employee_p.first_name", "' '", "employee_p.last_name")} AS employee_name,
                p.payment_type, sales.comment
         ${saleFrom(d)}
         INNER JOIN ospos_items items ON si.item_id = items.item_id
         LEFT JOIN ospos_people customer_p ON sales.customer_id = customer_p.person_id
         LEFT JOIN ospos_people employee_p ON sales.employee_id = employee_p.person_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         ORDER BY sales.sale_time, sales.sale_id, si.line`,
        params,
      );
      return rows.map((row) => {
        const base = Number(row.line_amount ?? 0) + Number(row.cash_adjustment ?? 0);
        const tax = Number(row.line_tax ?? 0);
        const cost = Number(row.line_cost ?? 0);
        const subtotal = included ? base - tax : base;
        const total = included ? base : base + tax;
        return {
        sale_time: displayDateTime(row.sale_time),
        sale_id: Number(row.sale_id ?? 0),
        customer_name: row.customer_name ?? "",
        item_name: row.item_name ?? "",
        category: row.category ?? "",
        item_number: row.item_number ?? "",
        quantity: quantity(row.quantity_purchased),
        unit_price: money(row.item_unit_price),
        discount:
          Number(row.discount_type ?? 0) === 0
            ? `${Number(row.discount ?? 0)}%`
            : money(row.discount),
        employee_name: row.employee_name ?? "",
        payment_type: row.payment_type ?? "",
        comment: row.comment ?? "",
        subtotal: money(subtotal),
        tax: taxMoney(tax),
        total: money(total),
        cost: money(cost),
        profit: money(subtotal - cost),
        subtotalRaw: subtotal,
        taxRaw: tax,
        totalRaw: total,
        costRaw: cost,
        profitRaw: subtotal - cost,
        };
      });
    },
    summary(rows) {
      return {
        ...totalsSummary(rows),
        total_quantity: rows.reduce(
          (total, row) => total + Number(String(row.quantity ?? "0").replace(/,/g, "")),
          0,
        ),
      };
    },
  };
}

function detailedSales(): ReportDef {
  return {
    key: "detailed_sales",
    title: lang("Reports.detailed_sales_report"),
    permission: "reports_sales",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type", "location_id"],
    columns: [
      { name: "sale_id", label: lang("Reports.sale_id"), align: "right" },
      { name: "type_code", label: lang("Reports.type") },
      { name: "sale_time", label: lang("Reports.date") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      { name: "employee_name", label: lang("Reports.sold_by") },
      { name: "customer_name", label: lang("Reports.sold_to") },
      ...totalColumns(),
      { name: "payment_type", label: lang("Reports.payment_type") },
      { name: "comment", label: lang("Reports.comments") },
    ],
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete")];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("si.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT sales.sale_id,
                MAX(CASE WHEN sales.sale_type = 0 AND sales.sale_status = 0 THEN 'POS'
                         WHEN sales.sale_type = 1 AND sales.sale_status = 0 THEN 'INV'
                         WHEN sales.sale_type = 2 AND sales.sale_status = 1 THEN 'W/O'
                         WHEN sales.sale_type = 3 AND sales.sale_status = 1 THEN 'Q'
                         WHEN sales.sale_type = 4 AND sales.sale_status = 0 THEN 'RET'
                         WHEN sales.sale_status = 2 THEN 'CNL' ELSE '' END) AS type_code,
                MAX(sales.sale_time) AS sale_time,
                SUM(si.quantity_purchased) AS quantity_purchased,
                MAX(${concatExpr("employee_p.first_name", "' '", "employee_p.last_name")}) AS employee_name,
                MAX(${concatExpr("customer_p.first_name", "' '", "customer_p.last_name")}) AS customer_name,
                ${commonTotals(d)},
                MAX(p.payment_type) AS payment_type,
                MAX(sales.comment) AS comment
         ${saleFrom(d)}
         LEFT JOIN ospos_people employee_p ON sales.employee_id = employee_p.person_id
         LEFT JOIN ospos_people customer_p ON sales.customer_id = customer_p.person_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY sales.sale_id
         ORDER BY MAX(sales.sale_time)`,
        params,
      );
      return mapSalesRows(rows, included, (row) => ({
        sale_id: Number(row.sale_id ?? 0),
        type_code: row.type_code ?? "",
        sale_time: displayDateTime(row.sale_time),
        quantity: quantity(row.quantity_purchased),
        employee_name: row.employee_name ?? "",
        customer_name: row.customer_name ?? "",
        payment_type: row.payment_type ?? "",
        comment: row.comment ?? "",
      }));
    },
    summary: totalsSummary,
  };
}

function detailedReceivings(): ReportDef {
  return {
    key: "detailed_receivings",
    title: lang("Reports.detailed_receivings_report"),
    permission: "reports_receivings",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "receiving_type", "location_id"],
    columns: [
      { name: "receiving_id", label: lang("Reports.receiving_id"), align: "right" },
      { name: "receiving_time", label: lang("Reports.date") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      { name: "employee_name", label: lang("Reports.received_by") },
      { name: "supplier_name", label: lang("Reports.supplied_by") },
      { name: "total", label: lang("Reports.total"), align: "right" },
      { name: "payment_type", label: lang("Reports.payment_type") },
      { name: "comment", label: lang("Reports.comments") },
      { name: "reference", label: lang("Receivings.reference") },
    ],
    async run(filters) {
      await loadConfig();
      const date = datePredicate("receivings.receiving_time", filters);
      const clauses = [date.clause];
      const params = [...date.params];
      if (filters.locationId && filters.locationId !== "all") {
        clauses.push("receivings_items.item_location = ?");
        params.push(Number(filters.locationId));
      }
      const receivingType = filters.receivingType ?? "all";
      if (receivingType === "receiving") clauses.push("receivings_items.quantity_purchased > 0");
      if (receivingType === "returns") clauses.push("receivings_items.quantity_purchased < 0");
      const having = receivingType === "requisitions" ? "HAVING SUM(receivings_items.quantity_purchased) = 0" : "";
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT receivings.receiving_id, MAX(receivings.receiving_time) AS receiving_time,
                SUM(receivings_items.quantity_purchased) AS quantity_purchased,
                MAX(${concatExpr("employee_p.first_name", "' '", "employee_p.last_name")}) AS employee_name,
                MAX(suppliers.company_name) AS supplier_name,
                SUM(receivings_items.quantity_purchased * receivings_items.receiving_quantity * receivings_items.item_unit_price) AS total,
                MAX(receivings.payment_type) AS payment_type,
                MAX(receivings.comment) AS comment,
                MAX(receivings.reference) AS reference
         FROM ospos_receivings_items receivings_items
         INNER JOIN ospos_receivings receivings ON receivings_items.receiving_id = receivings.receiving_id
         INNER JOIN ospos_people employee_p ON receivings.employee_id = employee_p.person_id
         LEFT JOIN ospos_suppliers suppliers ON receivings.supplier_id = suppliers.person_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY receivings.receiving_id ${having}
         ORDER BY MAX(receivings.receiving_id)`,
        params,
      );
      return rows.map((row) => ({
        receiving_id: Number(row.receiving_id ?? 0),
        receiving_time: displayDateTime(row.receiving_time),
        quantity: quantity(row.quantity_purchased),
        employee_name: row.employee_name ?? "",
        supplier_name: row.supplier_name ?? "",
        total: money(row.total),
        payment_type: row.payment_type ?? "",
        comment: row.comment ?? "",
        reference: row.reference ?? "",
        totalRaw: Number(row.total ?? 0),
      }));
    },
    summary(rows) {
      return { total: rows.reduce((total, row) => total + Number(row.totalRaw ?? 0), 0) };
    },
  };
}

async function specificSalesReport(
  key: string,
  title: string,
  permission: string,
  filters: ReportFilters,
  whereExtra: string,
  paramsExtra: unknown[],
  nameColumn: "employee_name" | "customer_name",
): Promise<Record<string, unknown>[]> {
  await loadConfig();
  const d = totalsDecimals();
  const included = getConfigBool("tax_included", false);
  const date = datePredicate("sales.sale_time", filters);
  const clauses = [date.clause, saleTypePredicate(filters.saleType ?? "complete"), whereExtra];
  const rows = await reportQuery<Record<string, unknown>>(
    `SELECT sales.sale_id,
            MAX(CASE WHEN sales.sale_type = 0 AND sales.sale_status = 0 THEN 'POS'
                     WHEN sales.sale_type = 1 AND sales.sale_status = 0 THEN 'INV'
                     WHEN sales.sale_type = 2 AND sales.sale_status = 1 THEN 'W/O'
                     WHEN sales.sale_type = 3 AND sales.sale_status = 1 THEN 'Q'
                     WHEN sales.sale_type = 4 AND sales.sale_status = 0 THEN 'RET'
                     WHEN sales.sale_status = 2 THEN 'CNL' ELSE '' END) AS type_code,
            MAX(sales.sale_time) AS sale_time,
            SUM(si.quantity_purchased) AS quantity_purchased,
            MAX(${concatExpr("employee_p.first_name", "' '", "employee_p.last_name")}) AS employee_name,
            MAX(${concatExpr("customer_p.first_name", "' '", "customer_p.last_name")}) AS customer_name,
            ${commonTotals(d)},
            MAX(p.payment_type) AS payment_type,
            MAX(sales.comment) AS comment
     ${saleFrom(d)}
     LEFT JOIN ospos_people employee_p ON sales.employee_id = employee_p.person_id
     LEFT JOIN ospos_people customer_p ON sales.customer_id = customer_p.person_id
     WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
     GROUP BY sales.sale_id
     ORDER BY MAX(sales.sale_time)`,
    [...date.params, ...paramsExtra],
  );
  void key;
  void title;
  void permission;
  return mapSalesRows(rows, included, (row) => ({
    sale_id: Number(row.sale_id ?? 0),
    type_code: row.type_code ?? "",
    sale_time: displayDateTime(row.sale_time),
    quantity: quantity(row.quantity_purchased),
    [nameColumn]: row[nameColumn] ?? "",
    payment_type: row.payment_type ?? "",
    comment: row.comment ?? "",
  }));
}

function specificReport(
  key: string,
  title: string,
  permission: string,
  nameColumn: "employee_name" | "customer_name",
): ReportDef {
  return {
    key,
    title,
    permission,
    hasDateRange: true,
    inputs: ["start_date", "end_date", "sale_type"],
    columns: [
      { name: "sale_id", label: lang("Reports.sale_id"), align: "right" },
      { name: "type_code", label: lang("Reports.type") },
      { name: "sale_time", label: lang("Reports.date") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      { name: nameColumn, label: lang(`Reports.${nameColumn === "employee_name" ? "sold_by" : "sold_to"}`) },
      ...totalColumns(),
      { name: "payment_type", label: lang("Reports.payment_type") },
      { name: "comment", label: lang("Reports.comments") },
    ],
    summary: totalsSummary,
    async run(filters) {
      const id = nameColumn === "employee_name" ? filters.employeeId : filters.customerId;
      const where =
        nameColumn === "employee_name"
          ? "sales.employee_id = ?"
          : "sales.customer_id = ?";
      return specificSalesReport(key, title, permission, filters, where, [Number(id ?? 0)], nameColumn);
    },
  };
}

function specificDiscounts(): ReportDef {
  return {
    key: "specific_discounts",
    title: `${lang("Reports.discount")} ${lang("Reports.report")}`,
    permission: "reports_discounts",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "discount", "sale_type", "discount_type"],
    columns: [
      { name: "sale_id", label: lang("Reports.sale_id"), align: "right" },
      { name: "type_code", label: lang("Reports.type") },
      { name: "sale_time", label: lang("Reports.date") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      { name: "employee_name", label: lang("Reports.sold_by") },
      { name: "customer_name", label: lang("Reports.sold_to") },
      ...totalColumns(),
      { name: "payment_type", label: lang("Reports.payment_type") },
      { name: "comment", label: lang("Reports.comments") },
    ],
    summary: totalsSummary,
    async run(filters) {
      return specificSalesReport(
        "specific_discounts",
        lang("Reports.discount"),
        "reports_discounts",
        filters,
        "si.discount >= ? AND si.discount_type = ?",
        [Number(filters.discount ?? 0), Number(filters.discountType ?? 0)],
        "employee_name",
      );
    },
  };
}

function specificSuppliers(): ReportDef {
  return {
    key: "specific_suppliers",
    title: `${lang("Reports.supplier")} ${lang("Reports.report")}`,
    permission: "reports_suppliers",
    hasDateRange: true,
    inputs: ["start_date", "end_date", "supplier_id", "sale_type"],
    columns: [
      { name: "sale_id", label: lang("Reports.sale_id"), align: "right" },
      { name: "type_code", label: lang("Reports.type") },
      { name: "sale_time", label: lang("Reports.date") },
      { name: "item_name", label: lang("Reports.item_name") },
      { name: "category", label: lang("Reports.category") },
      { name: "item_number", label: lang("Reports.item_number") },
      { name: "quantity", label: lang("Reports.quantity"), align: "right" },
      ...totalColumns(),
      { name: "discount", label: lang("Reports.discount"), align: "right" },
    ],
    summary: totalsSummary,
    async run(filters) {
      await loadConfig();
      const d = totalsDecimals();
      const included = getConfigBool("tax_included", false);
      const date = datePredicate("sales.sale_time", filters);
      const clauses = [
        date.clause,
        saleTypePredicate(filters.saleType ?? "complete"),
        "items.supplier_id = ?",
      ];
      const rows = await reportQuery<Record<string, unknown>>(
        `SELECT sales.sale_id,
                MAX(CASE WHEN sales.sale_type = 0 AND sales.sale_status = 0 THEN 'POS'
                         WHEN sales.sale_type = 1 AND sales.sale_status = 0 THEN 'INV'
                         WHEN sales.sale_type = 2 AND sales.sale_status = 1 THEN 'W/O'
                         WHEN sales.sale_type = 3 AND sales.sale_status = 1 THEN 'Q'
                         WHEN sales.sale_type = 4 AND sales.sale_status = 0 THEN 'RET'
                         WHEN sales.sale_status = 2 THEN 'CNL' ELSE '' END) AS type_code,
                MAX(sales.sale_time) AS sale_time,
                MAX(items.name) AS item_name, MAX(items.category) AS category,
                MAX(items.item_number) AS item_number,
                SUM(si.quantity_purchased) AS quantity_purchased,
                ${commonTotals(d)},
                MAX(si.discount_type) AS discount_type, MAX(si.discount) AS discount
         ${saleFrom(d)}
         INNER JOIN ospos_items items ON si.item_id = items.item_id
         WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
         GROUP BY si.item_id, sales.sale_id
         ORDER BY MAX(sales.sale_time)`,
        [...date.params, Number(filters.supplierId ?? 0)],
      );
      return mapSalesRows(rows, included, (row) => ({
        sale_id: Number(row.sale_id ?? 0),
        type_code: row.type_code ?? "",
        sale_time: displayDateTime(row.sale_time),
        item_name: row.item_name ?? "",
        category: row.category ?? "",
        item_number: row.item_number ?? "",
        quantity: quantity(row.quantity_purchased),
        discount:
          Number(row.discount_type ?? 0) === 0
            ? `${Number(row.discount ?? 0)}%`
            : money(row.discount),
      }));
    },
  };
}

export const REPORTS: ReportDef[] = [
  summarySales(),
  summaryCategories(),
  summaryExpensesCategories(),
  summaryCustomers(),
  summarySuppliers(),
  summaryItems(),
  summaryEmployees(),
  summaryTaxes(),
  summarySalesTaxes(),
  summaryDiscounts(),
  summaryPayments(),
  inventoryLow(),
  inventorySummary(),
  detailedItemSales(),
  detailedReceivings(),
  detailedSales(),
  specificReport("specific_customers", `${lang("Reports.customer")} ${lang("Reports.report")}`, "reports_customers", "customer_name"),
  specificReport("specific_employees", `${lang("Reports.employee")} ${lang("Reports.report")}`, "reports_employees", "employee_name"),
  specificDiscounts(),
  specificSuppliers(),
];

const GRAPHICAL_TWINS: { key: string; chart: ReportChart }[] = [
  { key: "summary_sales", chart: "line" },
  { key: "summary_payments", chart: "pie" },
  { key: "summary_categories", chart: "pie" },
  { key: "summary_customers", chart: "hbar" },
  { key: "summary_employees", chart: "pie" },
  { key: "summary_suppliers", chart: "pie" },
  { key: "summary_taxes", chart: "pie" },
  { key: "summary_discounts", chart: "bar" },
  { key: "summary_expenses_categories", chart: "pie" },
  { key: "summary_sales_taxes", chart: "pie" },
  { key: "summary_items", chart: "hbar" },
];

for (const twin of GRAPHICAL_TWINS) {
  const base = REPORTS.find((report) => report.key === twin.key);
  if (!base) continue;
  REPORTS.push({
    ...base,
    key: `${twin.key}_graphical`,
    title: base.title,
    chart: twin.chart,
  });
}

export function getReport(key: string): ReportDef | undefined {
  return REPORTS.find((report) => report.key === key);
}

export async function runReport(
  def: ReportDef,
  filters: ReportFilters,
): Promise<Record<string, unknown>[]> {
  await loadConfig();
  return def.run(filters);
}
