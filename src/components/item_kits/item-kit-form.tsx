"use client";

import { useState, useTransition, useEffect } from "react";
import { saveItemKitAction, listItemsForSelectAction } from "@/app/(secure)/item_kits/actions";

interface Initial {
  itemKitId: number;
  itemKitNumber: string | null;
  name: string;
  description: string | null;
  kitDiscount: string;
  kitDiscountType: number;
  priceOption: number;
  printOption: number;
}

interface KitItem {
  kitSequence: number;
  itemId: number;
  quantity: string | number;
  name: string | null;
  itemNumber: string | null;
}

interface SelectItem { itemId: number; name: string; itemNumber: string | null; }

export default function ItemKitForm({ initial, kitItems }: { initial: Initial | null; kitItems: KitItem[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [itemOptions, setItemOptions] = useState<SelectItem[]>([]);
  const [lines, setLines] = useState<KitItem[]>(
    kitItems.length > 0
      ? kitItems
      : [{ kitSequence: 1, itemId: 0, quantity: "1", name: null, itemNumber: null }]
  );

  useEffect(() => {
    listItemsForSelectAction().then(setItemOptions).catch(() => setItemOptions([]));
  }, []);

  function addLine() {
    const nextSeq = lines.length > 0 ? Math.max(...lines.map((l) => l.kitSequence)) + 1 : 1;
    setLines([...lines, { kitSequence: nextSeq, itemId: 0, quantity: "1", name: null, itemNumber: null }]);
  }
  function removeLine(idx: number) {
    setLines(lines.filter((_, i) => i !== idx));
  }
  function updateLine(idx: number, patch: Partial<KitItem>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function onSubmit(fd: FormData) {
    setError(null);
    const items = lines
      .filter((l) => l.itemId > 0)
      .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) || 1, kitSequence: Number(l.kitSequence) || 0 }));
    fd.set("items", JSON.stringify(items));
    start(() => saveItemKitAction(fd).catch((e) => setError((e as Error).message)));
  }

  return (
    <form className="p-4 max-w-2xl space-y-3" data-testid="entity-form" action={onSubmit}>
      <h1 className="text-xl">{initial ? "Edit" : "New"} Item Kit</h1>
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
      <input type="hidden" name="itemKitId" value={initial?.itemKitId ?? 0} />
      <div>
        <label className="block text-sm">Kit Number</label>
        <input name="itemKitNumber" defaultValue={initial?.itemKitNumber ?? ""} className="border px-2 py-1 w-full font-mono" />
      </div>
      <div>
        <label className="block text-sm">Name *</label>
        <input name="name" defaultValue={initial?.name ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div>
        <label className="block text-sm">Description</label>
        <textarea name="description" defaultValue={initial?.description ?? ""} className="border px-2 py-1 w-full" rows={2} />
      </div>
      <div className="flex gap-3">
        <div>
          <label className="block text-sm">Kit Discount</label>
          <input type="number" step="0.01" name="kitDiscount" defaultValue={String(initial?.kitDiscount ?? 0)} className="border px-2 py-1 w-32" />
        </div>
        <div>
          <label className="block text-sm">Discount Type</label>
          <select name="kitDiscountType" defaultValue={String(initial?.kitDiscountType ?? 0)} className="border px-2 py-1 w-40">
            <option value="0">Percent</option>
            <option value="1">Fixed</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3">
        <div>
          <label className="block text-sm">Price Option</label>
          <select name="priceOption" defaultValue={String(initial?.priceOption ?? 0)} className="border px-2 py-1 w-56">
            <option value="0">Price all items</option>
            <option value="1">Price kit stock only</option>
            <option value="2">Price kit and stock</option>
            <option value="3">Price kit only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm">Print Option</label>
          <select name="printOption" defaultValue={String(initial?.printOption ?? 0)} className="border px-2 py-1 w-56">
            <option value="0">Print all</option>
            <option value="1">Print priced only</option>
            <option value="2">Print kit only</option>
            <option value="3">Do not print</option>
          </select>
        </div>
      </div>

      <div className="pt-2">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-medium">Kit Items</h2>
          <button type="button" onClick={addLine} className="text-sm bg-gray-200 px-2 py-1 rounded">+ Add line</button>
        </div>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Seq</th>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-1 w-16">
                  <input type="number" value={l.kitSequence} onChange={(e) => updateLine(i, { kitSequence: Number(e.target.value) })} className="border px-1 py-1 w-14" />
                </td>
                <td className="p-1">
                  <select value={l.itemId} onChange={(e) => updateLine(i, { itemId: Number(e.target.value) })} className="border px-1 py-1 w-full" data-testid="kit-item-select">
                    <option value="0">— Select —</option>
                    {itemOptions.map((it) => (
                      <option key={it.itemId} value={it.itemId}>
                        {it.itemNumber ? `${it.itemNumber} — ` : ""}{it.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1 w-24">
                  <input type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} className="border px-1 py-1 w-20 text-right" />
                </td>
                <td className="p-1 w-10">
                  <button type="button" onClick={() => removeLine(i)} className="text-red-600">x</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-button">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}