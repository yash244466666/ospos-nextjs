"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { giftcards } from "@/db/schema";
import { toDbDecimal } from "@/lib/money";

function randomGiftcardName(value: string): string {
  const random = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `${random}-${value}`.toUpperCase();
}

export async function saveGiftcardAction(formData: FormData) {
  await requirePermission("giftcards");
  const db = await getDb();
  const id = formData.get("giftcardId") as string;
  let giftcardNumber = (formData.get("giftcardNumber") as string)?.trim();
  const value = toDbDecimal(parseFloat((formData.get("value") as string) || "0") || 0, 2);
  const personIdRaw = formData.get("personId") as string;

  if (!giftcardNumber) {
    for (let i = 0; i < 10; i++) {
      const candidate = randomGiftcardName(giftcardNumber ?? "");
      const exists = (await db
        .select()
        .from(giftcards)
        .where(eq(giftcards.giftcardNumber, candidate))
        .limit(1))[0];
      if (!exists) {
        giftcardNumber = candidate;
        break;
      }
    }
    if (!giftcardNumber) throw new Error("Could not generate unique giftcard number");
  } else {
    const conflict = (await db.select().from(giftcards).where(eq(giftcards.giftcardNumber, giftcardNumber)).limit(1))[0];
    if (conflict && (!id || conflict.giftcardId !== parseInt(id, 10))) throw new Error("Giftcard number exists");
  }
  const data: typeof giftcards.$inferInsert = {
    giftcardNumber,
    value,
    personId: personIdRaw && parseInt(personIdRaw, 10) > 0 ? parseInt(personIdRaw, 10) : null,
  };
  if (id && parseInt(id, 10) > 0) {
    await db.update(giftcards).set(data).where(eq(giftcards.giftcardId, parseInt(id, 10)));
  } else {
    await db.insert(giftcards).values(data);
  }
  revalidatePath("/giftcards");
  redirect("/giftcards");
}

export async function deleteGiftcardAction(giftcardId: number) {
  await requirePermission("giftcards");
  const db = await getDb();
  await db.update(giftcards).set({ deleted: true }).where(eq(giftcards.giftcardId, giftcardId));
  revalidatePath("/giftcards");
  redirect("/giftcards");
}
import { getAll as listAll, getInfo as info, getSearchSuggestions, getTotalRows, search } from "@/lib/giftcards/repository";

export async function searchGiftcardsAction(term: string) { await requirePermission("giftcards"); return search(term); }
export async function suggestGiftcardsAction(term: string) { await requirePermission("giftcards"); return getSearchSuggestions(term); }
export async function getGiftcardRowAction(giftcardId: number) { await requirePermission("giftcards"); return info(giftcardId); }
export async function getGiftcardTotalRowsAction() { return getTotalRows(); }
export { listAll };
