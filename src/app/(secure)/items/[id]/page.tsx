import { requirePermission } from "@/lib/auth/with-permission";
import { getItemById, getItemTaxes, getQuantitiesByLocation, getStockLocations, getSuppliers } from "@/lib/items/repository";
import { getConfigBool } from "@/lib/config";
import { ItemForm } from "@/components/items/item-form";
import { notFound } from "next/navigation";
import { getDbSync } from "@/lib/db";
import { taxCategories, attributeDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("items");
  const { id } = await params;
  const itemId = parseInt(id, 10);
  const item = getItemById(itemId);
  if (!item) notFound();
  const taxes = getItemTaxes(itemId);
  const quantities = getQuantitiesByLocation(itemId);
  const locations = getStockLocations();
  const suppliers = getSuppliers();
  const includeHsn = getConfigBool("include_hsn", false);
  const useDestinationBasedTax = getConfigBool("use_destination_based_tax", false);
  const db = getDbSync();
  const taxCategoryRows = useDestinationBasedTax
    ? db.select().from(taxCategories).where(eq(taxCategories.deleted, false)).all()
    : [];
  const attributeRows = db.select().from(attributeDefinitions).where(eq(attributeDefinitions.deleted, false)).all();

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
        attributes={attributeRows.map((a) => ({ definitionId: a.definitionId, definitionName: a.definitionName, definitionType: a.definitionType as unknown as number }))}
        includeHsn={includeHsn}
        useDestinationBasedTax={useDestinationBasedTax}
      />
    </div>
  );
}
