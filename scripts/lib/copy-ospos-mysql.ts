import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { EPHEMERAL_TABLES, OSPOS_TABLES } from "./ospos-tables";

export interface CopyOptions {
  force: boolean;
  dryRun: boolean;
  includeSessions: boolean;
  verify: boolean;
}

interface ColumnInfo {
  TABLE_NAME: string;
  COLUMN_NAME: string;
}

async function columnsOf(pool: mysql.Pool, table: string): Promise<string[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return (rows as ColumnInfo[]).map((row) => row.COLUMN_NAME);
}

async function primaryKeyOf(pool: mysql.Pool, table: string): Promise<string[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`,
    [table],
  );
  return (rows as ColumnInfo[]).map((row) => row.COLUMN_NAME);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) {
    const value = row[key];
    normalized[key] = Buffer.isBuffer(value)
      ? createHash("sha256").update(value).digest("hex")
      : value instanceof Date
        ? value.toISOString()
        : value;
  }
  return normalized;
}

async function checksum(pool: mysql.Pool, table: string): Promise<{ count: number; hash: string }> {
  const primaryKey = await primaryKeyOf(pool, table);
  const order = primaryKey.length > 0 ? ` ORDER BY ${primaryKey.map((key) => `\`${key}\``).join(", ")}` : "";
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT * FROM \`${table}\`${order}`);
  const hash = createHash("sha256");
  for (const row of rows) hash.update(JSON.stringify(normalizeRow(row)));
  return { count: rows.length, hash: hash.digest("hex") };
}

export interface CopyReport {
  copied: Array<{ table: string; rows: number }>;
  skipped: string[];
  missingColumns: Array<{ table: string; columns: string[] }>;
  verified: Array<{ table: string; source: string; target: string }>;
}

/**
 * Copies an OSPOS database between MySQL instances with IDs, timestamps and
 * decimal strings preserved (`dateStrings` prevents timezone conversion).
 */
export async function copyOsposDatabase(
  sourceUrl: string,
  targetUrl: string,
  options: CopyOptions,
): Promise<CopyReport> {
  const source = mysql.createPool({
    uri: sourceUrl,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
  });
  const target = mysql.createPool({
    uri: targetUrl,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
  });

  const report: CopyReport = {
    copied: [],
    skipped: [],
    missingColumns: [],
    verified: [],
  };

  try {
    if (!options.force) {
      for (const table of OSPOS_TABLES) {
        if (EPHEMERAL_TABLES.has(table) && !options.includeSessions) continue;
        if (table === "ospos_migrations") continue;
        const [rows] = await target.query<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) AS count FROM \`${table}\``,
        );
        const count = Number((rows[0] as { count: number }).count);
        if (count > 0) {
          throw new Error(
            `Target table ${table} has ${count} rows; use --force to overwrite`,
          );
        }
      }
    }

    await target.query("SET FOREIGN_KEY_CHECKS=0");
    try {
      for (const table of OSPOS_TABLES) {
        if (EPHEMERAL_TABLES.has(table) && !options.includeSessions) {
          report.skipped.push(table);
          continue;
        }

        const sourceColumns = await columnsOf(source, table);
        const targetColumns = await columnsOf(target, table);
        if (sourceColumns.length === 0) {
          report.skipped.push(table);
          continue;
        }
        const common = sourceColumns.filter((column) => targetColumns.includes(column));
        const missing = sourceColumns.filter((column) => !targetColumns.includes(column));
        if (missing.length > 0) {
          report.missingColumns.push({ table, columns: missing });
        }

        const [rows] = await source.query<mysql.RowDataPacket[]>(
          `SELECT ${common.map((column) => `\`${column}\``).join(", ")} FROM \`${table}\``,
        );
        if (!options.dryRun) {
          await target.query(`DELETE FROM \`${table}\``);
        }
        if (rows.length === 0) {
          report.copied.push({ table, rows: 0 });
          continue;
        }
        if (!options.dryRun) {
          const columnList = common.map((column) => `\`${column}\``).join(", ");
          const placeholders = `(${common.map(() => "?").join(", ")})`;
          const values = rows.map((row) => common.map((column) => row[column]));
          const chunkSize = 500;
          for (let start = 0; start < values.length; start += chunkSize) {
            const chunk = values.slice(start, start + chunkSize);
            await target.query(
              `INSERT INTO \`${table}\` (${columnList}) VALUES ${chunk
                .map(() => placeholders)
                .join(", ")}`,
              chunk.flat(),
            );
          }
        }
        report.copied.push({ table, rows: rows.length });
      }
    } finally {
      await target.query("SET FOREIGN_KEY_CHECKS=1");
    }

    if (options.verify && !options.dryRun) {
      for (const table of OSPOS_TABLES) {
        if (EPHEMERAL_TABLES.has(table) && !options.includeSessions) continue;
        if (!report.copied.some((entry) => entry.table === table)) continue;
        const sourceChecksum = await checksum(source, table);
        const targetChecksum = await checksum(target, table);
        report.verified.push({
          table,
          source: `${sourceChecksum.count}:${sourceChecksum.hash.slice(0, 16)}`,
          target: `${targetChecksum.count}:${targetChecksum.hash.slice(0, 16)}`,
        });
      }
    }
  } finally {
    await source.end();
    await target.end();
  }

  return report;
}
