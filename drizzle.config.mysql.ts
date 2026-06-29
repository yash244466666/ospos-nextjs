import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://root:pointofsale@localhost:3306/ospos",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});