import { beforeAll } from "vitest";

beforeAll(() => {
  process.env.DB_DRIVER = "sqlite";
  process.env.DATABASE_URL = "file::memory:";
});