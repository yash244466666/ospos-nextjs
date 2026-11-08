import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { itemKits, itemKitItems, items } from "@/db/schema";
import ItemKitForm from "@/components/item_kits/item-kit-form";

export default async function ItemKitEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("item_kits");
  const { id } = await params;
  const itemKitId = parseInt(id, 10);
  const db = await getDb();
  const kit =
    itemKitId > 0
      ? ((await db
          .select()
          .from(itemKits)
          .where(eq(itemKits.itemKitId, itemKitId))
          .limit(1))[0] ?? null)
      : null;
  const kitItems =
    itemKitId > 0
      ? await db
          .select({
            kitSequence: itemKitItems.kitSequence,
            itemId: itemKitItems.itemId,
            quantity: itemKitItems.quantity,
            name: items.name,
            itemNumber: items.itemNumber,
          })
          .from(itemKitItems)
          .innerJoin(items, eq(items.itemId, itemKitItems.itemId))
          .where(eq(itemKitItems.itemKitId, itemKitId))
      : [];
  return <ItemKitForm initial={kit} kitItems={kitItems} />;
}