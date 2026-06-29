import { and, eq, like, ne, sql } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { employees, grants, permissions, modules } from "@/db/schema";

export const ADMIN_MODULES = [
  "customers", "employees", "giftcards", "items", "item_kits",
  "messages", "receivings", "reports", "sales", "config", "suppliers",
] as const;

export interface AllowedModule {
  moduleId: string;
  nameLangKey: string;
  descLangKey: string;
  sort: number;
  menuGroup: "home" | "office" | "both" | null;
}

export function isAdmin(personId: number): boolean {
  if (personId === 1) return true;
  const db = getDbSync();
  const granted = db
    .select({ permissionId: grants.permissionId })
    .from(grants)
    .where(eq(grants.personId, personId))
    .all()
    .map((r) => r.permissionId);
  const set = new Set(granted);
  return ADMIN_MODULES.every((m) => set.has(m));
}

export function hasGrant(permissionId: string | null, personId: number | null): boolean {
  if (permissionId === null) return true;
  if (personId === null) return false;
  if (isAdmin(personId)) return true;
  const db = getDbSync();
  const row = db
    .select()
    .from(grants)
    .where(and(eq(grants.permissionId, permissionId), eq(grants.personId, personId)))
    .get();
  return !!row;
}

export function hasModuleGrant(moduleId: string, personId: number): boolean {
  if (isAdmin(personId)) return true;
  const db = getDbSync();
  const matching = db
    .select({ permissionId: grants.permissionId })
    .from(grants)
    .where(and(eq(grants.personId, personId), like(grants.permissionId, `${moduleId} %`)))
    .all();
  if (matching.length === 0) {
    const direct = db
      .select()
      .from(grants)
      .where(and(eq(grants.personId, personId), eq(grants.permissionId, moduleId)))
      .get();
    return !!direct;
  }
  if (matching.length === 1) {
    const perm = matching[0].permissionId;
    if (perm === moduleId) return true;
    const subperms = db
      .select()
      .from(permissions)
      .where(like(permissions.permissionId, `${moduleId}_%`))
      .all();
    return subperms.length === 0;
  }
  return true;
}

export function getAllowedModules(personId: number, menuGroup: "home" | "office" | "both" = "both"): AllowedModule[] {
  const db = getDbSync();
  const rows = db
    .select({
      moduleId: modules.moduleId,
      nameLangKey: modules.nameLangKey,
      descLangKey: modules.descLangKey,
      sort: modules.sort,
      menuGroup: grants.menuGroup,
    })
    .from(modules)
    .innerJoin(grants, eq(grants.permissionId, modules.moduleId))
    .where(and(eq(grants.personId, personId), eq(modules.sort, sql`0`)))
    .all()
    .filter((r) => menuGroup === "both" || r.menuGroup === menuGroup || r.menuGroup === "both");
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.moduleId)) return false;
    seen.add(r.moduleId);
    return true;
  });
}

export function getAllGrantedPermissions(personId: number): string[] {
  const db = getDbSync();
  return db
    .select({ permissionId: grants.permissionId })
    .from(grants)
    .where(eq(grants.personId, personId))
    .all()
    .map((r) => r.permissionId);
}

export { ADMIN_MODULES as ADMIN_MODULES_LIST };