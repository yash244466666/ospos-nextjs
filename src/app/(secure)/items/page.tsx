import { requirePermission } from "@/lib/auth/with-permission";
import { searchItems, getStockLocations } from "@/lib/items/repository";
import { ItemsTable } from "@/components/items/items-table";
import Link from "next/link";
import { Package, Plus, Upload, Barcode } from "lucide-react";

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
  const { rows, total } = searchItems(filters);
  const locations = getStockLocations();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Items</h1>
            <p className="text-sm text-slate-500">{total ?? rows.length} records · manage inventory and pricing</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/items/csv-import" className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4" /> CSV Import
          </Link>
          <Link href="/items/generate-barcodes" className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Barcode className="w-4 h-4" /> Barcodes
          </Link>
          <Link href="/items/new" className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-[var(--color-accent)] hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm" data-testid="new-button">
            <Plus className="w-4 h-4" /> New Item
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-[var(--color-border)] shadow-sm" method="get" action="/items">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search items by name, number or description"
          data-testid="search-input"
          className="flex-1 min-w-[16rem] border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
        <select
          name="location"
          defaultValue={stockLocationId?.toString() ?? ""}
          data-testid="location-select"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.locationId} value={l.locationId}>{l.locationName}</option>)}
        </select>
        <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors" data-testid="search-button">
          Search
        </button>
        {sp.q && (
          <Link href="/items" className="text-sm text-slate-500 hover:text-slate-700">Clear</Link>
        )}
      </form>

      <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden" data-testid="data-table">
        <ItemsTable rows={rows} locations={locations} currentLocation={stockLocationId} />
      </div>
    </div>
  );
}
