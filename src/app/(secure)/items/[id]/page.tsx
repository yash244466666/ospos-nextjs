import { requirePermission } from "@/lib/auth/with-permission";
import { getItemById, getItemTaxes, getQuantitiesByLocation, getStockLocations, getSuppliers } from "@/lib/items/repository";
import { getConfigBool } from "@/lib/config";
import { ItemForm } from "@/components/items/item-form";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { taxCategories, attributeDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAttributesByItem } from "@/lib/attributes/repository";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("items");
  const { id } = await params;
  const itemId = parseInt(id, 10);
  const item = await getItemById(itemId);
  if (!item) notFound();
  const taxes = (await getItemTaxes(itemId)).map((t) => ({ name: t.name, percent: Number(t.percent) }));
  const quantities = Object.fromEntries(
    Object.entries(await getQuantitiesByLocation(itemId)).map(([locationId, quantity]) => [locationId, Number(quantity)]),
  );
  const attributeValueRows = await getAttributesByItem(itemId);
  const attributeValues = Object.fromEntries(attributeValueRows.map((a) => [a.definitionId, a.value]));
  const locations = await getStockLocations();
  const suppliers = await getSuppliers();
  const includeHsn = getConfigBool("include_hsn", false);
  const useDestinationBasedTax = getConfigBool("use_destination_based_tax", false);
  const db = await getDb();
  const taxCategoryRows = useDestinationBasedTax
    ? await db.select().from(taxCategories).where(eq(taxCategories.deleted, false))
    : [];
  const attributeRows = await db.select().from(attributeDefinitions).where(eq(attributeDefinitions.deleted, false));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit Item</h1>
      <ItemForm
        item={item}
        taxes={taxes}
        quantities={quantities}
        locations={locations}
        suppliers={suppliers}
        taxCategories={taxCategoryRows.map((t) => ({ taxCategoryId: t.taxCategoryId, taxCategory: t.taxCategory }))}
        attributes={attributeRows.map((a) => ({ definitionId: a.definitionId, definitionName: a.definitionName, definitionType: a.definitionType }))}
        attributeValues={attributeValues}
        includeHsn={includeHsn}
        useDestinationBasedTax={useDestinationBasedTax}
      />
    </div>
  );
}
