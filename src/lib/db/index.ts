import { createSqliteDb, type SqliteDb } from "./sqlite";
import type { MysqlDb } from "./mysql";

export type Db = SqliteDb | MysqlDb;
export type { SqliteDb, MysqlDb };

export const DB_DRIVER = (process.env.DB_DRIVER ?? "sqlite") as "sqlite" | "mysql";
export const IS_SQLITE = DB_DRIVER === "sqlite";
export const IS_MYSQL = DB_DRIVER === "mysql";

let sqliteInstance: SqliteDb | null = null;
let mysqlPromise: Promise<MysqlDb> | null = null;

export function getSqliteSync(): SqliteDb {
  if (!sqliteInstance) {
    sqliteInstance = createSqliteDb();
  }
  return sqliteInstance;
}

async function getMysql(): Promise<MysqlDb> {
  if (!mysqlPromise) {
    mysqlPromise = import("./mysql").then((m) => m.createMysqlDb());
  }
  return mysqlPromise;
}

export async function getDb(): Promise<Db> {
  return IS_MYSQL ? await getMysql() : getSqliteSync();
}

export function getDbSync(): SqliteDb {
  if (IS_MYSQL) {
    throw new Error("getDbSync() is SQLite-only; MySQL is async — use getDb()");
  }
  return getSqliteSync();
}