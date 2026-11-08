import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

/**
 * Runs OSPOS's own report models (via the PHP oracle container) and the target
 * report registry over an identical fixture database, then compares the rows
 * and summary blocks. Requires the parity stack:
 *
 *   docker compose -f docker/parity/docker-compose.yml up -d
 *
 * Environment:
 *   ORACLE_DATABASE_URL  default mysql://ospos:ospos@127.0.0.1:3307/ospos
 *   DATABASE_URL         target, default mysql://root:root@127.0.0.1:3307/ospos_fresh
 *   ORACLE_CONTAINER     default parity-oracle-1
 */

const ORACLE_URL =
  process.env.ORACLE_DATABASE_URL ?? "mysql://ospos:ospos@127.0.0.1:3307/ospos";
const TARGET_URL =
  process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3307/ospos_fresh";
const CONTAINER = process.env.ORACLE_CONTAINER ?? "parity-oracle-1";

const FIXTURE = path.resolve(process.cwd(), "scripts/parity/fixtures/report-fixture.sql");
const PROBE = path.resolve(process.cwd(), "scripts/parity/report-probe.php");

const INPUTS = {
  start_date: "2000-01-01",
  end_date: "2100-12-31",
  sale_type: "complete",
  location_id: "all",
  discount_type: "0",
};

const FILTERS = {
  start: INPUTS.start_date,
  end: INPUTS.end_date,
  saleType: INPUTS.sale_type,
  locationId: INPUTS.location_id,
  discountType: INPUTS.discount_type,
  discount: "0",
  customerId: "0",
  employeeId: "0",
  supplierId: "0",
  itemCount: "all",
  receivingType: "all",
};

type Kind = "num" | "str" | "date";
interface Field {
  oracle: string;
  target: string;
  kind: Kind;
}

const TOTALS: Field[] = [
  { oracle: "subtotal", target: "subtotalRaw", kind: "num" },
  { oracle: "tax", target: "taxRaw", kind: "num" },
  { oracle: "total", target: "totalRaw", kind: "num" },
  { oracle: "cost", target: "costRaw", kind: "num" },
  { oracle: "profit", target: "profitRaw", kind: "num" },
];

interface ReportSpec {
  key: string;
  class: string;
  fields: Field[];
  summary?: Field[];
}

const SUMMARY_TOTALS: Field[] = [
  { oracle: "subtotal", target: "subtotal", kind: "num" },
  { oracle: "tax", target: "tax", kind: "num" },
  { oracle: "total", target: "total", kind: "num" },
  { oracle: "cost", target: "cost", kind: "num" },
  { oracle: "profit", target: "profit", kind: "num" },
];

const N = (name: string): Field => ({ oracle: name, target: name, kind: "num" });
const S = (oracle: string, target = oracle): Field => ({ oracle, target, kind: "str" });

const REPORTS: ReportSpec[] = [
  {
    key: "summary_sales",
    class: "Summary_sales",
    fields: [
      { oracle: "sale_date", target: "sale_dateRaw", kind: "date" },
      N("sales"),
      { oracle: "quantity_purchased", target: "quantity", kind: "num" },
      ...TOTALS,
    ],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_categories",
    class: "Summary_categories",
    fields: [S("category"), { oracle: "quantity_purchased", target: "quantity", kind: "num" }, ...TOTALS],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_expenses_categories",
    class: "Summary_expenses_categories",
    fields: [
      S("category_name"),
      N("count"),
      { oracle: "total_amount", target: "total_amountRaw", kind: "num" },
      { oracle: "total_tax_amount", target: "total_tax_amountRaw", kind: "num" },
    ],
    summary: [
      N("expenses_total_amount"),
      N("expenses_total_tax_amount"),
    ],
  },
  {
    key: "summary_customers",
    class: "Summary_customers",
    fields: [S("customer", "customer_name"), N("sales"), { oracle: "quantity_purchased", target: "quantity", kind: "num" }, ...TOTALS],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_suppliers",
    class: "Summary_suppliers",
    fields: [S("supplier", "supplier_name"), { oracle: "quantity_purchased", target: "quantity", kind: "num" }, ...TOTALS],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_items",
    class: "Summary_items",
    fields: [
      S("name", "item_name"),
      S("category"),
      { oracle: "cost_price", target: "cost_price", kind: "num" },
      { oracle: "unit_price", target: "unit_price", kind: "num" },
      { oracle: "quantity_purchased", target: "quantity", kind: "num" },
      ...TOTALS,
    ],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_employees",
    class: "Summary_employees",
    fields: [S("employee", "employee_name"), N("sales"), { oracle: "quantity_purchased", target: "quantity", kind: "num" }, ...TOTALS],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_taxes",
    class: "Summary_taxes",
    fields: [
      S("name", "tax_name"),
      S("percent", "tax_percent"),
      { oracle: "count", target: "report_count", kind: "num" },
      { oracle: "subtotal", target: "subtotalRaw", kind: "num" },
      { oracle: "tax", target: "taxRaw", kind: "num" },
      { oracle: "total", target: "totalRaw", kind: "num" },
    ],
    summary: [N("subtotal"), N("tax"), N("total"), N("count")],
  },
  {
    key: "summary_sales_taxes",
    class: "Summary_sales_taxes",
    fields: [
      S("reporting_authority"),
      S("jurisdiction_name"),
      S("tax_category"),
      { oracle: "tax_rate", target: "tax_rate", kind: "num" },
      { oracle: "tax", target: "taxRaw", kind: "num" },
    ],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_discounts",
    class: "Summary_discounts",
    fields: [S("discount"), N("count"), N("total")],
    summary: SUMMARY_TOTALS,
  },
  {
    key: "summary_payments",
    class: "Summary_payments",
    fields: [
      S("trans_group"),
      S("trans_type"),
      N("trans_sales"),
      N("trans_amount"),
      N("trans_payments"),
      N("trans_refunded"),
      N("trans_due"),
    ],
    summary: SUMMARY_TOTALS,
  },
];

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return text;
}

function comparable(kind: Kind, value: unknown): string {
  if (kind === "date") return toDate(value);
  if (kind === "num") {
    const number = toNumber(value);
    return number === null ? "" : String(Math.round(number * 10000) / 10000);
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

interface Diff {
  report: string;
  where: string;
  field: string;
  expected: string;
  actual: string;
}

function compareField(
  diffs: Diff[],
  report: string,
  where: string,
  field: Field,
  oracleValue: unknown,
  targetValue: unknown,
): void {
  const expected = comparable(field.kind, oracleValue);
  const actual = comparable(field.kind, targetValue);
  if (expected !== actual) {
    diffs.push({ report, where, field: field.oracle, expected, actual });
  }
}

async function loadFixture(url: string): Promise<void> {
  const connection = await mysql.createConnection({
    uri: url,
    dateStrings: true,
    multipleStatements: true,
  });
  try {
    await connection.query(fs.readFileSync(FIXTURE, "utf8"));
  } finally {
    await connection.end();
  }
}

function probeOnce(spec: ReportSpec): Record<string, unknown> {
  execFileSync("docker", ["cp", PROBE, `${CONTAINER}:/tmp/report-probe.php`]);
  const output = execFileSync(
    "docker",
    [
      "exec",
      CONTAINER,
      "php",
      "/tmp/report-probe.php",
      JSON.stringify([{ key: spec.key, class: spec.class, inputs: INPUTS }]),
    ],
    { encoding: "utf8" },
  );
  const marker = output.indexOf("---REPORT-JSON---");
  if (marker < 0) throw new Error(`Probe produced no JSON for ${spec.key}`);
  const parsed = JSON.parse(output.slice(marker + "---REPORT-JSON---".length)) as Record<
    string,
    { error?: string; data?: Record<string, unknown>[]; summary?: Record<string, unknown> }
  >;
  return parsed[spec.key] as Record<string, unknown>;
}

/**
 * The upstream Summary_report creates MEMORY temp tables with
 * `CREATE TEMPORARY TABLE IF NOT EXISTS`; on a cold connection MySQL
 * occasionally rejects the first query. One retry keeps the gate stable.
 */
function probe(spec: ReportSpec): Record<string, unknown> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = probeOnce(spec);
    if (!result) throw new Error(`Probe returned no entry for ${spec.key}`);
    if (!result.error) return result;
    if (attempt === 1) throw new Error(`${spec.key} oracle error: ${String(result.error)}`);
  }
  throw new Error(`${spec.key} oracle error`);
}

async function main(): Promise<void> {
  await loadFixture(ORACLE_URL);
  await loadFixture(TARGET_URL);

  process.env.DB_DRIVER = "mysql";
  process.env.DATABASE_URL = TARGET_URL;
  const { REPORTS: TARGET_REPORTS } = await import("../../src/lib/reports/registry");

  const diffs: Diff[] = [];
  let compared = 0;

  for (const spec of REPORTS) {
    const oracle = probe(spec) as {
      data: Record<string, unknown>[];
      summary: Record<string, unknown>;
    };
    const targetDef = TARGET_REPORTS.find((report) => report.key === spec.key);
    if (!targetDef) {
      diffs.push({ report: spec.key, where: "report", field: "key", expected: "present", actual: "missing" });
      continue;
    }
    const targetRows = await targetDef.run(FILTERS);
    const targetSummary = targetDef.summary
      ? await targetDef.summary(targetRows, FILTERS)
      : undefined;

    if (oracle.data.length !== targetRows.length) {
      diffs.push({
        report: spec.key,
        where: "rows",
        field: "count",
        expected: String(oracle.data.length),
        actual: String(targetRows.length),
      });
    }
    const count = Math.min(oracle.data.length, targetRows.length);
    for (let index = 0; index < count; index += 1) {
      for (const field of spec.fields) {
        compareField(
          diffs,
          spec.key,
          `row ${index}`,
          field,
          oracle.data[index]?.[field.oracle],
          targetRows[index]?.[field.target],
        );
        compared += 1;
      }
    }

    if (spec.summary && targetSummary) {
      for (const field of spec.summary) {
        compareField(
          diffs,
          spec.key,
          "summary",
          field,
          oracle.summary?.[field.oracle],
          targetSummary[field.target],
        );
        compared += 1;
      }
    }

    if (!diffs.some((diff) => diff.report === spec.key)) {
      console.log(`PASS ${spec.key} (${oracle.data.length} rows)`);
    }
  }

  if (diffs.length > 0) {
    console.error(`\nReport differential: ${diffs.length} difference(s) over ${compared} values`);
    for (const diff of diffs.slice(0, 100)) {
      console.error(
        `  ${diff.report} ${diff.where} ${diff.field}: oracle=${diff.expected} target=${diff.actual}`,
      );
    }
    process.exit(1);
  }
  console.log(`\nReport differential PASS: ${REPORTS.length} reports, ${compared} values`);
}

main().catch((error: unknown) => {
  console.error("Report differential failed:", (error as Error).message);
  process.exit(2);
});
