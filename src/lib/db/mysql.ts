import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@/db/schema/mysql";

export type MysqlDb = MySql2Database<typeof schema>;

let pool: mysql.Pool | null = null;

export function getRawMysqlPool(): mysql.Pool {
  if (!pool) {
    const url =
      process.env.DATABASE_URL ?? "mysql://root:pointofsale@localhost:3306/ospos";
    pool = mysql.createPool({
      uri: url,
      multipleStatements: true,
      decimalNumbers: false,
      timezone: process.env.DB_TIMEZONE ?? "local",
      charset: "utf8mb4",
    });
  }
  return pool;
}

export async function createMysqlDb(): Promise<MysqlDb> {
  return drizzle(getRawMysqlPool(), { schema, casing: "snake_case", mode: "default" });
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
