import { requirePermission } from "@/lib/auth/with-permission";
import { getItemById, getItemTaxes, getQuantitiesByLocation, getStockLocations, getSuppliers } from "@/lib/items/repository";
import { getConfigBool } from "@/lib/config";
import { ItemForm } from "@/components/items/item-form";
import { notFound } from "next/navigation";

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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit Item</h1>
      <ItemForm
        item={item}
        taxes={taxes}
        quantities={quantities}
        locations={locations}
        suppliers={suppliers}
        includeHsn={includeHsn}
        useDestinationBasedTax={useDestinationBasedTax}
      />
    </div>
  );
}