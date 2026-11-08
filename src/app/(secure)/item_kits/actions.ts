"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { itemKits, itemKitItems, items } from "@/db/schema";
import { toDbDecimal } from "@/lib/money";

export async function saveItemKitAction(formData: FormData) {
  await requirePermission("item_kits");
  const id = formData.get("itemKitId") as string;
  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Name required");
  const itemKitNumber = (formData.get("itemKitNumber") as string) || null;
  const description = (formData.get("description") as string) || "";
  const kitItemId = Number(formData.get("itemId") ?? 0) || 0;
  const kitDiscount = toDbDecimal((formData.get("kitDiscount") as string) || "0", 2);
  const kitDiscountType = Number(formData.get("kitDiscountType") ?? 0) || 0;
  const priceOption = Number(formData.get("priceOption") ?? 0) || 0;
  const printOption = Number(formData.get("printOption") ?? 0) || 0;

  const kitId = await withTransaction(async (tx) => {
    const data = {
      itemKitNumber,
      name,
      description,
      itemId: kitItemId,
      kitDiscount,
      kitDiscountType,
      priceOption,
      printOption,
    };
    let savedKitId: number;
    if (id && parseInt(id, 10) > 0) {
      savedKitId = parseInt(id, 10);
      await tx.update(itemKits).set(data).where(eq(itemKits.itemKitId, savedKitId));
      await tx.delete(itemKitItems).where(eq(itemKitItems.itemKitId, savedKitId));
    } else {
      const inserted = await tx
        .insert(itemKits)
        .values(data)
        .returning({ id: itemKits.itemKitId });
      savedKitId = (Array.isArray(inserted) ? inserted[0] : inserted).id;
    }

    const itemsJson = (formData.get("items") as string) || "[]";
    const parsed: { itemId: number; quantity: string | number; kitSequence: number }[] =
      JSON.parse(itemsJson);
    for (const entry of parsed) {
      await tx.insert(itemKitItems).values({
        itemKitId: savedKitId,
        itemId: entry.itemId,
        quantity: toDbDecimal(entry.quantity, 3),
        kitSequence: entry.kitSequence,
      });
    }
    return savedKitId;
  });
  void kitId;
  revalidatePath("/item_kits");
  redirect("/item_kits");
}

export async function deleteItemKitAction(itemKitId: number) {
  await requirePermission("item_kits");
  await withTransaction(async (tx) => {
    await tx.delete(itemKitItems).where(eq(itemKitItems.itemKitId, itemKitId));
    await tx.delete(itemKits).where(eq(itemKits.itemKitId, itemKitId));
  });
  revalidatePath("/item_kits");
  redirect("/item_kits");
}

export async function listItemsForSelectAction() {
  await requirePermission("item_kits");
  const db = await getDb();
  return db
    .select({ itemId: items.itemId, name: items.name, itemNumber: items.itemNumber })
    .from(items)
    .where(and(eq(items.deleted, false)));
}
