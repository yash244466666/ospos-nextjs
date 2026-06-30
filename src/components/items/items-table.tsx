"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { ItemRow } from "@/lib/items/repository";

export function ItemsTable({
  rows,
  locations,
  currentLocation,
}: {
  rows: (ItemRow & { quantity?: number })[];
  locations: { locationId: number; locationName: string }[];
  currentLocation?: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [isPending, startTransition] = useTransition();

  function applySearch() {
    const sp = new URLSearchParams(params.toString());
    if (search) sp.set("q", search);
    else sp.delete("q");
    startTransition(() => router.push(`/items?${sp.toString()}`));
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
          placeholder="Search items..."
          data-testid="table-search-input"
          className="flex-1 min-w-48 border border-slate-300 rounded px-3 py-1.5"
        />
        <select
          value={currentLocation ?? ""}
          onChange={(e) => {
            const sp = new URLSearchParams(params.toString());
            if (e.target.value) sp.set("location", e.target.value);
            else sp.delete("location");
            router.push(`/items?${sp.toString()}`);
          }}
          className="border border-slate-300 rounded px-3 py-1.5"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.locationId} value={l.locationId}>
              {l.locationName}
            </option>
          ))}
        </select>
        {[
          { key: "empty_upc", label: "Empty UPC" },
          { key: "low_inventory", label: "Low Inventory" },
          { key: "serialized", label: "Serialized" },
          { key: "no_description", label: "No Description" },
          { key: "deleted", label: "Deleted" },
          { key: "temporary", label: "Temporary" },
        ].map((f) => (
          <label key={f.key} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={params.get(f.key) === "1"}
              onChange={(e) => {
                const sp = new URLSearchParams(params.toString());
                if (e.target.checked) sp.set(f.key, "1");
                else sp.delete(f.key);
                router.push(`/items?${sp.toString()}`);
              }}
            />
            {f.label}
          </label>
        ))}
      </div>

      <div className="overflow-x-auto bg-white rounded shadow-sm border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Barcode</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Reorder</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  No items found
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.itemId} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">
                  {row.itemNumber ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/items/${row.itemId}`} className="text-blue-600 hover:underline">
                    {row.name}
                  </Link>
                  {row.deleted && <span className="ml-2 text-xs text-red-500">(deleted)</span>}
                </td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2 text-right">${row.costPrice.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">${row.unitPrice.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">
                  {row.quantity !== undefined ? row.quantity.toFixed(0) : "—"}
                </td>
                <td className="px-3 py-2 text-right">{row.reorderLevel}</td>
                <td className="px-3 py-2 flex gap-2">
                  <Link
                    href={`/items/${row.itemId}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/items/${row.itemId}/inventory`}
                    className="text-slate-600 hover:underline text-xs"
                  >
                    Inventory
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}