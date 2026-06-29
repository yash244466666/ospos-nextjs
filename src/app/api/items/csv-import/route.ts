import { auth } from "@/lib/auth/options";
import { getDbSync } from "@/lib/db";
import { items, itemsTaxes, itemQuantities, inventory, attributeDefinitions, attributeLinks, attributeValues, stockLocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ITEM_TYPE, STOCK_TYPE } from "@/lib/constants";
import { parseCsv } from "@/lib/csv/parse";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.personId) return new Response("Unauthorized", { status: 401 });
  const personId = session.user.personId;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return Response.json({ error: "Empty CSV" }, { status: 400 });

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const db = getDbSync();
  const locations = db.select().from(stockLocations).where(eq(stockLocations.deleted, false)).all();
  const attrs = db.select().from(attributeDefinitions).where(eq(attributeDefinitions.deleted, false)).all();

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ""; });

    try {
      db.transaction((tx) => {
        const itemId = obj["Id"] && parseInt(obj["Id"], 10) > 0 ? parseInt(obj["Id"], 10) : undefined;
        const name = obj["Item Name"]?.trim();
        if (!name) throw new Error("Item Name required");
        const costPrice = parseFloat(obj["Cost Price"] ?? "0") || 0;
        const unitPrice = parseFloat(obj["Unit Price"] ?? "0") || 0;
        if (costPrice < 0 || unitPrice < 0) throw new Error("Prices must be non-negative");

        const data: typeof items.$inferInsert = {
          name,
          category: obj["Category"] || null,
          supplierId: obj["Supplier ID"] ? parseInt(obj["Supplier ID"], 10) : null,
          itemNumber: obj["Barcode"] || null,
          description: obj["Description"] || null,
          costPrice,
          unitPrice,
          reorderLevel: parseFloat(obj["Reorder Level"] ?? "0") || 0,
          receivingQuantity: 1,
          allowAltDescription: obj["Allow Alt Description"] === "1" || obj["Allow Alt Description"]?.toLowerCase() === "true",
          isSerialized: obj["Item has Serial Number"] === "1" || obj["Item has Serial Number"]?.toLowerCase() === "true",
          stockType: STOCK_TYPE.HAS_STOCK,
          itemType: ITEM_TYPE.ITEM,
          qtyPerPack: 1,
          packName: null,
          hsnCode: obj["HSN"] || null,
          deleted: false,
        };

        let newId: number;
        if (itemId) {
          tx.update(items).set(data).where(eq(items.itemId, itemId)).run();
          newId = itemId;
        } else {
          const inserted = tx.insert(items).values(data).returning({ id: items.itemId }).get();
          newId = inserted.id;
          tx.update(items).set({ lowSellItemId: newId }).where(eq(items.itemId, newId)).run();
        }

        tx.delete(itemsTaxes).where(eq(itemsTaxes.itemId, newId)).run();
        if (obj["Tax 1 Name"] && obj["Tax 1 Percent"]) {
          tx.insert(itemsTaxes).values({
            itemId: newId,
            name: obj["Tax 1 Name"],
            percent: parseFloat(obj["Tax 1 Percent"]) || 0,
          }).run();
        }
        if (obj["Tax 2 Name"] && obj["Tax 2 Percent"]) {
          tx.insert(itemsTaxes).values({
            itemId: newId,
            name: obj["Tax 2 Name"],
            percent: parseFloat(obj["Tax 2 Percent"]) || 0,
          }).run();
        }

        for (const loc of locations) {
          const colName = `location_${loc.locationName}`;
          const raw = obj[colName];
          if (raw && raw.trim()) {
            const newQty = parseFloat(raw) || 0;
            const existing = tx.select().from(itemQuantities)
              .where(eq(itemQuantities.itemId, newId))
              .all()
              .find((q) => q.locationId === loc.locationId);
            const oldQty = existing?.quantity ?? 0;
            if (existing) {
              tx.update(itemQuantities).set({ quantity: newQty })
                .where(eq(itemQuantities.itemId, newId)).run();
            } else {
              tx.insert(itemQuantities).values({
                itemId: newId,
                locationId: loc.locationId,
                quantity: newQty,
              }).run();
            }
            const delta = newQty - oldQty;
            if (delta !== 0) {
              tx.insert(inventory).values({
                transItems: newId,
                transUser: personId,
                transLocation: loc.locationId,
                transInventory: delta,
                transComment: "Inventory CSV import quantity",
              }).run();
            }
          }
        }

        for (const a of attrs) {
          const colName = `attribute_${a.definitionName}`;
          const raw = obj[colName];
          if (!raw || !raw.trim()) continue;
          if (raw === "_DELETE_") {
            tx.delete(attributeLinks).where(eq(attributeLinks.itemId, newId)).run();
            continue;
          }
          let attrValId: number | undefined;
          if (a.definitionType === "TEXT") {
            const existing = tx.select().from(attributeValues)
              .where(eq(attributeValues.attributeValue, raw))
              .get();
            if (existing) {
              attrValId = existing.attributeId;
            } else {
              const ins = tx.insert(attributeValues).values({ attributeValue: raw }).returning({ id: attributeValues.attributeId }).get();
              attrValId = ins.id;
            }
          } else if (a.definitionType === "DROPDOWN") {
            const existing = tx.select().from(attributeValues)
              .where(eq(attributeValues.attributeValue, raw))
              .get();
            if (existing) {
              attrValId = existing.attributeId;
            } else {
              const ins = tx.insert(attributeValues).values({ attributeValue: raw }).returning({ id: attributeValues.attributeId }).get();
              attrValId = ins.id;
            }
          } else if (a.definitionType === "DECIMAL") {
            const dec = parseFloat(raw) || 0;
            const ins = tx.insert(attributeValues).values({ attributeDecimal: dec }).returning({ id: attributeValues.attributeId }).get();
            attrValId = ins.id;
          } else if (a.definitionType === "DATE") {
            const ins = tx.insert(attributeValues).values({ attributeDate: raw }).returning({ id: attributeValues.attributeId }).get();
            attrValId = ins.id;
          } else if (a.definitionType === "CHECKBOX") {
            const v = raw === "1" || raw.toLowerCase() === "true" ? "1" : "0";
            const existing = tx.select().from(attributeValues).where(eq(attributeValues.attributeValue, v)).get();
            if (existing) {
              attrValId = existing.attributeId;
            } else {
              const ins = tx.insert(attributeValues).values({ attributeValue: v }).returning({ id: attributeValues.attributeId }).get();
              attrValId = ins.id;
            }
          }
          if (attrValId) {
            tx.insert(attributeLinks).values({
              attributeId: attrValId,
              definitionId: a.definitionId,
              itemId: newId,
            }).run();
          }
        }
      });
      success++;
    } catch (err) {
      failed++;
      errors.push(`Row ${i + 2}: ${(err as Error).message}`);
    }
  }

  return Response.json({ success, failed, errors: errors.slice(0, 50) });
}