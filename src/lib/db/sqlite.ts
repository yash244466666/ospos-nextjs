import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "@/db/schema";

export type SqliteDb = BetterSQLite3Database<typeof schema>;

let raw: Database.Database | null = null;

export function getRawSqlite(): Database.Database {
  if (!raw) {
    const url = process.env.DATABASE_URL ?? "sqlite.db";
    const filename = url.startsWith("file:") ? url.slice(5) : url;
    raw = new Database(filename);
    if (filename !== ":memory:") {
      raw.pragma("journal_mode = WAL");
    }
    raw.pragma("foreign_keys = ON");
  }
  return raw;
}

export function createSqliteDb(): SqliteDb {
  const sqlite = getRawSqlite();
  return drizzle(sqlite, { schema, casing: "snake_case" });
}

export function resetSqliteInstance(): void {
  raw?.close();
  raw = null;
}

export { path };
