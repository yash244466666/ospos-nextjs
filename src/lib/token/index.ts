import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { acquireNextSequence, getConfig, getSequenceValue, timezone } from "@/lib/config";
import { getDb, IS_SQLITE } from "@/lib/db";
import { sales, people, customers } from "@/db/schema";
import { SALE_STATUS } from "@/lib/constants";
import { strftime } from "@/lib/datetime";
import { getSessionData } from "@/lib/session";
import { nowDb } from "@/lib/datetime";

const SCAN_RE = /\{([^\s{}:]+)(?::([^\s{}:]+))?\}/g;

export interface TokenContext {
  saleId?: number;
  customerId?: number;
  /** Email/invoice data builders construct Token_customer with sale data, which
   * makes `{CU}` render empty (UD-17). */
  customerInfoProvided?: boolean;
  /** Caller-supplied values take precedence over built-ins. */
  overrides?: Record<string, string>;
  /** Caller-supplied sequence values (email path pins the allocated number). */
  invoiceSequence?: string;
  quoteSequence?: string;
  workOrderSequence?: string;
  save?: boolean;
  now?: Date;
}

interface ScanEntry {
  length: string;
  spec: string;
}

function scan(text: string): Map<string, ScanEntry[]> {
  const tree = new Map<string, ScanEntry[]>();
  for (const match of text.matchAll(SCAN_RE)) {
    const [spec, id, length = ""] = match;
    const entries = tree.get(id) ?? [];
    const existing = entries.findIndex((entry) => entry.length === length);
    if (existing >= 0) entries[existing] = { length, spec };
    else entries.push({ length, spec });
    tree.set(id, entries);
  }
  return tree;
}

function padToken(value: string, length: string): string {
  if (length === "") return value;
  const numeric = /^\d+/.exec(length);
  if (!numeric) {
    throw new TypeError(`Token width must be numeric: ${length}`);
  }
  const width = Number(numeric[0]);
  if (!Number.isFinite(width) || width <= 0) return value;
  return value.padStart(width, "0");
}

async function currentYear(): Promise<string> {
  return nowDb(timezone()).slice(0, 4);
}

function yearEquals(field: typeof sales.saleTime, year: string) {
  return IS_SQLITE
    ? sql`strftime('%Y', ${field}) = ${year}`
    : sql`DATE_FORMAT(${field}, '%Y') = ${year}`;
}

async function countInvoices(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: count() })
    .from(sales)
    .where(isNotNull(sales.invoiceNumber));
  return Number(rows[0]?.value ?? 0);
}

async function countSuspendedInvoices(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: count() })
    .from(sales)
    .where(and(isNotNull(sales.invoiceNumber), eq(sales.saleStatus, SALE_STATUS.SUSPENDED)));
  return Number(rows[0]?.value ?? 0);
}

async function countForYear(
  field: "invoice_number" | "quote_number",
  year: string,
): Promise<number> {
  const db = await getDb();
  const column = field === "invoice_number" ? sales.invoiceNumber : sales.quoteNumber;
  const rows = await db
    .select({ value: count() })
    .from(sales)
    .where(and(isNotNull(column), yearEquals(sales.saleTime, year)));
  return Number(rows[0]?.value ?? 0);
}

async function nextSequence(
  key: "last_used_invoice_number" | "last_used_quote_number" | "last_used_work_order_number",
  save: boolean,
): Promise<string> {
  if (!save) {
    const now = await getSequenceValue(key);
    return String(now + 1);
  }
  return String(await acquireNextSequence(key));
}

async function resolveToken(
  id: string,
  ctx: TokenContext,
): Promise<string> {
  if (ctx.overrides?.[id] !== undefined) return ctx.overrides[id];
  const save = ctx.save ?? true;
  switch (id) {
    case "CU": {
      if (ctx.customerInfoProvided) return "";
      let customerId = ctx.customerId;
      if (customerId === undefined) {
        const data = await getSessionData();
        customerId = typeof data.sales_customer === "number" ? data.sales_customer : undefined;
      }
      if (customerId === undefined || customerId < 0) return "";
      const db = await getDb();
      const rows = await db
        .select({ firstName: people.firstName, lastName: people.lastName })
        .from(customers)
        .innerJoin(people, eq(people.personId, customers.personId))
        .where(eq(customers.personId, customerId))
        .limit(1);
      if (!rows[0]) return "";
      return `${rows[0].firstName} ${rows[0].lastName}`.trim();
    }
    case "CO":
      return String(await countInvoices());
    case "SCO":
      return String(await countSuspendedInvoices());
    case "ISEQ":
      if (ctx.invoiceSequence !== undefined) return ctx.invoiceSequence;
      return nextSequence("last_used_invoice_number", save);
    case "QSEQ":
      if (ctx.quoteSequence !== undefined) return ctx.quoteSequence;
      return nextSequence("last_used_quote_number", save);
    case "WSEQ":
      if (ctx.workOrderSequence !== undefined) return ctx.workOrderSequence;
      return nextSequence("last_used_work_order_number", save);
    case "YCO":
      return String(await countForYear("invoice_number", await currentYear()));
    case "QCO":
      return String(await countForYear("quote_number", await currentYear()));
    default:
      return "";
  }
}

/**
 * `Token_lib::render`: date-expand → scan → resolve once per token ID →
 * replace every occurrence of each spec. A token whose value contains another
 * token spec is re-replaced later in the same pass (upstream `str_replace`
 * pair ordering) — reproduced deliberately.
 */
export async function render(
  text: string,
  ctx: TokenContext = {},
): Promise<string> {
  let result = text;
  if (result.includes("%")) {
    result = strftime(result, { now: ctx.now, timeZone: timezone() });
  }
  const tree = scan(result);
  if (tree.size === 0) return result;

  for (const [id, entries] of tree) {
    const value = await resolveToken(id, ctx);
    for (const entry of entries) {
      result = result.split(entry.spec).join(padToken(value, entry.length));
    }
  }
  return result;
}

interface ParseToken {
  tokenId: string;
  value: string;
}

const BARCODE_TOKENS: ParseToken[] = [
  { tokenId: "P", value: "\\d" },
  { tokenId: "W", value: "\\d" },
  { tokenId: "I", value: "\\w" },
];

/** `Token_lib::parse` — first spec per ID replaced, unanchored regex match. */
export function parse(
  input: string,
  pattern: string,
  tokens: ParseToken[] = [],
): Record<string, string> {
  const tree = scan(pattern);
  const found: ParseToken[] = [];
  for (const [id, entries] of tree) {
    for (const token of tokens) {
      if (token.tokenId !== id) continue;
      found.push(token);
      const first = entries[0];
      if (first) {
        pattern = pattern.replace(first.spec, `(${token.value}{${first.length}})`);
      }
      break;
    }
  }
  const results: Record<string, string> = {};
  let match: RegExpExecArray | null;
  try {
    match = new RegExp(pattern).exec(input);
  } catch {
    return results;
  }
  if (!match) return results;
  for (let i = 0; i < found.length; i++) {
    const captured = match[i + 1];
    if (captured !== undefined) results[found[i].tokenId] = captured;
  }
  return results;
}

export interface ParsedBarcode {
  quantity: string;
  price: number | null;
  item: string;
}

/**
 * `Token_lib::parse_barcode` state machine (UD-19): every configured format
 * overwrites quantity and price, even when it did not match.
 */
export function parseBarcode(
  barcode: string,
  formats: string[] = [],
): ParsedBarcode {
  let quantity = "1";
  let price: number | null = null;
  let item = barcode;
  if (formats.length === 0) {
    return { quantity, price, item };
  }
  for (const format of formats) {
    const parsed = parse(item, format, BARCODE_TOKENS);
    quantity = parsed.W !== undefined ? String(Math.trunc(Number(parsed.W)) / 1000) : "1";
    if (parsed.I !== undefined) item = parsed.I;
    price = parsed.P !== undefined ? Number(parsed.P) : null;
  }
  return { quantity, price, item };
}

export function barcodeFormatsFromConfig(): string[] {
  const raw = getConfig("barcode_formats", "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}
