import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "@/db/schema";

export type SqliteDb = BetterSQLite3Database<typeof schema>;

export function createSqliteDb(): SqliteDb {
  const url = process.env.DATABASE_URL ?? "sqlite.db";
  const filename = url.startsWith("file:") ? url.slice(5) : url;
  const sqlite = new Database(filename);
  if (filename !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema, casing: "snake_case" });
  if (filename === ":memory:") {
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle/sqlite") });
  }
  return db;
}