import { requirePermission } from "@/lib/auth/with-permission";
import { searchItems, getStockLocations } from "@/lib/items/repository";
import { ItemsTable } from "@/components/items/items-table";
import Link from "next/link";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("items");
  const sp = await searchParams;
  const stockLocationId = sp.location ? parseInt(sp.location, 10) : undefined;
  const filters = {
    searchText: sp.q,
    stockLocationId,
    emptyUpc: sp.empty_upc === "1",
    lowInventory: sp.low_inventory === "1",
    isSerialized: sp.serialized === "1",
    noDescription: sp.no_description === "1",
    searchCustom: sp.search_custom === "1",
    isDeleted: sp.deleted === "1" ? true : sp.deleted === "0" ? false : undefined,
    temporary: sp.temporary === "1",
    limit: 100,
  };
  const { rows } = searchItems(filters);
  const locations = getStockLocations();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Items</h1>
        <div className="flex gap-2">
          <Link href="/items/csv-import" className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100">
            CSV Import
          </Link>
          <Link href="/items/generate-barcodes" className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100">
            Generate Barcodes
          </Link>
          <Link href="/items/new" className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            New Item
          </Link>
        </div>
      </div>
      <ItemsTable rows={rows} locations={locations} currentLocation={stockLocationId} />
    </div>
  );
}