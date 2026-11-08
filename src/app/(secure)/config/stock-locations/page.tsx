import Link from "next/link";
import { requirePermission } from "@/lib/auth/with-permission";
import { getAll } from "@/lib/stock_locations/repository";
import { deleteStockLocationAction, setDefaultStockLocationAction } from "./actions";

export default async function StockLocationsPage() {
  await requirePermission("config");
  const locations = await getAll();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stock Locations</h1>
        <Link
          href="/config/stock-locations/new/0"
          data-testid="new-button"
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
        >
          New Location
        </Link>
      </div>
      <table className="w-full border text-sm" data-testid="data-table">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-right">Sort</th>
            <th className="p-2 text-left">Default</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {locations.map((location) => (
            <tr key={location.locationId} className="border-t">
              <td className="p-2">{location.locationId}</td>
              <td className="p-2">{location.locationName}</td>
              <td className="p-2 text-right">{location.sortOrder ?? ""}</td>
              <td className="p-2">
                {location.isDefault ? (
                  <span className="font-medium text-emerald-700">Default</span>
                ) : (
                  <form action={setDefaultStockLocationAction.bind(null, location.locationId)}>
                    <button type="submit" className="text-blue-600">Make default</button>
                  </form>
                )}
              </td>
              <td className="flex gap-3 p-2">
                <Link href={`/config/stock-locations/new/${location.locationId}`} className="text-blue-600">
                  Edit
                </Link>
                {location.locationId !== 1 ? (
                  <form action={deleteStockLocationAction.bind(null, location.locationId)}>
                    <button type="submit" className="text-red-600">Delete</button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link href="/config" className="text-sm text-blue-600">
        Back to Configuration
      </Link>
    </div>
  );
}
