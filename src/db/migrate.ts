import { createSqliteDb } from "@/lib/db/sqlite";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";

const db = createSqliteDb();
const migrationsFolder = path.resolve(process.cwd(), "drizzle/sqlite");
migrate(db, { migrationsFolder });
console.log("Migrations applied");
process.exit(0);