import { requirePermission } from "@/lib/auth/with-permission";
import { getItemById, getInventoryHistory, getQuantitiesByLocation, getStockLocations } from "@/lib/items/repository";
import { InventoryForm } from "@/components/items/inventory-form";
import { notFound } from "next/navigation";

export default async function InventoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("items");
  const { id } = await params;
  const itemId = parseInt(id, 10);
  const item = getItemById(itemId);
  if (!item) notFound();
  const locations = getStockLocations();
  const quantities = getQuantitiesByLocation(itemId);
  const history = getInventoryHistory(itemId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Inventory: {item.name}</h1>
      <InventoryForm itemId={itemId} locations={locations} quantities={quantities} />
      <div className="bg-white rounded shadow-sm border border-slate-200">
        <h2 className="px-4 py-3 border-b font-medium">History</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Delta</th>
              <th className="px-3 py-2 text-left">Comment</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">No history</td></tr>
            )}
            {history.map((h) => (
              <tr key={h.transId} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {h.transDate ? new Date(h.transDate * 1000).toLocaleString() : ""}
                </td>
                <td className={`px-3 py-2 text-right font-mono ${h.transInventory >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {h.transInventory > 0 ? "+" : ""}{h.transInventory.toFixed(3)}
                </td>
                <td className="px-3 py-2">{h.transComment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}