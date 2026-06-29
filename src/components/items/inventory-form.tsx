"use client";
import { useState, useTransition } from "react";
import { adjustInventoryAction } from "@/app/(secure)/items/actions";

export function InventoryForm({
  itemId,
  locations,
  quantities,
}: {
  itemId: number;
  locations: { locationId: number; locationName: string }[];
  quantities: Record<number, number>;
}) {
  const [selectedLocation, setSelectedLocation] = useState<number>(locations[0]?.locationId ?? 0);
  const [newQty, setNewQty] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    startTransition(async () => {
      await adjustInventoryAction(itemId, selectedLocation, parseFloat(newQty));
      setNewQty("");
      setDone(true);
    });
  }

  return (
    <form onSubmit={submit} className="bg-white p-4 rounded shadow-sm border border-slate-200 flex gap-3 items-end">
      <div>
        <label className="block text-xs mb-1">Location</label>
        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(parseInt(e.target.value, 10))}
          className="border border-slate-300 rounded px-3 py-1.5"
        >
          {locations.map((l) => (
            <option key={l.locationId} value={l.locationId}>
              {l.locationName} (current: {(quantities[l.locationId] ?? 0).toFixed(3)})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1">New Quantity</label>
        <input
          type="number"
          step="0.001"
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
          required
          className="border border-slate-300 rounded px-3 py-1.5"
        />
      </div>
      <button
        type="submit"
        disabled={isPending || !newQty}
        className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
      >
        {isPending ? "Updating..." : "Update"}
      </button>
      {done && <span className="text-green-600 text-sm">Updated</span>}
    </form>
  );
}