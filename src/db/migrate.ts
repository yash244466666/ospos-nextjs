import fs from "node:fs";
import path from "node:path";
import { IS_MYSQL } from "@/lib/db";
import { getRawSqlite } from "@/lib/db/sqlite";
import { getRawMysqlPool, closeMysqlPool } from "@/lib/db/mysql";

const MIGRATIONS_DIR = path.resolve(process.cwd(), IS_MYSQL ? "drizzle/mysql" : "drizzle/sqlite");

const CREATE_MIGRATIONS_SQL = IS_MYSQL
  ? `CREATE TABLE IF NOT EXISTS ospos_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      version VARCHAR(255) NOT NULL,
      class VARCHAR(255) NOT NULL,
      \`group\` VARCHAR(255) NOT NULL,
      namespace VARCHAR(255) NOT NULL,
      time INT NOT NULL,
      batch INT UNSIGNED NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci`
  : `CREATE TABLE IF NOT EXISTS ospos_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      class TEXT NOT NULL,
      "group" TEXT NOT NULL,
      namespace TEXT NOT NULL,
      time INTEGER NOT NULL,
      batch INTEGER NOT NULL
    )`;

async function runSql(sql: string): Promise<void> {
  if (IS_MYSQL) {
    await getRawMysqlPool().query(sql);
  } else {
    getRawSqlite().exec(sql);
  }
}

async function appliedVersions(): Promise<Set<string>> {
  const rows = IS_MYSQL
    ? ((await getRawMysqlPool().query("SELECT version FROM ospos_migrations"))[0] as {
        version: string;
      }[])
    : (getRawSqlite().prepare("SELECT version FROM ospos_migrations").all() as {
        version: string;
      }[]);
  return new Set(rows.map((r) => r.version));
}

export async function runMigrations(): Promise<void> {
  await runSql(CREATE_MIGRATIONS_SQL);
  const applied = await appliedVersions();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migration directory not found: ${MIGRATIONS_DIR}`);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(path.basename(f, ".sql")));
  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  const batchRows = IS_MYSQL
    ? ((await getRawMysqlPool().query(
        "SELECT COALESCE(MAX(batch), 0) AS maxBatch FROM ospos_migrations",
      ))[0] as { maxBatch: number }[])
    : (getRawSqlite()
        .prepare("SELECT COALESCE(MAX(batch), 0) AS maxBatch FROM ospos_migrations")
        .all() as { maxBatch: number }[]);
  const batch = Number(batchRows[0]?.maxBatch ?? 0) + 1;

  for (const file of pending) {
    const version = path.basename(file, ".sql");
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        await runSql(statement);
      } catch (err) {
        console.error(`Failed in ${file}:\n${statement}`);
        throw err;
      }
    }
    const params = [version, version, "default", "App", Math.floor(Date.now() / 1000), batch];
    if (IS_MYSQL) {
      await getRawMysqlPool().query(
        "INSERT INTO ospos_migrations (version, class, `group`, namespace, time, batch) VALUES (?, ?, ?, ?, ?, ?)",
        params,
      );
    } else {
      getRawSqlite()
        .prepare(
          'INSERT INTO ospos_migrations (version, class, "group", namespace, time, batch) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(...params);
    }
    console.log(`Applied ${file}`);
  }
}

async function main(): Promise<void> {
  await runMigrations();
  if (IS_MYSQL) {
    await closeMysqlPool();
  }
}

const invokedDirectly = process.argv[1]?.endsWith("migrate.ts") ?? false;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
