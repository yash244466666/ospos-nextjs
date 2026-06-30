"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { ItemRow } from "@/lib/items/repository";
import type { DefinitionRow } from "@/lib/attributes/repository";
import { ImageIcon, Package, Pencil, Pin } from "lucide-react";

export function ItemsTable({
  rows,
  locations,
  currentLocation,
  useDestinationBasedTax,
  definitions,
}: {
  rows: (ItemRow & { quantity?: number })[];
  locations: { locationId: number; locationName: string }[];
  currentLocation?: number;
  useDestinationBasedTax: boolean;
  definitions: DefinitionRow[];
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
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
          placeholder="Search items..."
          data-testid="table-search-input"
          className="flex-1 min-w-48 border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
        />
        <select
          value={currentLocation ?? ""}
          onChange={(e) => {
            const sp = new URLSearchParams(params.toString());
            if (e.target.value) sp.set("location", e.target.value);
            else sp.delete("location");
            router.push(`/items?${sp.toString()}`);
          }}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.locationId} value={l.locationId}>
              {l.locationName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {[
          { key: "empty_upc", label: "Empty UPC" },
          { key: "low_inventory", label: "Low Inventory" },
          { key: "serialized", label: "Serialized" },
          { key: "no_description", label: "No Description" },
          { key: "deleted", label: "Deleted" },
          { key: "temporary", label: "Temporary" },
        ].map((f) => (
          <label key={f.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
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

      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-slate-200">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">ID</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Image</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Barcode</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Name</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Category</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Supplier</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Cost</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Price</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Qty</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Reorder</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{useDestinationBasedTax ? "Tax Category" : "Tax %"}</th>
              {definitions.map((d) => (
                <th key={d.definitionId} className="px-3 py-2 text-left font-medium whitespace-nowrap">{d.definitionName}</th>
              ))}
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12 + definitions.length} className="px-3 py-8 text-center text-slate-400">
                  No items found
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.itemId} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap text-slate-500">{row.itemId}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.picFilename ? (
                    <img
                      src={`/api/items/pic-thumb/${encodeURIComponent(row.picFilename)}`}
                      alt=""
                      className="w-10 h-10 object-cover rounded border border-slate-200"
                    />
                  ) : (
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded bg-slate-100 text-slate-400">
                      <ImageIcon className="w-4 h-4" />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {row.itemNumber ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/items/${row.itemId}`} className="text-blue-600 hover:underline font-medium">
                    {row.name}
                  </Link>
                  {row.deleted && <span className="ml-2 text-xs text-red-500">(deleted)</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.category ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.companyName ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">${row.costPrice.toFixed(2)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">${row.unitPrice.toFixed(2)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {row.quantity !== undefined ? row.quantity.toFixed(0) : "—"}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{row.reorderLevel}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {useDestinationBasedTax ? (row.taxCategory ?? <span className="text-slate-400">—</span>) : (row.taxPercents ?? "—")}
                </td>
                {definitions.map((d) => (
                  <td key={d.definitionId} className="px-3 py-2 whitespace-nowrap">
                    {row.attributeValues?.[d.definitionId] ?? <span className="text-slate-400">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <Link href={`/items/${row.itemId}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs" title="Edit">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Link>
                    <Link href={`/items/${row.itemId}/inventory`} className="inline-flex items-center gap-1 text-slate-600 hover:underline text-xs" title="Inventory">
                      <Pin className="w-3.5 h-3.5" /> Inventory
                    </Link>
                    <Link href={`/items/generate-barcodes?ids=${row.itemId}`} className="inline-flex items-center gap-1 text-slate-600 hover:underline text-xs" title="Barcodes">
                      <Package className="w-3.5 h-3.5" /> Barcodes
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
