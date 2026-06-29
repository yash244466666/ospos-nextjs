"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { itemKits, itemKitItems, items } from "@/db/schema";

export async function saveItemKitAction(formData: FormData) {
  await requirePermission("item_kits");
  const db = getDbSync();
  const id = formData.get("itemKitId") as string;
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Name required");
  const itemKitNumber = (formData.get("itemKitNumber") as string) || null;
  const description = (formData.get("description") as string) || null;
  const kitDiscount = parseFloat((formData.get("kitDiscount") as string) || "0") || 0;
  const kitDiscountType = parseInt((formData.get("kitDiscountType") as string) || "0", 10) || 0;
  const priceOption = parseInt((formData.get("priceOption") as string) || "0", 10) || 0;
  const printOption = parseInt((formData.get("printOption") as string) || "0", 10) || 0;

  const kitId = db.transaction((tx) => {
    const data: typeof itemKits.$inferInsert = {
      itemKitNumber, name, description, kitDiscount, kitDiscountType, priceOption, printOption,
    };
    let kitId: number;
    if (id && parseInt(id, 10) > 0) {
      kitId = parseInt(id, 10);
      tx.update(itemKits).set(data).where(eq(itemKits.itemKitId, kitId)).run();
      tx.delete(itemKitItems).where(eq(itemKitItems.itemKitId, kitId)).run();
    } else {
      const inserted = tx.insert(itemKits).values(data).returning({ id: itemKits.itemKitId }).get();
      kitId = inserted.id;
    }

    const itemsJson = (formData.get("items") as string) || "[]";
    const parsed: { itemId: number; quantity: number; kitSequence: number }[] = JSON.parse(itemsJson);
    for (const it of parsed) {
      tx.insert(itemKitItems).values({
        itemKitId: kitId,
        itemId: it.itemId,
        quantity: it.quantity,
        kitSequence: it.kitSequence,
      }).run();
    }
    return kitId;
  });
  revalidatePath("/item_kits");
  redirect(`/item_kits/new/${kitId}`);
}

export async function deleteItemKitAction(itemKitId: number) {
  await requirePermission("item_kits");
  const db = getDbSync();
  db.transaction((tx) => {
    tx.delete(itemKitItems).where(eq(itemKitItems.itemKitId, itemKitId)).run();
    tx.delete(itemKits).where(eq(itemKits.itemKitId, itemKitId)).run();
  });
  revalidatePath("/item_kits");
}

export async function listItemsForSelectAction() {
  await requirePermission("item_kits");
  const db = getDbSync();
  return db.select({ itemId: items.itemId, name: items.name, itemNumber: items.itemNumber })
    .from(items)
    .where(and(eq(items.deleted, false)))
    .all();
}