import type { RowDataPacket } from "mysql2/promise";
import { eq, sql } from "drizzle-orm";
import { getDb, IS_MYSQL } from "@/lib/db";
import { upsertRow } from "@/lib/db/insert";
import { getRawMysqlPool } from "@/lib/db/mysql";
import { withTransaction } from "@/lib/db/transaction";
import { appConfig } from "@/db/schema";
import { ENCRYPTED_KEYS } from "./tabs";
import { decrypt as decryptConfig } from "@/lib/encryption";
import { setBcScale } from "@/lib/money";
import { APP_CONFIG_DEFAULTS } from "@/db/seed-data";

type ConfigMap = Map<string, string>;

let cache: ConfigMap | null = null;
let loadedAt = 0;
const CACHE_TTL_MS = Number(process.env.CONFIG_CACHE_TTL_MS ?? 5000);

export async function loadConfig(force = false): Promise<ConfigMap> {
  const fresh = cache && Date.now() - loadedAt < CACHE_TTL_MS;
  if (cache && fresh && !force) return cache;
  const db = await getDb();
  const rows = await db.select().from(appConfig);
  cache = new Map(rows.map((r) => [r.key, r.value]));
  loadedAt = Date.now();
  applyDerivedSettings();
  return cache;
}

export function invalidateConfigCache(): void {
  cache = null;
  loadedAt = 0;
}

function applyDerivedSettings(): void {
  if (!cache) return;
  const totals = Number(cache.get("currency_decimals") ?? "2");
  const tax = Number(cache.get("tax_decimals") ?? "2");
  setBcScale(Math.max(2, (Number.isFinite(totals) ? totals : 2) + (Number.isFinite(tax) ? tax : 2)));
}

function snapshot(): ConfigMap {
  // Before the first `loadConfig()` the process uses the seeded defaults but
  // does not cache them, so the async loader can still read the database.
  return cache ?? new Map(Object.entries(APP_CONFIG_DEFAULTS));
}

export function getConfig(key: string, defaultValue = ""): string {
  const value = snapshot().get(key);
  return value ?? defaultValue;
}

export function getConfigBool(key: string, defaultValue = false): boolean {
  const value = getConfig(key, "");
  if (value === "") return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

export function getConfigNumber(key: string, defaultValue = 0): number {
  const value = getConfig(key, "");
  if (value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function getConfigDecrypted(key: string, defaultValue = ""): string {
  const value = getConfig(key, "");
  if (!value) return defaultValue;
  if (!ENCRYPTED_KEYS.has(key)) return value;
  try {
    return decryptConfig(value) || defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  const db = await getDb();
  await upsertRow(db, appConfig, { key, value }, appConfig.key, { value });
  invalidateConfigCache();
}

export async function setConfigBatch(values: Record<string, string>): Promise<void> {
  await withTransaction(async (tx) => {
    for (const [key, value] of Object.entries(values)) {
      await upsertRow(tx, appConfig, { key, value }, appConfig.key, { value });
    }
  });
  invalidateConfigCache();
}

/**
 * Atomically increments a token sequence and returns the new value.
 * The read-modify-write in upstream `Appconfig::acquire_next_invoice_sequence`
 * is replaced by a single UPDATE (DEV-01); rendered numbers are identical.
 */
export async function acquireNextSequence(
  key:
    | "last_used_invoice_number"
    | "last_used_quote_number"
    | "last_used_work_order_number",
): Promise<number> {
  if (IS_MYSQL) {
    // MySQL 8 has no UPDATE ... RETURNING. A row-locking transaction keeps the
    // read-modify-write atomic with the same observable result as the SQLite
    // UPDATE ... RETURNING path (DEV-01).
    const connection = await getRawMysqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT value FROM ospos_app_config WHERE `key` = ? FOR UPDATE",
        [key],
      );
      const current = rows.length > 0 ? parseInt(String(rows[0].value), 10) : 0;
      const next = Number.isFinite(current) ? current + 1 : 1;
      if (rows.length > 0) {
        await connection.query(
          "UPDATE ospos_app_config SET value = ? WHERE `key` = ?",
          [String(next), key],
        );
      } else {
        await connection.query(
          "INSERT INTO ospos_app_config (`key`, value) VALUES (?, ?)",
          [key, String(next)],
        );
      }
      await connection.commit();
      if (cache) cache.set(key, String(next));
      return next;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  const db = await getDb();
  const increment = sql`CAST(CAST(${appConfig.value} AS INTEGER) + 1 AS TEXT)`;
  const row = await db
    .update(appConfig)
    .set({ value: increment })
    .where(eq(appConfig.key, key))
    .returning({ value: appConfig.value });
  const result = Array.isArray(row) ? row[0] : row;
  if (!result) {
    await db.insert(appConfig).values({ key, value: "1" });
    invalidateConfigCache();
    return 1;
  }
  const next = parseInt(result.value, 10);
  if (cache) cache.set(key, String(next));
  return next;
}

export async function getSequenceValue(key: string): Promise<number> {
  await loadConfig();
  const value = getConfig(key, "0");
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
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

export function currencySymbol(): string {
  return getConfig("currency_symbol", "$");
}

export function dateFormat(): string {
  return getConfig("dateformat", "m/d/Y");
}

export function timeFormat(): string {
  return getConfig("timeformat", "H:i:s");
}

export function timezone(): string {
  return getConfig("timezone", "UTC");
}

export function languageCode(): string {
  return getConfig("language_code", "en");
}

export function taxIncluded(): boolean {
  return getConfigBool("tax_included", false);
}

export function useDestinationBasedTax(): boolean {
  return getConfigBool("use_destination_based_tax", false);
}

export function isConfigLoaded(): boolean {
  return cache !== null;
}

export function dateOrTimeFormat(): boolean {
  return getConfigBool("date_or_time_format", false);
}
