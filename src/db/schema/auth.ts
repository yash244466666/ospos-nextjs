import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const people = sqliteTable("people", {
  personId: integer("person_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  gender: integer("gender", { mode: "number" }).default(0),
  phoneNumber: text("phone_number"),
  email: text("email"),
  address1: text("address_1"),
  address2: text("address_2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  country: text("country"),
  comments: text("comments"),
});

export const employees = sqliteTable("employees", {
  personId: integer("person_id", { mode: "number" }).primaryKey().references(() => people.personId, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  hashVersion: integer("hash_version", { mode: "number" }).notNull().default(2),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  language: text("language"),
  languageCode: text("language_code"),
});

export const modules = sqliteTable("modules", {
  moduleId: text("module_id").primaryKey(),
  nameLangKey: text("name_lang_key").notNull(),
  descLangKey: text("desc_lang_key").notNull().unique(),
  sort: integer("sort", { mode: "number" }).notNull().default(0),
});

export const stockLocations = sqliteTable("stock_locations", {
  locationId: integer("location_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  locationName: text("location_name").notNull(),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const permissions = sqliteTable("permissions", {
  permissionId: text("permission_id").primaryKey(),
  moduleId: text("module_id").notNull().references(() => modules.moduleId, { onDelete: "cascade" }),
  locationId: integer("location_id", { mode: "number" }).references(() => stockLocations.locationId, { onDelete: "cascade" }),
});

export const grants = sqliteTable("grants", {
  permissionId: text("permission_id").notNull().references(() => permissions.permissionId, { onDelete: "cascade" }),
  personId: integer("person_id", { mode: "number" }).notNull().references(() => employees.personId, { onDelete: "cascade" }),
  menuGroup: text("menu_group", { enum: ["home", "office", "both"] }).default("both"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  ipAddress: text("ip_address"),
  timestamp: integer("timestamp", { mode: "number" }).notNull(),
  data: text("data"),
});

export const cartSessions = sqliteTable("cart_sessions", {
  sessionId: text("session_id").primaryKey(),
  personId: integer("person_id", { mode: "number" }).notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
});