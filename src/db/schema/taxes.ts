import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { people } from "./auth";

export const taxCategories = sqliteTable("tax_categories", {
  taxCategoryId: integer("tax_category_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  taxCategory: text("tax_category").notNull(),
  taxGroupSeq: text("tax_group_seq"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const taxCodes = sqliteTable("tax_codes", {
  taxCodeId: integer("tax_code_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  taxCode: text("tax_code").notNull(),
  taxCodeName: text("tax_code_name").notNull(),
  city: text("city"),
  state: text("state"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const taxJurisdictions = sqliteTable("tax_jurisdictions", {
  jurisdictionId: integer("jurisdiction_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  jurisdictionName: text("jurisdiction_name").notNull(),
  taxType: text("tax_type").notNull(),
  reportingAuthority: text("reporting_authority"),
  taxableAmount: real("taxable_amount"),
  taxRate: real("tax_rate").notNull().default(0),
  taxGroup: text("tax_group"),
  roundCode: integer("round_code", { mode: "number" }).notNull().default(1),
  cascadeSequence: integer("cascade_sequence", { mode: "number" }).notNull().default(0),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
});

export const taxCodeLinks = sqliteTable("tax_code_links", {
  taxCodeLinkId: integer("tax_code_link_id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  taxCodeId: integer("tax_code_id", { mode: "number" }).notNull(),
  taxCategoryId: integer("tax_category_id", { mode: "number" }).notNull(),
  jurisdictionId: integer("jurisdiction_id", { mode: "number" }).notNull(),
  taxRate: real("tax_rate").notNull().default(0),
  roundCode: integer("round_code", { mode: "number" }).notNull().default(1),
  cascadeSequence: integer("cascade_sequence", { mode: "number" }).notNull().default(0),
});

void people;