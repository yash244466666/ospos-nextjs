import { IS_MYSQL } from "@/lib/db";
import { getRawSqlite } from "@/lib/db/sqlite";
import { getRawMysqlPool, closeMysqlPool } from "@/lib/db/mysql";
import { runMigrations } from "@/db/migrate";
import {
  ADMIN_PASSWORD_HASH,
  UNGRANTED_PERMISSION_IDS,
  APP_CONFIG_DEFAULTS,
  CUSTOMER_PACKAGE_SEEDS,
  DINNER_TABLE_SEEDS,
  MODULE_SEEDS,
  PERMISSION_SEEDS,
  STOCK_LOCATION_SEEDS,
} from "@/db/seed-data";

type Param = string | number | null;

async function run(sql: string, params: Param[] = []): Promise<void> {
  if (IS_MYSQL) {
    await getRawMysqlPool().query(sql, params);
  } else {
    getRawSqlite().prepare(sql).run(...params);
  }
}

async function query<T>(sql: string, params: Param[] = []): Promise<T[]> {
  if (IS_MYSQL) {
    const [rows] = await getRawMysqlPool().query(sql, params);
    return rows as T[];
  }
  return getRawSqlite().prepare(sql).all(...params) as T[];
}

const IGNORE = IS_MYSQL ? "INSERT IGNORE" : "INSERT OR IGNORE";

export async function seedDatabase(): Promise<number> {
  await runMigrations();

  const existing = await query<{ person_id: number }>(
    "SELECT person_id FROM ospos_employees WHERE username = ?",
    ["admin"],
  );

  if (existing.length === 0) {
    await run(
      `INSERT INTO ospos_people
        (person_id, first_name, last_name, gender, phone_number, email, address_1,
         address_2, city, state, zip, country, comments)
       VALUES (1, 'John', 'Doe', NULL, '555-555-5555', 'changeme@example.com',
               'Address 1', '', '', '', '', '', '')`,
    );
    await run(
      `INSERT INTO ospos_employees
        (username, password, person_id, deleted, hash_version, language, language_code)
       VALUES ('admin', ?, 1, 0, 2, NULL, NULL)`,
      [ADMIN_PASSWORD_HASH],
    );
    console.log("Seeded admin employee (admin / pointofsale).");
  }

  for (const loc of STOCK_LOCATION_SEEDS) {
    await run(
      `${IGNORE} INTO ospos_stock_locations
        (location_id, location_name, deleted, is_default, sort_order)
       VALUES (?, ?, 0, ?, ?)`,
      [loc.locationId, loc.locationName, loc.isDefault ? 1 : 0, loc.sortOrder],
    );
  }

  for (const mod of MODULE_SEEDS) {
    await run(
      `${IGNORE} INTO ospos_modules (module_id, name_lang_key, desc_lang_key, sort)
       VALUES (?, ?, ?, ?)`,
      [mod.moduleId, mod.nameLangKey, mod.descLangKey, mod.sort],
    );
  }

  for (const perm of PERMISSION_SEEDS) {
    await run(
      `${IGNORE} INTO ospos_permissions (permission_id, module_id, location_id)
       VALUES (?, ?, ?)`,
      [perm.permissionId, perm.moduleId, perm.locationId],
    );
    if (UNGRANTED_PERMISSION_IDS.has(perm.permissionId)) continue;
    await run(
      `${IGNORE} INTO ospos_grants (permission_id, person_id, menu_group)
       VALUES (?, 1, ?)`,
      [perm.permissionId, perm.menuGroup],
    );
  }

  for (const [key, value] of Object.entries(APP_CONFIG_DEFAULTS)) {
    await run(
      `${IGNORE} INTO ospos_app_config (\`key\`, value) VALUES (?, ?)`,
      [key, value],
    );
  }

  for (const pkg of CUSTOMER_PACKAGE_SEEDS) {
    await run(
      `${IGNORE} INTO ospos_customers_packages (package_id, package_name, points_percent, deleted)
       VALUES (?, ?, ?, 0)`,
      [pkg.packageId, pkg.packageName, pkg.pointsPercent],
    );
  }

  for (const table of DINNER_TABLE_SEEDS) {
    await run(
      `${IGNORE} INTO ospos_dinner_tables (dinner_table_id, name, status, deleted)
       VALUES (?, ?, 0, 0)`,
      [table.dinnerTableId, table.name],
    );
  }

  console.log("Seed complete: 138 config keys, 18 modules, 36 permissions, 35 grants.");
  return 1;
}

async function main(): Promise<void> {
  await seedDatabase();
  if (IS_MYSQL) {
    await closeMysqlPool();
  }
}

const invokedDirectly = process.argv[1]?.endsWith("seed.ts") ?? false;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
