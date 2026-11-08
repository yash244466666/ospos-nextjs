import { eq } from "drizzle-orm";
import { requirePermissionApi } from "@/lib/auth/with-permission";
import { getDb } from "@/lib/db";
import { attributeDefinitions, stockLocations } from "@/db/schema";
import { loadConfig } from "@/lib/config";

/** Exact upstream `generate_import_items_csv`: mixed quoting, BOM, no trailing newline. */
const HEADER =
  'Id,Barcode,"Item Name",Category,"Supplier ID","Cost Price","Unit Price","Tax 1 Name","Tax 1 Percent","Tax 2 Name","Tax 2 Percent","Reorder Level",Description,"Allow Alt Description","Item has Serial Number",Image,HSN';

export async function GET() {
  const permission = await requirePermissionApi("items");
  if (!permission.ok) {
    return Response.json(permission.body, { status: permission.status });
  }
  await loadConfig();
  const db = await getDb();
  const locations = await db
    .select()
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false));
  const definitions = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.deleted, false));

  let csv = `﻿${HEADER}`;
  for (const location of locations) {
    csv += `,"location_${location.locationName ?? ""}"`;
  }
  for (const definition of definitions) {
    if (definition.definitionName === "Category") continue;
    csv += `,"attribute_${definition.definitionName}"`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="items_template.csv"',
    },
  });
}
