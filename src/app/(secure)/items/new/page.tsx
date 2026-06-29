import { requirePermission } from "@/lib/auth/with-permission";
import { getStockLocations, getSuppliers } from "@/lib/items/repository";
import { getConfigBool } from "@/lib/config";
import { ItemForm } from "@/components/items/item-form";

export default async function NewItemPage() {
  await requirePermission("items");
  const locations = getStockLocations();
  const suppliers = getSuppliers();
  const includeHsn = getConfigBool("include_hsn", false);
  const useDestinationBasedTax = getConfigBool("use_destination_based_tax", false);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">New Item</h1>
      <ItemForm
        item={null}
        taxes={[]}
        quantities={{}}
        locations={locations}
        suppliers={suppliers}
        includeHsn={includeHsn}
        useDestinationBasedTax={useDestinationBasedTax}
      />
    </div>
  );
}