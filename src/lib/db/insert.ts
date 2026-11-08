import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { IS_MYSQL, type Db } from "@/lib/db";

/**
 * Cross-dialect auto-increment insert. Drizzle's MySQL builder does not expose
 * `returning()`, so MySQL reads the driver `insertId`; SQLite keeps the
 * `returning({id})` path. The return shape matches Drizzle's SQLite array.
 */
export async function insertReturning(
  tx: Db,
  table: unknown,
  values: unknown,
  idColumn?: SQLiteColumn,
): Promise<{ id: number }[]> {
  if (IS_MYSQL) {
    const result = await (
      tx.insert(table as never) as unknown as {
        values: (values: unknown) => Promise<[unknown, unknown] | unknown>;
      }
    ).values(values);
    const header = Array.isArray(result) ? result[0] : result;
    return [{ id: Number((header as { insertId?: number }).insertId ?? 0) }];
  }
  if (!idColumn) {
    await tx.insert(table as never).values(values as never);
    return [];
  }
  const inserted = await tx
    .insert(table as never)
    .values(values as never)
    .returning({ id: idColumn as never });
  return inserted as { id: number }[];
}

/**
 * Cross-dialect upsert. SQLite uses `ON CONFLICT ... DO UPDATE`; MySQL uses
 * `ON DUPLICATE KEY UPDATE`. Drizzle exposes different builder methods per
 * dialect, so this is the single place that knows both.
 */
export async function upsertRow(
  tx: Db,
  table: unknown,
  values: unknown,
  target: SQLiteColumn,
  set: Record<string, unknown>,
): Promise<void> {
  const builder = tx.insert(table as never).values(values as never);
  if (IS_MYSQL) {
    await (
      builder as unknown as {
        onDuplicateKeyUpdate: (config: { set: Record<string, unknown> }) => Promise<unknown>;
      }
    ).onDuplicateKeyUpdate({ set });
    return;
  }
  await (
    builder as unknown as {
      onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => Promise<unknown>;
    }
  ).onConflictDoUpdate({ target, set });
}

/**
 * Cross-dialect insert-ignore. SQLite uses `ON CONFLICT DO NOTHING`; MySQL has
 * no equivalent builder no-op, so a duplicate-key error is swallowed.
 */
export async function insertIgnoreRow(
  tx: Db,
  table: unknown,
  values: unknown,
): Promise<void> {
  if (IS_MYSQL) {
    try {
      await tx.insert(table as never).values(values as never);
    } catch (error) {
      // Drizzle wraps driver errors; the MySQL errno lives on the cause.
      const cause = (error as { cause?: { errno?: number; code?: string } }).cause;
      const errno = (error as { errno?: number }).errno ?? cause?.errno;
      const code = (error as { code?: string }).code ?? cause?.code;
      if (errno === 1062 || code === "ER_DUP_ENTRY") return;
      throw error;
    }
    return;
  }
  await (
    tx.insert(table as never).values(values as never) as unknown as {
      onConflictDoNothing: () => Promise<unknown>;
    }
  ).onConflictDoNothing();
}
