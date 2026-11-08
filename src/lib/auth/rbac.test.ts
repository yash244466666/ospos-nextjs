import { describe, expect, it, beforeEach } from "vitest";
import { getRawSqlite } from "@/lib/db/sqlite";
import { resetTestDatabase } from "@/test/db";
import { hasGrant, hasModuleGrant, isAdmin } from "./rbac";

function sql(sqlText: string): void {
  getRawSqlite().exec(sqlText);
}

function seedPeopleAndGrants(): { adminId: number; clerkId: number } {
  sql(
    `INSERT INTO ospos_people (person_id, first_name, last_name, phone_number, email, address_1, address_2, city, state, zip, country, comments)
     VALUES (1, 'Admin', 'User', '', '', '', '', '', '', '', '', ''),
            (2, 'Clerk', 'User', '', '', '', '', '', '', '', '', '')`,
  );
  sql(
    `INSERT INTO ospos_employees (person_id, username, password, hash_version) VALUES
      (1, 'admin', 'x', 2), (2, 'clerk', 'x', 2)`,
  );
  for (const moduleId of ["reports", "sales", "items"]) {
    sql(
      `INSERT INTO ospos_modules (module_id, name_lang_key, desc_lang_key, sort) VALUES
        ('${moduleId}', 'module_${moduleId}', 'module_${moduleId}_desc', 0)`,
    );
  }
  for (const permission of [
    "reports",
    "reports_sales",
    "reports_categories",
    "sales",
    "sales_delete",
    "items",
    "items_stock",
  ]) {
    sql(
      `INSERT INTO ospos_permissions (permission_id, module_id) VALUES
        ('${permission}', '${permission.split("_")[0]}')`,
    );
  }
  sql(
    `INSERT INTO ospos_grants (permission_id, person_id, menu_group) VALUES
      ('reports_sales', 2, 'home')`,
  );
  return { adminId: 1, clerkId: 2 };
}

beforeEach(() => {
  resetTestDatabase();
});

describe("RBAC parity", () => {
  it("isAdmin is true for person_id 1", async () => {
    seedPeopleAndGrants();
    expect(await isAdmin(1)).toBe(true);
  });

  it("hasGrant is an exact match with no admin bypass", async () => {
    const { clerkId } = seedPeopleAndGrants();
    expect(await hasGrant("reports_sales", clerkId)).toBe(true);
    expect(await hasGrant("reports", clerkId)).toBe(false);
    expect(await hasGrant("sales", clerkId)).toBe(false);
    expect(await hasGrant(null, clerkId)).toBe(true);
    expect(await hasGrant("reports_sales", null)).toBe(false);
  });

  it("hasModuleGrant uses LIKE prefix and has_subpermissions for a single grant", async () => {
    const { clerkId } = seedPeopleAndGrants();
    expect(await hasModuleGrant("reports_sales", clerkId)).toBe(true);
    // Exactly one reports% grant and reports has subpermissions => false.
    expect(await hasModuleGrant("reports", clerkId)).toBe(false);
  });

  it("hasModuleGrant returns true when multiple subpermissions are granted", async () => {
    const { clerkId } = seedPeopleAndGrants();
    sql(
      `INSERT INTO ospos_grants (permission_id, person_id, menu_group) VALUES ('reports_categories', 2, 'home')`,
    );
    expect(await hasModuleGrant("reports", clerkId)).toBe(true);
  });

  it("hasModuleGrant returns false when the module has subpermissions (sales_delete)", async () => {
    const { clerkId } = seedPeopleAndGrants();
    sql(
      `INSERT INTO ospos_grants (permission_id, person_id, menu_group) VALUES ('sales', 2, 'home')`,
    );
    expect(await hasModuleGrant("sales", clerkId)).toBe(false);
  });

  it("hasModuleGrant returns true for a leaf permission with no subpermissions", async () => {
    const { clerkId } = seedPeopleAndGrants();
    sql(
      `INSERT INTO ospos_modules (module_id, name_lang_key, desc_lang_key, sort) VALUES
        ('expenses_categories', 'module_expenses_categories', 'module_expenses_categories_desc', 0)`,
    );
    sql(
      `INSERT INTO ospos_permissions (permission_id, module_id) VALUES ('expenses_categories', 'expenses_categories')`,
    );
    sql(
      `INSERT INTO ospos_grants (permission_id, person_id, menu_group) VALUES ('expenses_categories', 2, 'home')`,
    );
    expect(await hasModuleGrant("expenses_categories", clerkId)).toBe(true);
  });

  it("isAdmin is false for a clerk missing admin modules", async () => {
    const { clerkId } = seedPeopleAndGrants();
    expect(await isAdmin(clerkId)).toBe(false);
  });

  it("isAdmin becomes true when every ADMIN_MODULES grant exists", async () => {
    const { clerkId } = seedPeopleAndGrants();
    const adminModules = [
      "customers", "employees", "giftcards", "items", "item_kits",
      "messages", "receivings", "reports", "sales", "config", "suppliers",
    ];
    for (const moduleId of adminModules) {
      sql(
        `INSERT OR IGNORE INTO ospos_modules (module_id, name_lang_key, desc_lang_key, sort) VALUES
          ('${moduleId}', 'module_${moduleId}', 'module_${moduleId}_desc', 0)`,
      );
      sql(
        `INSERT OR IGNORE INTO ospos_permissions (permission_id, module_id) VALUES ('${moduleId}', '${moduleId}')`,
      );
      sql(
        `INSERT OR IGNORE INTO ospos_grants (permission_id, person_id, menu_group) VALUES ('${moduleId}', ${clerkId}, 'home')`,
      );
    }
    expect(await isAdmin(clerkId)).toBe(true);
  });
});
