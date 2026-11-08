import { getDb, IS_MYSQL, type Db } from "@/lib/db";
import { getRawSqlite } from "@/lib/db/sqlite";

let sqliteQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` in a transaction on both dialects.
 *
 * MySQL uses Drizzle's pooled transaction (one pinned connection). SQLite's
 * driver is synchronous, so a process-level mutex plus explicit BEGIN/COMMIT
 * keeps concurrent server requests from interleaving on the single connection.
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  if (IS_MYSQL) {
    const db = await getDb();
    return db.transaction((tx) => fn(tx as unknown as Db));
  }

  const run = async (): Promise<T> => {
    const db = await getDb();
    const raw = getRawSqlite();
    raw.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(db);
      raw.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        raw.exec("ROLLBACK");
      } catch {
        // The original error is the useful one.
      }
      throw error;
    }
  };

  const result = sqliteQueue.then(run, run);
  sqliteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
