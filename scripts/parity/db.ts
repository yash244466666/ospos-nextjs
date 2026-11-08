import Database from "better-sqlite3";
import mysql from "mysql2/promise";

const DRIVER = (process.env.DB_DRIVER ?? "sqlite") as "sqlite" | "mysql";
const URL =
  process.env.DATABASE_URL ??
  (DRIVER === "sqlite" ? "sqlite.db" : "mysql://root:pointofsale@localhost:3306/ospos");

export async function queryRows<T = Record<string, unknown>>(
  sqlText: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (DRIVER === "mysql") {
    const pool = mysql.createPool({ uri: URL, dateStrings: true });
    try {
      const [rows] = await pool.query(sqlText, params);
      return rows as T[];
    } finally {
      await pool.end();
    }
  }
  const filename = URL.replace(/^file:/, "");
  const db = new Database(filename, { readonly: true });
  try {
    return db.prepare(sqlText).all(...params) as T[];
  } finally {
    db.close();
  }
}

export { DRIVER };
