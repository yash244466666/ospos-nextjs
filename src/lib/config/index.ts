import { eq, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { appConfig } from "@/db/schema";
import { ENCRYPTED_KEYS } from "./tabs";
import { decrypt as decryptConfig } from "@/lib/encryption";

let cache: Map<string, string> | null = null;
let loadingAt: number = 0;

export function loadConfig(): Map<string, string> {
  if (cache) return cache;
  const db = getDbSync();
  const rows = db.select().from(appConfig).all();
  cache = new Map(rows.map((r) => [r.key, r.value]));
  loadingAt = Date.now();
  return cache;
}

export function getConfig(key: string, defaultValue = ""): string {
  return loadConfig().get(key) ?? defaultValue;
}

export function getConfigBool(key: string, defaultValue = false): boolean {
  const v = getConfig(key, "");
  if (v === "") return defaultValue;
  return v === "1" || v === "true" || v === "TRUE";
}

export function getConfigNumber(key: string, defaultValue = 0): number {
  const v = getConfig(key, "");
  if (v === "") return defaultValue;
  const n = Number(v);
  return Number.isNaN(n) ? defaultValue : n;
}

export function getConfigDecrypted(key: string, defaultValue = ""): string {
  const v = getConfig(key, "");
  if (!v) return defaultValue;
  if (!ENCRYPTED_KEYS.has(key)) return v;
  try {
    return decryptConfig(v) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setConfig(key: string, value: string): void {
  const db = getDbSync();
  db.insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } })
    .run();
  cache?.set(key, value);
}

export async function acquireNextSequence(key: "last_used_invoice_number" | "last_used_quote_number" | "last_used_work_order_number"): Promise<number> {
  const db = getDbSync();
  const row = db
    .update(appConfig)
    .set({ value: sql`CAST(CAST(${appConfig.value} AS INTEGER) + 1 AS TEXT)` })
    .where(eq(appConfig.key, key))
    .returning({ value: appConfig.value })
    .get();
  if (!row) {
    db.insert(appConfig).values({ key, value: "1" }).run();
    cache?.set(key, "1");
    return 1;
  }
  const next = parseInt(row.value, 10);
  cache?.set(key, String(next));
  return next;
}

export function totalsDecimals(): number {
  return getConfigNumber("currency_decimals", 2);
}
export function taxDecimals(): number {
  return getConfigNumber("tax_decimals", 2);
}
export function cashDecimals(): number {
  return getConfigNumber("cash_decimals", 2);
}
export function quantityDecimals(): number {
  return getConfigNumber("quantity_decimals", 0);
}

export { appConfig };