import Database from "better-sqlite3";
import { CATALOG, fail, ok, sqliteAffinity, type Difference } from "./lib";

const filename = (process.env.DATABASE_URL ?? "sqlite.db").replace(/^file:/, "");
const db = new Database(filename, { readonly: true });

const tables = (
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ospos_%' AND name != 'ospos_migrations' ORDER BY name",
    )
    .all() as { name: string }[]
).map((row) => row.name);

const differences: Difference[] = [];
const expectedTables = Object.keys(CATALOG).filter((table) => table !== "ospos_migrations");

for (const table of expectedTables) {
  if (!tables.includes(table)) {
    differences.push({ table, issue: "missing table" });
  }
}
for (const table of tables) {
  if (!expectedTables.includes(table)) {
    differences.push({ table, issue: "unexpected table" });
  }
}

for (const table of expectedTables) {
  if (!tables.includes(table)) continue;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    type: string;
    notnull: number;
    pk: number;
  }[];
  const byName = new Map(columns.map((column) => [column.name, column]));
  const expectedColumns = new Map(
    CATALOG[table].columns
      // SQLite encodes the item-only attribute uniqueness as a partial index
      // instead of MySQL's stored generated column.
      .filter((column) => column.name !== "generated_unique_column")
      .map((column) => [column.name, column]),
  );

  for (const [name, spec] of expectedColumns) {
    const actual = byName.get(name);
    if (!actual) {
      differences.push({ table, issue: `missing column ${name}` });
      continue;
    }
    const actualType = sqliteAffinity(actual.type);
    const expectedType = sqliteAffinity(spec.type);
    if (actualType !== expectedType) {
      differences.push({
        table,
        issue: `column ${name} type ${actualType} != ${expectedType}`,
      });
    }
    if (
      spec.nullable === false &&
      actual.notnull === 0 &&
      !CATALOG[table].primaryKey.includes(name)
    ) {
      differences.push({ table, issue: `column ${name} should be NOT NULL` });
    }
    if (spec.nullable === true && actual.notnull === 1) {
      differences.push({ table, issue: `column ${name} should be nullable` });
    }
  }
  for (const column of columns) {
    if (!expectedColumns.has(column.name)) {
      differences.push({ table, issue: `unexpected column ${column.name}` });
    }
  }

  const actualPk = columns
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  const expectedPk = CATALOG[table].primaryKey;
  if (actualPk.join(",") !== expectedPk.join(",")) {
    differences.push({
      table,
      issue: `primary key [${actualPk.join(",")}] != [${expectedPk.join(",")}]`,
    });
  }
}

if (differences.length > 0) {
  fail(differences, "SQLite schema parity");
}

ok(
  `SQLite schema parity PASS: ${expectedTables.length} tables, ${Object.values(CATALOG).reduce(
    (sum, table) => sum + table.columns.length,
    0,
  )} columns`,
);
