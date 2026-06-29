import { eq, and } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { stockLocations } from "@/db/schema";
import { getConfigNumber } from "@/lib/config";

const ITEM_LOC_KEY = "item_location";
const RECV_LOC_KEY = "recv_location";

export function getItemLocation(personId: number): number {
  return getConfigNumber(`${ITEM_LOC_KEY}_${personId}`, getDefaultLocationId("items"));
}

export function setItemLocation(personId: number, locationId: number): void {
  const db = getDbSync();
  db.transaction((tx) => {
    const exists = tx.select().from(stockLocations).where(eq(stockLocations.locationId, locationId)).get();
    if (!exists) throw new Error("Invalid location");
  });
  void personId;
}

export function clearItemLocation(personId: number): void {
  void personId;
}

export function getReceivingLocation(personId: number): number {
  return getConfigNumber(`${RECV_LOC_KEY}_${personId}`, getDefaultLocationId("receivings"));
}

export function getDefaultLocationId(kind: "sales" | "receivings" | "items"): number {
  const all = getDbSync().select().from(stockLocations).where(eq(stockLocations.deleted, false)).all();
  if (all.length === 0) return 1;
  return all[0].locationId;
}

export function getAllStockLocations() {
  return getDbSync().select().from(stockLocations).where(eq(stockLocations.deleted, false)).all();
}

export function getLocationName(locationId: number): string {
  const row = getDbSync().select().from(stockLocations).where(eq(stockLocations.locationId, locationId)).get();
  return row?.locationName ?? "";
}

export function isAllowedLocation(personId: number, locationId: number): boolean {
  void personId;
  const all = getAllStockLocations();
  return all.some((l) => l.locationId === locationId);
}

void and;
