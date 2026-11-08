import { getDb, IS_SQLITE } from "@/lib/db";
import { getRawSqlite } from "@/lib/db/sqlite";
import { getRawMysqlPool } from "@/lib/db/mysql";

export async function reportQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (IS_SQLITE) {
    return getRawSqlite().prepare(text).all(...params) as T[];
  }
  const pool = getRawMysqlPool();
  const [rows] = await pool.query(text, params);
  return rows as T[];
}

export async function reportAll<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await getDb();
  return reportQuery<T>(text, params);
}
