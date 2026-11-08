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
