import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const migrations = sqliteTable("migrations", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  version: integer("version", { mode: "number" }).notNull(),
  class: text("class").notNull(),
  namespace: text("namespace").notNull(),
  time: integer("time", { mode: "number" }).notNull(),
});