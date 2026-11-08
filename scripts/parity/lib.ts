import fs from "node:fs";
import path from "node:path";

export interface ColumnSpec {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  generated: boolean;
}

export interface TableSpec {
  columns: ColumnSpec[];
  primaryKey: string[];
}

export type SchemaCatalog = Record<string, TableSpec>;

export const CATALOG: SchemaCatalog = JSON.parse(
  fs.readFileSync(
    path.resolve(process.cwd(), "scripts/parity/catalog/schema.json"),
    "utf8",
  ),
) as SchemaCatalog;

export function sqliteAffinity(type: string): string {
  const base = type.replace(/\(.*/, "").toLowerCase();
  if (["int", "integer", "tinyint", "smallint", "mediumint", "bigint"].includes(base)) {
    return "INTEGER";
  }
  if (["decimal", "numeric"].includes(base)) return "NUMERIC";
  if (["float", "double", "real"].includes(base)) return "REAL";
  if (["blob", "binary", "varbinary"].includes(base)) return "BLOB";
  return "TEXT";
}

export function mysqlBaseType(type: string): string {
  return type.replace(/\(.*/, "").toLowerCase();
}

export interface Difference {
  table: string;
  issue: string;
}

export function fail(differences: Difference[], title: string): never {
  console.error(`\n${title}: ${differences.length} difference(s)`);
  for (const difference of differences.slice(0, 100)) {
    console.error(`  ${difference.table}: ${difference.issue}`);
  }
  if (differences.length > 100) {
    console.error(`  ... ${differences.length - 100} more`);
  }
  process.exit(1);
}

export function ok(message: string): void {
  console.log(message);
}
