import Link from "next/link";
import { requirePermission } from "@/lib/auth/with-permission";
import { getAll } from "@/lib/stock_locations/repository";
import { saveStockLocationAction } from "../../actions";

export default async function StockLocationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("config");
  const { id } = await params;
  const locationId = Number(id);
  const locations = await getAll();
  const location = locations.find((entry) => entry.locationId === locationId) ?? null;
  return (
    <form action={saveStockLocationAction} className="max-w-md space-y-3" data-testid="entity-form">
      <h1 className="text-xl font-semibold">
        {location ? "Edit" : "New"} Stock Location
      </h1>
      <input type="hidden" name="locationId" value={location?.locationId ?? 0} />
      <div>
        <label className="block text-sm">Name</label>
        <input
          name="locationName"
          required
          defaultValue={location?.locationName ?? ""}
          className="w-full rounded border px-2 py-1"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" defaultChecked={location?.isDefault ?? false} />
        Default location
      </label>
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-blue-600 px-4 py-1 text-white" data-testid="save-button">
          Save
        </button>
        <Link href="/config/stock-locations" className="rounded border px-4 py-1">
          Cancel
        </Link>
      </div>
    </form>
  );
}
