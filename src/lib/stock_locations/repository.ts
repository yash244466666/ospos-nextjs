import { and, asc, eq, like, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import {
  employees,
  grants,
  itemQuantities,
  items,
  permissions,
  stockLocations,
} from "@/db/schema";

export interface StockLocationRow {
  locationId: number;
  locationName: string;
  deleted: boolean;
  isDefault: boolean;
  sortOrder: number | null;
}

function mapRow(row: typeof stockLocations.$inferSelect): StockLocationRow {
  return {
    locationId: row.locationId,
    locationName: row.locationName ?? "",
    deleted: row.deleted,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder ?? null,
  };
}

export async function exists(locationId: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: stockLocations.locationId })
    .from(stockLocations)
    .where(eq(stockLocations.locationId, locationId));
  return rows.length >= 1;
}

export async function getAll(): Promise<StockLocationRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false))
    .orderBy(asc(stockLocations.sortOrder));
  return rows.map(mapRow);
}

export async function getUndeletedAll(
  moduleId = "items",
  personId: number,
): Promise<StockLocationRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ location: stockLocations })
    .from(stockLocations)
    .innerJoin(permissions, eq(permissions.locationId, stockLocations.locationId))
    .innerJoin(grants, eq(grants.permissionId, permissions.permissionId))
    .where(
      and(
        eq(grants.personId, personId),
        like(permissions.permissionId, `${moduleId}%`),
        eq(stockLocations.deleted, false),
      ),
    )
    .orderBy(asc(stockLocations.sortOrder));
  return rows.map((row) => mapRow(row.location));
}

export async function getAllowedLocations(
  moduleId: string,
  personId: number,
): Promise<Record<number, string>> {
  const rows = await getUndeletedAll(moduleId, personId);
  return Object.fromEntries(rows.map((row) => [row.locationId, row.locationName]));
}

export async function showLocations(moduleId: string, personId: number): Promise<boolean> {
  return Object.keys(await getAllowedLocations(moduleId, personId)).length > 1;
}

export async function multipleLocations(): Promise<boolean> {
  return (await getAll()).length > 1;
}

export async function isAllowedLocation(
  locationId: number,
  moduleId: string,
  personId: number,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: stockLocations.locationId })
    .from(stockLocations)
    .innerJoin(permissions, eq(permissions.locationId, stockLocations.locationId))
    .innerJoin(grants, eq(grants.permissionId, permissions.permissionId))
    .where(
      and(
        eq(grants.personId, personId),
        like(permissions.permissionId, `${moduleId}%`),
        eq(stockLocations.locationId, locationId),
        eq(stockLocations.deleted, false),
      ),
    );
  return rows.length === 1;
}

export async function getDefaultLocationId(
  moduleId: string,
  personId: number,
): Promise<number | null> {
  const db = await getDb();
  const rows = await db
    .select({ locationId: stockLocations.locationId })
    .from(stockLocations)
    .innerJoin(permissions, eq(permissions.locationId, stockLocations.locationId))
    .innerJoin(grants, eq(grants.permissionId, permissions.permissionId))
    .where(
      and(
        eq(grants.personId, personId),
        like(permissions.permissionId, `${moduleId}%`),
        eq(stockLocations.deleted, false),
      ),
    )
    .orderBy(asc(sql`${stockLocations.isDefault} DESC`), asc(stockLocations.sortOrder))
    .limit(1);
  return rows[0]?.locationId ?? null;
}

export async function getLocationName(locationId: number): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select({ name: stockLocations.locationName })
    .from(stockLocations)
    .where(eq(stockLocations.locationId, locationId))
    .limit(1);
  return rows[0]?.name ?? "";
}

export async function setDefaultLocation(locationId: number): Promise<boolean> {
  const db = await getDb();
  const existing = await db
    .select({ id: stockLocations.locationId })
    .from(stockLocations)
    .where(and(eq(stockLocations.locationId, locationId), eq(stockLocations.deleted, false)));
  if (existing.length === 0) return false;
  await withTransaction(async (tx) => {
    await tx.update(stockLocations).set({ isDefault: false });
    await tx
      .update(stockLocations)
      .set({ isDefault: true })
      .where(eq(stockLocations.locationId, locationId));
  });
  return true;
}

async function shiftSortOrder(
  tx: Awaited<ReturnType<typeof getDb>>,
  orderedIds: number[],
  offset: number,
): Promise<void> {
  for (let index = 0; index < orderedIds.length; index++) {
    await tx
      .update(stockLocations)
      .set({ sortOrder: index + offset })
      .where(eq(stockLocations.locationId, orderedIds[index]));
  }
}

export async function saveSortOrder(orderedLocationIds: number[]): Promise<boolean> {
  if (orderedLocationIds.length === 0) return true;
  await withTransaction(async (tx) => {
    await shiftSortOrder(tx, orderedLocationIds, orderedLocationIds.length);
    await shiftSortOrder(tx, orderedLocationIds, 0);
  });
  return true;
}

async function insertNewPermission(
  tx: Awaited<ReturnType<typeof getDb>>,
  moduleId: string,
  locationId: number,
  locationName: string,
): Promise<void> {
  const permissionId = `${moduleId}_${locationName.replace(/ /g, "_")}`;
  await tx.insert(permissions).values({
    permissionId,
    moduleId,
    locationId,
  });
  const employeeRows = await tx.select().from(employees);
  for (const employee of employeeRows) {
    const menuGroup = await tx
      .select({ menuGroup: grants.menuGroup })
      .from(grants)
      .where(
        and(
          eq(grants.permissionId, moduleId),
          eq(grants.personId, employee.personId),
        ),
      )
      .limit(1);
    await tx.insert(grants).values({
      permissionId,
      personId: employee.personId,
      menuGroup: menuGroup[0]?.menuGroup ?? "home",
    });
  }
}

export async function saveValue(
  input: { locationId?: number; locationName: string },
): Promise<number> {
  const db = await getDb();
  const locationId = input.locationId ?? 0;
  if (!(await exists(locationId))) {
    return withTransaction(async (tx) => {
      const countRows = await tx
        .select({ value: sql<number>`count(*)` })
        .from(stockLocations)
        .where(eq(stockLocations.deleted, false));
      const sortOrder = Number(countRows[0]?.value ?? 0);
      const inserted = await tx
        .insert(stockLocations)
        .values({
          locationName: input.locationName,
          deleted: false,
          isDefault: false,
          sortOrder,
        })
        .returning({ id: stockLocations.locationId });
      const id = (Array.isArray(inserted) ? inserted[0] : inserted).id;
      for (const moduleId of ["items", "sales", "receivings"]) {
        await insertNewPermission(tx, moduleId, id, input.locationName);
      }
      const itemRows = await tx.select({ itemId: items.itemId }).from(items);
      for (const item of itemRows) {
        await tx.insert(itemQuantities).values({
          itemId: item.itemId,
          locationId: id,
          quantity: "0",
        });
      }
      return id;
    });
  }

  const originalName = await getLocationName(locationId);
  return withTransaction(async (tx) => {
    if (originalName !== input.locationName) {
      await tx.delete(permissions).where(eq(permissions.locationId, locationId));
      for (const moduleId of ["items", "sales", "receivings"]) {
        await insertNewPermission(tx, moduleId, locationId, input.locationName);
      }
    }
    await tx
      .update(stockLocations)
      .set({ locationName: input.locationName, deleted: false })
      .where(eq(stockLocations.locationId, locationId));
    return locationId;
  });
}

export async function deleteLocation(locationId: number): Promise<void> {
  await withTransaction(async (tx) => {
    await tx
      .update(stockLocations)
      .set({ deleted: true, sortOrder: null })
      .where(eq(stockLocations.locationId, locationId));
    const remaining = await tx
      .select({ locationId: stockLocations.locationId })
      .from(stockLocations)
      .where(eq(stockLocations.deleted, false))
      .orderBy(asc(stockLocations.sortOrder));
    if (remaining.length > 0) {
      await shiftSortOrder(tx, remaining.map((row) => row.locationId), remaining.length + 1);
      await shiftSortOrder(tx, remaining.map((row) => row.locationId), 0);
    }
    await tx.delete(permissions).where(eq(permissions.locationId, locationId));
  });
}

export async function search(term: string, limit = 25): Promise<StockLocationRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(stockLocations)
    .where(
      and(
        eq(stockLocations.deleted, false),
        like(stockLocations.locationName, `%${term}%`),
      ),
    )
    .orderBy(asc(stockLocations.sortOrder))
    .limit(limit);
  return rows.map(mapRow);
}

export async function getSearchSuggestions(
  term: string,
  limit = 25,
): Promise<StockLocationRow[]> {
  return search(term, limit);
}

export async function getTotalRows(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false));
  return Number(rows[0]?.value ?? 0);
}

export async function deleteList(ids: number[]): Promise<void> {
  for (const id of ids) await deleteLocation(id);
}
