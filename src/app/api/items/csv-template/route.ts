import { auth } from "@/lib/auth/options";
import { getDbSync } from "@/lib/db";
import { stockLocations, attributeDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const db = getDbSync();
  const locations = db.select().from(stockLocations).where(eq(stockLocations.deleted, false)).all();
  const attrs = db.select().from(attributeDefinitions).where(eq(attributeDefinitions.deleted, false)).all();

  const headers = [
    "Id", "Barcode", "Item Name", "Category", "Supplier ID", "Cost Price", "Unit Price",
    "Tax 1 Name", "Tax 1 Percent", "Tax 2 Name", "Tax 2 Percent", "Reorder Level",
    "Description", "Allow Alt Description", "Item has Serial Number", "Image", "HSN",
  ];
  for (const loc of locations) headers.push(`location_${loc.locationName}`);
  for (const a of attrs) headers.push(`attribute_${a.definitionName}`);

  const csv = "\uFEFF" + headers.map((h) => `"${h}"`).join(",") + "\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="items_template.csv"`,
    },
  });
}