import { acquireNextSequence, getConfig } from "@/lib/config";
import { getDbSync } from "@/lib/db";
import { and, count, eq, gte, isNotNull, sql } from "drizzle-orm";
import { sales, people, customers } from "@/db/schema";

const TOKEN_RE = /\{([A-Z]{2,4})(?::(\d+))?\}/g;
const STRFTIME_RE = /\{(?:d|D|j|l|S|w|z|Z|F|m|M|n|t|L|Y|y|a|A|g|G|h|H|i|s|c|r|U)/g;

export interface TokenContext {
  saleId?: number;
  customerId?: number;
  save?: boolean;
}

export async function render(format: string, ctx: TokenContext = {}): Promise<string> {
  const withStrftime = format.replace(STRFTIME_RE, (m) => applyStrftime(m));
  const matches = Array.from(withStrftime.matchAll(TOKEN_RE));
  let result = withStrftime;
  for (const m of matches) {
    const [whole, code, len] = m;
    const length = len ? parseInt(len, 10) : 0;
    const value = await resolveToken(code, ctx);
    const padded = length > 0 ? value.padStart(length, "0") : value;
    result = result.replace(whole, padded);
  }
  return result;
}

function applyStrftime(token: string): string {
  const d = new Date();
  const datefmt = getConfig("dateformat", "Y-m-d");
  const timefmt = getConfig("timeformat", "H:i:s");
  const fmt = datefmt + " " + timefmt;
  const pad = (n: number) => String(n).padStart(2, "0");
  const map: Record<string, string> = {
    d: pad(d.getDate()),
    D: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()],
    j: pad(d.getDate()),
    l: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()],
    S: ["st", "nd", "rd", "th"][Math.min(d.getDate() % 10, 3)] ?? "th",
    w: String(d.getDay()),
    Y: String(d.getFullYear()),
    y: String(d.getFullYear()).slice(2),
    m: pad(d.getMonth() + 1),
    n: String(d.getMonth() + 1),
    F: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()],
    M: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()],
    t: String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
    H: pad(d.getHours()),
    G: pad(d.getHours()),
    h: pad(d.getHours() % 12 || 12),
    i: pad(d.getMinutes()),
    s: pad(d.getSeconds()),
    a: d.getHours() < 12 ? "am" : "pm",
    A: d.getHours() < 12 ? "AM" : "PM",
    g: String(d.getHours() % 12 || 12),
    z: `+${pad(Math.abs(d.getTimezoneOffset() / 60))}`,
  };
  return map[token] ?? token;
}

export function scan(text: string): { code: string; length: number }[] {
  const out: { code: string; length: number }[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const code = m[1];
    const len = m[2] ? parseInt(m[2], 10) : 0;
    out.push({ code, length: len });
  }
  return out;
}

export function parseBarcode(input: string, formats: { barcode_formats?: string } = {}): { itemIdOrNumber: string; quantity: number; price: number | null } | null {
  const trimmed = input.trim();
  let formatsArr: { name: string; value: string }[] = [];
  try {
    if (formats.barcode_formats) {
      const parsed = JSON.parse(formats.barcode_formats);
      if (Array.isArray(parsed)) {
        formatsArr = parsed.filter((f) => f && f.name && f.value);
      }
    }
  } catch { /* ignore */ }

  for (const fmt of formatsArr) {
    const re = new RegExp(fmt.value, "i");
    const m = trimmed.match(re);
    if (m) {
      const groups = m.slice(1);
      const fieldNames = fmt.name.split("|");
      const fields: Record<string, string> = {};
      for (let i = 0; i < fieldNames.length; i++) {
        fields[fieldNames[i]] = groups[i] ?? "";
      }
      const itemIdOrNumber = fields.id || fields.item || fields.item_id || fields.item_number || fields.number || "";
      const quantity = fields.qty || fields.quantity ? parseFloat(fields.qty || fields.quantity) : 1;
      const price = fields.price ? parseFloat(fields.price) : null;
      if (itemIdOrNumber) return { itemIdOrNumber, quantity, price };
    }
  }

  const m = trimmed.match(/^(KIT|POS)\s+(\d+)$/i);
  if (m) return { itemIdOrNumber: m[2], quantity: 1, price: null };
  if (/^\d+$/.test(trimmed) && !trimmed.startsWith("0")) {
    return { itemIdOrNumber: trimmed, quantity: 1, price: null };
  }
  return { itemIdOrNumber: trimmed, quantity: 1, price: null };
}

async function resolveToken(code: string, ctx: TokenContext): Promise<string> {
  const db = getDbSync();
  switch (code) {
    case "CO": {
      const n = db.select({ c: count() }).from(sales).where(isNotNull(sales.invoiceNumber)).get();
      return String(n?.c ?? 0);
    }
    case "ISEQ":
      return String(await acquireNextSequence("last_used_invoice_number"));
    case "QSEQ":
      return String(await acquireNextSequence("last_used_quote_number"));
    case "WSEQ":
      return String(await acquireNextSequence("last_used_work_order_number"));
    case "YCO": {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      const n = db
        .select({ c: count() })
        .from(sales)
        .where(and(gte(sales.saleTime, yearStart), isNotNull(sales.invoiceNumber)))
        .get();
      return String((n?.c ?? 0) + 1);
    }
    case "YQO": {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      const n = db
        .select({ c: count() })
        .from(sales)
        .where(and(gte(sales.saleTime, yearStart), isNotNull(sales.quoteNumber)))
        .get();
      return String((n?.c ?? 0) + 1);
    }
    case "SCO": {
      const n = db
        .select({ c: count() })
        .from(sales)
        .where(eq(sales.saleStatus, 1))
        .get();
      return String(n?.c ?? 0);
    }
    case "CU": {
      if (ctx.customerId) {
        const p = db.select().from(people).where(eq(people.personId, ctx.customerId)).get();
        if (p) return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
      }
      return "";
    }
    default:
      return code;
  }
}

export const TOKEN_CODES = ["CO", "ISEQ", "QSEQ", "WSEQ", "YCO", "YQO", "SCO", "CU"] as const;

void sql;
void customers;
