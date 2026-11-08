import fs from "node:fs";
import path from "node:path";
import { resetSqliteDbInstance } from "@/lib/db";
import { getRawSqlite } from "@/lib/db/sqlite";

/**
 * Recreates the in-memory SQLite schema from the generated migration.
 * Test files run in separate workers, so module-level state is isolated.
 */
export function resetTestDatabase(): void {
  resetSqliteDbInstance();
  const migrationFile = fs
    .readdirSync(path.resolve(process.cwd(), "drizzle/sqlite"))
    .filter((file) => file.endsWith(".sql"))
    .sort()[0];
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), "drizzle/sqlite", migrationFile),
    "utf8",
  );
  const raw = getRawSqlite();
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) raw.exec(trimmed);
  }
}
