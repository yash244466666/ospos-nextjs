import type { SQL } from "drizzle-orm";
import { IS_MYSQL, type Db } from "@/lib/db";

/**
 * Executes a write and returns the number of affected rows on both dialects.
 * Drizzle's MySQL raw result is `[ResultSetHeader, FieldPacket[]]`; the
 * better-sqlite3 driver returns `{ changes }`.
 */
export async function affectedRows(tx: Db, query: SQL): Promise<number> {
  if (IS_MYSQL) {
    const db = tx as unknown as {
      execute: (query: SQL) => Promise<[unknown, unknown] | unknown>;
    };
    const result = await db.execute(query);
    const header = Array.isArray(result) ? result[0] : result;
    return Number((header as { affectedRows?: number }).affectedRows ?? 0);
  }
  const result = (await tx.run(query)) as unknown as { changes?: number };
  return Number(result.changes ?? 0);
}
