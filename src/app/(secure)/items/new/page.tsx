import { requirePermission } from "@/lib/auth/with-permission";
import { getStockLocations, getSuppliers } from "@/lib/items/repository";
import { getConfigBool } from "@/lib/config";
import { ItemForm } from "@/components/items/item-form";
import { getDb } from "@/lib/db";
import { taxCategories, attributeDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function NewItemPage() {
  await requirePermission("items");
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
      <h1 className="text-2xl font-bold mb-4">New Item</h1>
      <ItemForm
        item={null}
        taxes={[]}
        quantities={{}}
        locations={locations}
        suppliers={suppliers}
        taxCategories={taxCategoryRows.map((t) => ({ taxCategoryId: t.taxCategoryId, taxCategory: t.taxCategory }))}
        attributes={attributeRows.map((a) => ({ definitionId: a.definitionId, definitionName: a.definitionName, definitionType: a.definitionType }))}
        attributeValues={{}}
        includeHsn={includeHsn}
        useDestinationBasedTax={useDestinationBasedTax}
      />
    </div>
  );
}
