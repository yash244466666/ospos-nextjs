import mysql from "mysql2/promise";
import { CATALOG, fail, mysqlBaseType, ok, type Difference } from "./lib";

const url =
  process.env.DATABASE_URL ?? "mysql://root:pointofsale@localhost:3306/ospos";

async function main(): Promise<void> {
  const pool = mysql.createPool(url);
  try {
    const [tables] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'ospos\\_%'`,
    );
    const tableNames = tables.map((row) => String(row.name));
    const expectedTables = Object.keys(CATALOG);
    const differences: Difference[] = [];

    for (const table of expectedTables) {
      if (!tableNames.includes(table)) differences.push({ table, issue: "missing table" });
    }
    for (const table of tableNames) {
      if (!expectedTables.includes(table)) differences.push({ table, issue: "unexpected table" });
    }

    const [columns] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName,
              DATA_TYPE AS dataType, COLUMN_TYPE AS columnType,
              IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault,
              EXTRA AS extra
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'ospos\\_%'
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    );
    const byTable = new Map<string, Map<string, mysql.RowDataPacket>>();
    for (const column of columns) {
      const table = String(column.tableName);
      const map = byTable.get(table) ?? new Map();
      map.set(String(column.columnName), column);
      byTable.set(table, map);
    }

    for (const table of expectedTables) {
      const actualColumns = byTable.get(table);
      if (!actualColumns) continue;
      for (const spec of CATALOG[table].columns) {
        const actual = actualColumns.get(spec.name);
        if (!actual) {
          differences.push({ table, issue: `missing column ${spec.name}` });
          continue;
        }
        const expectedType = mysqlBaseType(spec.type);
        let actualType = String(actual.dataType).toLowerCase();
        if (actualType === "boolean") actualType = "tinyint";
        const normalizedExpected = expectedType === "boolean" ? "tinyint" : expectedType;
        if (actualType !== normalizedExpected) {
          differences.push({
            table,
            issue: `column ${spec.name} type ${actualType} != ${normalizedExpected}`,
          });
        }
        const nullable = String(actual.isNullable).toUpperCase() === "YES";
        if (spec.nullable === false && nullable && !CATALOG[table].primaryKey.includes(spec.name)) {
          differences.push({ table, issue: `column ${spec.name} should be NOT NULL` });
        }
        if (spec.nullable === true && !nullable) {
          differences.push({ table, issue: `column ${spec.name} should be nullable` });
        }
        const extra = String(actual.extra).toUpperCase();
        const generated = extra.includes("STORED GENERATED") || extra.includes("VIRTUAL GENERATED");
        if (spec.generated !== generated) {
          differences.push({ table, issue: `column ${spec.name} generated mismatch` });
        }
      }
      for (const name of actualColumns.keys()) {
        if (!CATALOG[table].columns.some((spec) => spec.name === name)) {
          differences.push({ table, issue: `unexpected column ${name}` });
        }
      }
    }

    const [primaryKeys] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, ORDINAL_POSITION AS position
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'PRIMARY'
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    );
    const pkByTable = new Map<string, string[]>();
    for (const row of primaryKeys) {
      const table = String(row.tableName);
      const list = pkByTable.get(table) ?? [];
      list.push(String(row.columnName));
      pkByTable.set(table, list);
    }
    for (const table of expectedTables) {
      const actual = (pkByTable.get(table) ?? []).join(",");
      const expected = CATALOG[table].primaryKey.join(",");
      if (actual !== expected) {
        differences.push({ table, issue: `primary key [${actual}] != [${expected}]` });
      }
    }

    if (differences.length > 0) {
      fail(differences, "MySQL schema parity");
    }
    ok(
      `MySQL schema parity PASS: ${expectedTables.length} tables, ${columns.length} columns`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("MySQL schema parity could not run:", (error as Error).message);
  process.exit(2);
});
