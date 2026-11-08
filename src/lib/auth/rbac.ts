import { and, asc, eq, like, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appConfig, employees, grants, modules, permissions } from "@/db/schema";
import { ADMIN_MODULES } from "@/lib/constants";

export { ADMIN_MODULES };

export interface AllowedModule {
  moduleId: string;
  nameLangKey: string;
  descLangKey: string;
  sort: number;
  menuGroup: string | null;
}

export async function isAdmin(personId: number): Promise<boolean> {
  if (personId === 1) return true;
  for (const moduleId of ADMIN_MODULES) {
    if (!(await hasGrant(moduleId, personId))) return false;
  }
  return true;
}

/** Exact grant lookup — no admin bypass (`Employee::has_grant`). */
export async function hasGrant(
  permissionId: string | null,
  personId: number | null,
): Promise<boolean> {
  if (permissionId === null || permissionId === undefined) return true;
  if (personId === null || personId === undefined) return false;
  const db = await getDb();
  const rows = await db
    .select({ permissionId: grants.permissionId })
    .from(grants)
    .where(and(eq(grants.personId, personId), eq(grants.permissionId, permissionId)))
    .limit(1);
  return rows.length === 1;
}

async function hasSubpermissions(permissionId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ permissionId: permissions.permissionId })
    .from(permissions)
    .where(like(permissions.permissionId, `${permissionId}_%`))
    .limit(1);
  return rows.length === 0;
}

/**
 * `Employee::has_module_grant`: prefix-match the grants table. A single
 * matching grant is only sufficient when the permission has no subpermissions.
 */
export async function hasModuleGrant(
  permissionId: string,
  personId: number,
): Promise<boolean> {
  const db = await getDb();
  const matching = await db
    .select({ permissionId: grants.permissionId })
    .from(grants)
    .where(and(eq(grants.personId, personId), like(grants.permissionId, `${permissionId}%`)));
  if (matching.length !== 1) return matching.length !== 0;
  return hasSubpermissions(permissionId);
}

/** `Employee::get_menu_group`. */
export async function getMenuGroup(
  permissionId: string,
  personId: number | null,
): Promise<string> {
  if (personId === null) return "home";
  const db = await getDb();
  const rows = await db
    .select({ menuGroup: grants.menuGroup })
    .from(grants)
    .where(and(eq(grants.permissionId, permissionId), eq(grants.personId, personId)))
    .limit(1);
  return rows[0]?.menuGroup ?? "home";
}

/**
 * `Employee::canModifyEmployee`:
 * - self: allowed unless the target is an admin and the actor is not.
 * - target is admin and actor is not: denied.
 * - otherwise allowed.
 */
export async function canModifyEmployee(
  targetPersonId: number,
  currentPersonId: number,
): Promise<boolean> {
  if (targetPersonId === currentPersonId) {
    return !(await isAdmin(targetPersonId)) || (await isAdmin(currentPersonId));
  }
  if ((await isAdmin(targetPersonId)) && !(await isAdmin(currentPersonId))) {
    return false;
  }
  return true;
}

async function allowedModules(personId: number, menuGroups: string[]): Promise<AllowedModule[]> {
  const db = await getDb();
  const rows = await db
    .select({
      moduleId: modules.moduleId,
      nameLangKey: modules.nameLangKey,
      descLangKey: modules.descLangKey,
      sort: modules.sort,
      menuGroup: grants.menuGroup,
    })
    .from(modules)
    .innerJoin(permissions, eq(permissions.permissionId, modules.moduleId))
    .innerJoin(grants, eq(grants.permissionId, permissions.permissionId))
    .where(and(eq(grants.personId, personId), ne(modules.sort, 0)))
    .orderBy(asc(modules.sort));
  return rows.filter(
    (row) => row.menuGroup !== null && menuGroups.includes(row.menuGroup),
  );
}

export function getAllowedModules(
  personId: number,
  menuGroup: "home" | "office" | "both" = "both",
): Promise<AllowedModule[]> {
  const menuGroups =
    menuGroup === "both" ? ["home", "office", "both"] : [menuGroup, "both"];
  return allowedModules(personId, menuGroups);
}

export function getAllowedHomeModules(personId: number): Promise<AllowedModule[]> {
  return allowedModules(personId, ["home", "both"]);
}

export function getAllowedOfficeModules(personId: number): Promise<AllowedModule[]> {
  return allowedModules(personId, ["office", "both"]);
}

export async function getAllGrantedPermissions(personId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ permissionId: grants.permissionId })
    .from(grants)
    .where(eq(grants.personId, personId));
  return rows.map((row) => row.permissionId);
}

export async function getEmployeeGrants(
  personId: number,
): Promise<{ permissionId: string; personId: number; menuGroup: string | null }[]> {
  const db = await getDb();
  return db
    .select({
      permissionId: grants.permissionId,
      personId: grants.personId,
      menuGroup: grants.menuGroup,
    })
    .from(grants)
    .where(eq(grants.personId, personId));
}

/** Active employee row for login; mirrors `employees.deleted = 0`. */
export async function getEmployeeByUsername(username: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.username, username), eq(employees.deleted, false)))
    .limit(1);
  return rows[0] ?? null;
}

/** `Appconfig::get_value` used by login/install state. */
export async function getAppConfigValue(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}
