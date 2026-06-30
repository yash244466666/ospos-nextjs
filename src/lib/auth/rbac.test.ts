process.env.DATABASE_URL = ":memory:";

import { describe, it, expect, beforeAll } from "vitest";
import { getDbSync } from "@/lib/db";
import { employees, grants, modules, people, permissions } from "@/db/schema";
import { isAdmin, hasGrant, hasModuleGrant } from "./rbac";

describe("rbac", () => {
  let adminId: number;
  let clerkId: number;

  beforeAll(() => {
    const db = getDbSync();

    const adminPerson = db.insert(people).values({ firstName: "Admin" }).returning().get();
    adminId = adminPerson.personId;
    db.insert(employees).values({ personId: adminId, username: "admin", password: "x", hashVersion: 2 }).run();

    const clerkPerson = db.insert(people).values({ firstName: "Clerk" }).returning().get();
    clerkId = clerkPerson.personId;
    db.insert(employees).values({ personId: clerkId, username: "clerk", password: "x", hashVersion: 2 }).run();

    for (const m of ["reports", "sales", "items"]) {
      db.insert(modules).values({ moduleId: m, nameLangKey: m, descLangKey: `${m}_desc`, sort: 0 }).run();
    }

    for (const p of ["reports", "reports_sales", "reports_categories", "sales", "sales_delete", "items", "items_stock"]) {
      db.insert(permissions).values({ permissionId: p, moduleId: p.split("_")[0] }).run();
    }

    // Clerk has only the reports_sales subpermission.
    db.insert(grants).values({ permissionId: "reports_sales", personId: clerkId, menuGroup: "both" }).run();
  });

  it("isAdmin returns true for person_id 1", () => {
    expect(isAdmin(1)).toBe(true);
  });

  it("hasGrant checks exact permission", () => {
    expect(hasGrant("reports_sales", clerkId)).toBe(true);
    expect(hasGrant("reports", clerkId)).toBe(false);
    expect(hasGrant("sales", clerkId)).toBe(false);
  });

  it("hasModuleGrant matches subpermissions with underscore prefix", () => {
    // Clerk has only reports_sales, so reports submodule checks pass.
    expect(hasModuleGrant("reports_sales", clerkId)).toBe(true);
    // Parent module check: exactly one subpermission grant and subpermissions exist => false.
    expect(hasModuleGrant("reports", clerkId)).toBe(false);
  });

  it("hasModuleGrant returns true when multiple subpermissions are granted", () => {
    const db = getDbSync();
    db.insert(grants).values({ permissionId: "reports_categories", personId: clerkId, menuGroup: "both" }).run();
    expect(hasModuleGrant("reports", clerkId)).toBe(true);
  });

  it("hasModuleGrant returns true for modules with no subpermissions", () => {
    const db = getDbSync();
    db.insert(grants).values({ permissionId: "sales", personId: clerkId, menuGroup: "both" }).run();
    expect(hasModuleGrant("sales", clerkId)).toBe(true);
  });

  it("isAdmin treats person_id 1 as admin regardless of grants", () => {
    expect(isAdmin(adminId)).toBe(adminId === 1);
  });
});
