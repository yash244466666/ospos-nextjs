"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { giftcards } from "@/db/schema";

function generateRandomNumber(length = 14): string {
  let s = "";
  for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

export async function saveGiftcardAction(formData: FormData) {
  await requirePermission("giftcards");
  const db = getDbSync();
  const id = formData.get("giftcardId") as string;
  let giftcardNumber = (formData.get("giftcardNumber") as string)?.trim();
  const value = parseFloat((formData.get("value") as string) || "0") || 0;
  const personIdRaw = formData.get("personId") as string;

  if (!giftcardNumber) {
    for (let i = 0; i < 10; i++) {
      const candidate = generateRandomNumber();
      const exists = db.select().from(giftcards).where(eq(giftcards.giftcardNumber, candidate)).get();
      if (!exists) { giftcardNumber = candidate; break; }
    }
    if (!giftcardNumber) throw new Error("Could not generate unique giftcard number");
  } else {
    const conflict = db.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).get();
    if (conflict && (!id || conflict.giftcardId !== parseInt(id, 10))) throw new Error("Giftcard number exists");
  }
  const data: typeof giftcards.$inferInsert = {
    giftcardNumber,
    value,
    personId: personIdRaw && parseInt(personIdRaw, 10) > 0 ? parseInt(personIdRaw, 10) : null,
  };
  if (id && parseInt(id, 10) > 0) {
    db.update(giftcards).set(data).where(eq(giftcards.giftcardId, parseInt(id, 10))).run();
  } else {
    db.insert(giftcards).values(data).run();
  }
  revalidatePath("/giftcards");
  redirect("/giftcards");
}

export async function deleteGiftcardAction(giftcardId: number) {
  await requirePermission("giftcards");
  const db = getDbSync();
  db.update(giftcards).set({ deleted: true }).where(eq(giftcards.giftcardId, giftcardId)).run();
  revalidatePath("/giftcards");
  redirect("/giftcards");
}
import { getAll as listAll, getInfo as info, getSearchSuggestions, getTotalRows, search } from "@/lib/giftcards/repository";

export async function searchGiftcardsAction(term: string) { await requirePermission("giftcards"); return search(term); }
export async function suggestGiftcardsAction(term: string) { await requirePermission("giftcards"); return getSearchSuggestions(term); }
export async function getGiftcardRowAction(giftcardId: number) { await requirePermission("giftcards"); return info(giftcardId); }
export async function getGiftcardTotalRowsAction() { return getTotalRows(); }
export { listAll };
