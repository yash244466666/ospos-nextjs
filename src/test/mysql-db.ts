import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { getRawMysqlPool } from "@/lib/db/mysql";

export function testMysqlUrl(): string {
  return process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3307/ospos_test";
}

/**
 * Drops and recreates the test database from the generated MySQL migration.
 * Must run once before the first query so the cached application pool never
 * points at a dropped schema.
 */
export async function resetMysqlDatabase(): Promise<void> {
  const url = testMysqlUrl();
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "");
  parsed.pathname = "/";
  const admin = await mysql.createConnection(parsed.toString());
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci`,
    );
  } finally {
    await admin.end();
  }

  const migrationFile = fs
    .readdirSync(path.resolve(process.cwd(), "drizzle/mysql"))
    .filter((file) => file.endsWith(".sql"))
    .sort()[0];
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), "drizzle/mysql", migrationFile),
    "utf8",
  );
  const connection = await mysql.createConnection(url);
  try {
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await connection.query(trimmed);
    }
  } finally {
    await connection.end();
  }
}

/** Truncates every ospos_ table between tests without dropping the schema. */
export async function truncateMysqlTables(): Promise<void> {
  const pool = getRawMysqlPool();
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'ospos\\_%'`,
  );
  const names = rows.map((row) => String(row.name));
  if (names.length === 0) return;
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const name of names) {
      await pool.query(`TRUNCATE TABLE \`${name}\``);
    }
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

export async function execMysql(sql: string, params: unknown[] = []): Promise<void> {
  await getRawMysqlPool().query(sql, params);
}

export async function queryMysql<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getRawMysqlPool().query(sql, params);
  return rows as T[];
}
