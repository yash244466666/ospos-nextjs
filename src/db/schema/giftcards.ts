import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { people } from "./auth";

export const giftcards = sqliteTable("giftcards", {
  giftcardId: integer("giftcard_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  giftcardNumber: text("giftcard_number").notNull().unique(),
  value: real("value").notNull().default(0),
  personId: integer("person_id", { mode: "number" }).references(() => people.personId),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});