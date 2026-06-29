import { acquireNextSequence } from "@/lib/config";
import { getDbSync } from "@/lib/db";
import { count, eq, isNotNull, sql } from "drizzle-orm";
import { sales } from "@/db/schema";

const TOKEN_RE = /\{([A-Z]{2,4})(?::(\d+))?\}/g;

interface TokenContext {
  saleId?: number;
  customerId?: number;
  save?: boolean;
}

export async function render(format: string, ctx: TokenContext = {}): Promise<string> {
  const matches = Array.from(format.matchAll(TOKEN_RE));
  let result = format;
  for (const m of matches) {
    const [whole, code, len] = m;
    const length = len ? parseInt(len, 10) : 0;
    const value = await resolveToken(code, ctx);
    const padded = length > 0 ? value.padStart(length, "0") : value;
    result = result.replace(whole, padded);
  }
  return result;
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
        .where(sql`${sales.saleTime} >= ${yearStart} AND ${sales.invoiceNumber} IS NOT NULL`)
        .get();
      return String((n?.c ?? 0) + 1);
    }
    case "YQO": {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      const n = db
        .select({ c: count() })
        .from(sales)
        .where(sql`${sales.saleTime} >= ${yearStart} AND ${sales.quoteNumber} IS NOT NULL`)
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
    case "CU":
      return "";
    default:
      return code;
  }
}

export function parseBarcode(input: string): { type: string; value: string } | null {
  const m = input.match(/^(KIT|POS)\s+#?(\d+)$/i);
  if (m) return { type: m[1].toUpperCase(), value: m[2] };
  return null;
}

export const TOKEN_CODES = ["CO", "ISEQ", "QSEQ", "WSEQ", "YCO", "YQO", "SCO", "CU"] as const;