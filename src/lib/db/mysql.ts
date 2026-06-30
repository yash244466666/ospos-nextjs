import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@/db/schema/mysql";

export type MysqlDb = MySql2Database<typeof schema>;

export async function createMysqlDb(): Promise<MysqlDb> {
  const url = process.env.DATABASE_URL ?? "mysql://root:pointofsale@localhost:3306/ospos";
  const pool = mysql.createPool({ uri: url, multipleStatements: true });
  return drizzle(pool, { schema, casing: "snake_case", mode: "default" });
}