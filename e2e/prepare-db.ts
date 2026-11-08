import fs from "node:fs";
import path from "node:path";
import { seedDatabase } from "../src/db/seed";

/**
 * Runs inside the Playwright web-server command, before `next dev` opens the
 * database. Deleting the file (and its WAL/SHM sidecars) here is safe because
 * no process has the handle yet.
 */
async function prepare() {
  const dbFile = path.resolve(process.cwd(), "e2e-results/test.db");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.DB_DRIVER = "sqlite";
  await seedDatabase();
}

prepare().catch((error: unknown) => {
  console.error("e2e database preparation failed:", error);
  process.exit(1);
});
