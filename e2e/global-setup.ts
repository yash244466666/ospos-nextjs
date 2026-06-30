import path from "node:path";
import fs from "node:fs";
import { seedDatabase } from "../src/db/seed";

async function globalSetup() {
  const dbFile = path.resolve(process.cwd(), "e2e-results/test.db");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  // Start each test run with a clean database so prior failures don't leave duplicates.
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.DB_DRIVER = "sqlite";

  await seedDatabase();
}

export default globalSetup;
