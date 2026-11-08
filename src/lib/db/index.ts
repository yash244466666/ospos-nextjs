import {
  createSqliteDb,
  getRawSqlite,
  resetSqliteInstance,
  type SqliteDb,
} from "./sqlite";
import { createMysqlDb } from "./mysql";

/**
 * Both dialects share the same logical table objects (the SQLite schema).
 * Drizzle's MySQL builders accept these table definitions at runtime; the
 * MySQL driver only needs the physical names/types, which are identical by
 * design. The union of the two Drizzle database types is not callable in
 * TypeScript, so MySQL instances are surfaced as `SqliteDb`. This is the one
 * deliberate cast in the data layer; every query is still type-checked
 * against the shared schema.
 */
export type Db = SqliteDb;
export type { SqliteDb };

export const DB_DRIVER = (process.env.DB_DRIVER ?? "sqlite") as "sqlite" | "mysql";
export const IS_SQLITE = DB_DRIVER === "sqlite";
export const IS_MYSQL = DB_DRIVER === "mysql";

let sqliteInstance: SqliteDb | null = null;
let mysqlPromise: Promise<SqliteDb> | null = null;

export function getSqliteSync(): SqliteDb {
  if (!sqliteInstance) {
    sqliteInstance = createSqliteDb();
  }
  return sqliteInstance;
}

async function getMysql(): Promise<SqliteDb> {
  if (!mysqlPromise) {
    mysqlPromise = createMysqlDb().then((db) => db as unknown as SqliteDb);
  }
  return mysqlPromise;
}

export async function getDb(): Promise<Db> {
  return IS_MYSQL ? await getMysql() : getSqliteSync();
}

/** Test-only: drops the cached SQLite wrapper and connection. */
export function resetSqliteDbInstance(): void {
  sqliteInstance = null;
  resetSqliteInstance();
}

/** @deprecated Server paths must use `getDb()`; retained for scripts only. */
export function getDbSync(): SqliteDb {
  if (IS_MYSQL) {
    throw new Error("getDbSync() is SQLite-only; MySQL is async — use getDb()");
  }
  return getSqliteSync();
}

export { getRawSqlite };
