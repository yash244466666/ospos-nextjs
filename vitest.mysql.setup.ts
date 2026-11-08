import { beforeAll } from "vitest";
import { resetMysqlDatabase } from "./src/test/mysql-db";

beforeAll(async () => {
  await resetMysqlDatabase();
}, 120_000);
