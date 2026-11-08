"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { dinnerTables } from "@/db/schema";

export async function saveDinnerTableAction(formData: FormData) {
  await requirePermission("config");
  const db = await getDb();
  const id = parseInt((formData.get("dinnerTableId") as string) || "0", 10);
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) throw new Error("Name required");
  let outId: number;
  if (id > 0) {
    await db.update(dinnerTables).set({ name }).where(eq(dinnerTables.dinnerTableId, id));
    outId = id;
  } else {
    const inserted = await db
      .insert(dinnerTables)
      .values({ name, deleted: false })
      .returning({ id: dinnerTables.dinnerTableId });
    outId = (Array.isArray(inserted) ? inserted[0] : inserted).id;
  }
  revalidatePath("/dinner_tables");
  redirect("/dinner_tables");
}

export async function deleteDinnerTableAction(dinnerTableId: number) {
  await requirePermission("config");
  const db = await getDb();
  await db.update(dinnerTables).set({ deleted: true }).where(eq(dinnerTables.dinnerTableId, dinnerTableId));
  revalidatePath("/dinner_tables");
  redirect("/dinner_tables");
}
import { getAll as listAll, getInfo as info, search, isOccupied } from "@/lib/dinner_tables/repository";
export async function searchDinnerTablesAction(term: string) { await requirePermission("config"); return search(term); }
export async function getDinnerTableRowAction(id: number) { await requirePermission("config"); return info(id); }
export async function isTableOccupiedAction(id: number) { await requirePermission("config"); return isOccupied(id); }
export { listAll };
