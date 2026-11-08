import { queryRows, DRIVER } from "./db";
import {
  CUSTOMER_PACKAGE_SEEDS,
  DINNER_TABLE_SEEDS,
  MODULE_SEEDS,
  PERMISSION_SEEDS,
  UNGRANTED_PERMISSION_IDS,
  STOCK_LOCATION_SEEDS,
} from "../../src/db/seed-data";
import { fail, ok, type Difference } from "./lib";

async function main(): Promise<void> {
  const differences: Difference[] = [];

  const modules = await queryRows<{
    module_id: string;
    name_lang_key: string;
    desc_lang_key: string;
    sort: number;
  }>("SELECT module_id, name_lang_key, desc_lang_key, sort FROM ospos_modules");
  if (modules.length !== 18) {
    differences.push({ table: "modules", issue: `row count ${modules.length} != 18` });
  }
  const moduleById = new Map(modules.map((row) => [row.module_id, row]));
  for (const expected of MODULE_SEEDS) {
    const actual = moduleById.get(expected.moduleId);
    if (!actual) {
      differences.push({ table: "modules", issue: `missing ${expected.moduleId}` });
      continue;
    }
    if (
      actual.name_lang_key !== expected.nameLangKey ||
      actual.desc_lang_key !== expected.descLangKey ||
      Number(actual.sort) !== expected.sort
    ) {
      differences.push({ table: "modules", issue: `row mismatch ${expected.moduleId}` });
    }
  }

  const permissions = await queryRows<{
    permission_id: string;
    module_id: string;
    location_id: number | null;
  }>("SELECT permission_id, module_id, location_id FROM ospos_permissions");
  if (permissions.length !== 36) {
    differences.push({ table: "permissions", issue: `row count ${permissions.length} != 36` });
  }
  const permissionById = new Map(permissions.map((row) => [row.permission_id, row]));
  for (const expected of PERMISSION_SEEDS) {
    const actual = permissionById.get(expected.permissionId);
    if (!actual) {
      differences.push({ table: "permissions", issue: `missing ${expected.permissionId}` });
      continue;
    }
    if (
      actual.module_id !== expected.moduleId ||
      (actual.location_id ?? null) !== expected.locationId
    ) {
      differences.push({
        table: "permissions",
        issue: `row mismatch ${expected.permissionId}`,
      });
    }
  }

  const grants = await queryRows<{
    permission_id: string;
    person_id: number;
    menu_group: string | null;
  }>("SELECT permission_id, person_id, menu_group FROM ospos_grants WHERE person_id = 1");
  // DEV-07: grant `taxes` to admin so the module is usable; upstream's
  // migration only updates a grant row that was never inserted. When the
  // script runs against the PHP oracle, PARITY_ALLOW_DEV=1 exempts it.
  const oracleMode = process.env.PARITY_ALLOW_DEV === "1";
  const expectedGrants = PERMISSION_SEEDS.filter(
    (permission) =>
      !UNGRANTED_PERMISSION_IDS.has(permission.permissionId) &&
      !(oracleMode && permission.permissionId === "taxes"),
  );
  const grantedPermissionCount = expectedGrants.length;
  if (grants.length !== grantedPermissionCount) {
    differences.push({
      table: "grants",
      issue: `row count ${grants.length} != ${grantedPermissionCount}`,
    });
  }
  const grantByPermission = new Map(grants.map((row) => [row.permission_id, row]));
  for (const expected of expectedGrants) {
    const actual = grantByPermission.get(expected.permissionId);
    if (!actual) {
      differences.push({ table: "grants", issue: `missing ${expected.permissionId}` });
      continue;
    }
    if ((actual.menu_group ?? "") !== expected.menuGroup) {
      differences.push({
        table: "grants",
        issue: `${expected.permissionId} menu_group ${actual.menu_group} != ${expected.menuGroup}`,
      });
    }
  }

  const packages = await queryRows<{
    package_id: number;
    package_name: string;
    points_percent: number;
    deleted: number;
  }>(
    "SELECT package_id, package_name, points_percent, deleted FROM ospos_customers_packages",
  );
  if (packages.length !== 5) {
    differences.push({ table: "customers_packages", issue: `row count ${packages.length} != 5` });
  }
  for (const expected of CUSTOMER_PACKAGE_SEEDS) {
    const actual = packages.find((row) => Number(row.package_id) === expected.packageId);
    if (
      !actual ||
      actual.package_name !== expected.packageName ||
      Number(actual.points_percent) !== expected.pointsPercent ||
      Number(actual.deleted) !== 0
    ) {
      differences.push({
        table: "customers_packages",
        issue: `row mismatch ${expected.packageId}`,
      });
    }
  }

  const dinnerTables = await queryRows<{
    dinner_table_id: number;
    name: string;
    status: number;
    deleted: number;
  }>("SELECT dinner_table_id, name, status, deleted FROM ospos_dinner_tables");
  if (dinnerTables.length !== 2) {
    differences.push({ table: "dinner_tables", issue: `row count ${dinnerTables.length} != 2` });
  }
  for (const expected of DINNER_TABLE_SEEDS) {
    const actual = dinnerTables.find(
      (row) => Number(row.dinner_table_id) === expected.dinnerTableId,
    );
    if (!actual || actual.name !== expected.name) {
      differences.push({ table: "dinner_tables", issue: `row mismatch ${expected.name}` });
    }
  }

  const locations = await queryRows<{
    location_id: number;
    location_name: string;
    deleted: number;
    is_default: number;
    sort_order: number | null;
  }>(
    "SELECT location_id, location_name, deleted, is_default, sort_order FROM ospos_stock_locations",
  );
  if (locations.length !== 1) {
    differences.push({ table: "stock_locations", issue: `row count ${locations.length} != 1` });
  }
  for (const expected of STOCK_LOCATION_SEEDS) {
    const actual = locations.find((row) => Number(row.location_id) === expected.locationId);
    if (
      !actual ||
      actual.location_name !== expected.locationName ||
      Number(actual.is_default) !== (expected.isDefault ? 1 : 0) ||
      Number(actual.sort_order) !== expected.sortOrder
    ) {
      differences.push({ table: "stock_locations", issue: `row mismatch ${expected.locationName}` });
    }
  }

  if (differences.length > 0) fail(differences, `Seed parity (${DRIVER})`);
  ok(
    `Seed parity PASS (${DRIVER}): 18 modules, 36 permissions, ${grantedPermissionCount} grants, 5 packages, 2 tables, 1 location`,
  );
}

main().catch((error: unknown) => {
  console.error("Seed parity failed:", (error as Error).message);
  process.exit(2);
});
