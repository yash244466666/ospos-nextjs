"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { dinnerTables } from "@/db/schema";

export async function saveDinnerTableAction(formData: FormData) {
  await requirePermission("config");
  const db = getDbSync();
  const id = parseInt((formData.get("dinnerTableId") as string) || "0", 10);
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) throw new Error("Name required");
  let outId: number;
  if (id > 0) {
    db.update(dinnerTables).set({ name }).where(eq(dinnerTables.dinnerTableId, id)).run();
    outId = id;
  } else {
    outId = db.insert(dinnerTables).values({ name, deleted: false }).returning({ id: dinnerTables.dinnerTableId }).get().id;
  }
  revalidatePath("/dinner_tables");
  redirect(`/dinner_tables/new/${outId}`);
}

export async function deleteDinnerTableAction(dinnerTableId: number) {
  await requirePermission("config");
  const db = getDbSync();
  db.update(dinnerTables).set({ deleted: true }).where(eq(dinnerTables.dinnerTableId, dinnerTableId)).run();
  revalidatePath("/dinner_tables");
}
import { getAll as listAll, getInfo as info, search, isOccupied } from "@/lib/dinner_tables/repository";
export async function searchDinnerTablesAction(term: string) { await requirePermission("dinner_tables"); return search(term); }
export async function getDinnerTableRowAction(id: number) { await requirePermission("dinner_tables"); return info(id); }
export async function isTableOccupiedAction(id: number) { await requirePermission("dinner_tables"); return isOccupied(id); }
export { listAll };
