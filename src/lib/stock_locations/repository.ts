import { eq, and, sql, like, asc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { stockLocations } from "@/db/schema";

export interface StockLocationRow {
  locationId: number;
  locationName: string;
  deleted: boolean;
}

export function getAll(limit = 25, offset = 0): StockLocationRow[] {
  return getDbSync().select().from(stockLocations)
    .where(eq(stockLocations.deleted, false))
    .orderBy(asc(stockLocations.locationName))
    .limit(limit).offset(offset).all() as StockLocationRow[];
}

export function getInfo(locationId: number): StockLocationRow | null {
  return (getDbSync().select().from(stockLocations)
    .where(eq(stockLocations.locationId, locationId)).get() as StockLocationRow) ?? null;
}

export function getName(locationId: number): string | null {
  return getInfo(locationId)?.locationName ?? null;
}

export function getDefaultLocationId(): number {
  const r = getDbSync().select({ id: stockLocations.locationId })
    .from(stockLocations).where(eq(stockLocations.deleted, false))
    .orderBy(asc(stockLocations.locationId)).get();
  return r?.id ?? 1;
}

export function getEmptyRow(): StockLocationRow {
  return { locationId: 0, locationName: "", deleted: false };
}

export function saveValue(input: StockLocationRow): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.locationId) {
      tx.update(stockLocations).set({ locationName: input.locationName })
        .where(eq(stockLocations.locationId, input.locationId)).run();
      return input.locationId;
    }
    return tx.insert(stockLocations).values({ locationName: input.locationName, deleted: false })
      .returning({ id: stockLocations.locationId }).get().id;
  });
}

export function deleteLocation(locationId: number): void {
  getDbSync().update(stockLocations).set({ deleted: true })
    .where(eq(stockLocations.locationId, locationId)).run();
}

export function search(term: string, limit = 25): StockLocationRow[] {
  return getDbSync().select().from(stockLocations)
    .where(and(eq(stockLocations.deleted, false), like(stockLocations.locationName, `%${term}%`)))
    .orderBy(asc(stockLocations.locationName)).limit(limit).all() as StockLocationRow[];
}

export function getSearchSuggestions(term: string, limit = 25): StockLocationRow[] {
  return search(term, limit);
}

export function getTotalRows(): number {
  const r = getDbSync().select({ c: sql<number>`count(*)` }).from(stockLocations)
    .where(eq(stockLocations.deleted, false)).get();
  return r?.c ?? 0;
}

export function deleteList(ids: number[]): void {
  const db = getDbSync();
  for (const id of ids) db.update(stockLocations).set({ deleted: true })
    .where(eq(stockLocations.locationId, id)).run();
}
