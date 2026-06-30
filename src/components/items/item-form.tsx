"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { saveItemAction } from "@/app/(secure)/items/actions";
import type { ItemRow } from "@/lib/items/repository";
import type { DefinitionType } from "@/lib/attributes/repository";

interface AttributeDef {
  definitionId: number;
  definitionName: string;
  definitionType: string;
}

interface Props {
  item: ItemRow | null;
  taxes: { name: string; percent: number }[];
  quantities: Record<number, number>;
  locations: { locationId: number; locationName: string }[];
  suppliers: { personId: number; companyName: string | null }[];
  taxCategories: { taxCategoryId: number; taxCategory: string }[];
  attributes: AttributeDef[];
  attributeValues: Record<number, string | null>;
  includeHsn: boolean;
  useDestinationBasedTax: boolean;
}

export function ItemForm({
  item,
  taxes,
  quantities,
  locations,
  suppliers,
  taxCategories,
  attributes,
  attributeValues: initialAttributeValues,
  includeHsn,
  useDestinationBasedTax,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tax1Name, setTax1Name] = useState(taxes[0]?.name ?? "");
  const [tax1Percent, setTax1Percent] = useState(taxes[0]?.percent?.toString() ?? "");
  const [tax2Name, setTax2Name] = useState(taxes[1]?.name ?? "");
  const [tax2Percent, setTax2Percent] = useState(taxes[1]?.percent?.toString() ?? "");
  const [attributeValues, setAttributeValues] = useState<Record<number, string | null>>(initialAttributeValues);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("itemType", String(item?.itemType ?? 0));
    fd.set("stockType", String(item?.stockType ?? 0));
    const t = [];
    if (tax1Name && tax1Percent) t.push({ name: tax1Name, percent: tax1Percent });
    if (tax2Name && tax2Percent) t.push({ name: tax2Name, percent: tax2Percent });
    for (const tax of t) {
      fd.append("taxes", JSON.stringify(tax));
    }
    for (const loc of locations) {
      const input = fd.get(`qty_${loc.locationId}`) as string;
      if (input) {
        fd.append("quantities", JSON.stringify({ locationId: loc.locationId, quantity: input }));
      }
    }
    fd.set("attributeValues", JSON.stringify(attributeValues));
    startTransition(async () => {
      const result = await saveItemAction(fd);
      if (result?.error) {
        setError(JSON.stringify(result.error));
      }
    });
  }

  function updateAttribute(definitionId: number, value: string | null) {
    setAttributeValues((prev) => ({ ...prev, [definitionId]: value }));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-slate-900 max-w-6xl" data-testid="entity-form">
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
      {item && <input type="hidden" name="itemId" value={item.itemId} />}

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Basic Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Item Name *</label>
            <input type="text" name="name" defaultValue={item?.name ?? ""} required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Barcode</label>
            <input type="text" name="itemNumber" defaultValue={item?.itemNumber ?? ""}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Category</label>
            <input type="text" name="category" defaultValue={item?.category ?? ""}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Supplier</label>
            <select name="supplierId" defaultValue={item?.supplierId?.toString() ?? ""}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900">
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.personId} value={s.personId}>{s.companyName ?? `Supplier #${s.personId}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Cost Price *</label>
            <input type="number" step="0.01" name="costPrice" defaultValue={item?.costPrice ?? "0"} required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Unit Price *</label>
            <input type="number" step="0.01" name="unitPrice" defaultValue={item?.unitPrice ?? "0"} required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Reorder Level</label>
            <input type="number" step="1" name="reorderLevel" defaultValue={item?.reorderLevel ?? "0"}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Receiving Quantity</label>
            <input type="number" step="1" name="receivingQuantity" defaultValue={item?.receivingQuantity ?? "1"}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Qty Per Pack</label>
            <input type="number" step="1" name="qtyPerPack" defaultValue={item?.qtyPerPack ?? "1"}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Pack Name</label>
            <input type="text" name="packName" defaultValue={item?.packName ?? ""}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
          </div>
          {includeHsn && (
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">HSN Code</label>
              <input type="text" name="hsnCode" defaultValue={item?.hsnCode ?? ""}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="allowAltDescription" defaultChecked={item?.allowAltDescription} value="true" />
          Allow Alt Description
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="isSerialized" defaultChecked={item?.isSerialized} value="true" />
          Has Serial Number
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="stockType" value="1" defaultChecked={item?.stockType === 1} />
          Has No Stock (sell without tracking)
        </label>
      </section>

      <section>
        <label className="block text-sm font-medium mb-1 text-slate-700">Description</label>
        <textarea name="description" defaultValue={item?.description ?? ""} rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
      </section>

      {!useDestinationBasedTax && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Taxes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 text-slate-700">Tax 1 Name</label>
              <input type="text" value={tax1Name} onChange={(e) => setTax1Name(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900" />
              <label className="block text-sm mt-2 mb-1 text-slate-700">Tax 1 Percent</label>
              <input type="number" step="0.01" value={tax1Percent} onChange={(e) => setTax1Percent(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900" />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-700">Tax 2 Name</label>
              <input type="text" value={tax2Name} onChange={(e) => setTax2Name(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900" />
              <label className="block text-sm mt-2 mb-1 text-slate-700">Tax 2 Percent</label>
              <input type="number" step="0.01" value={tax2Percent} onChange={(e) => setTax2Percent(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900" />
            </div>
          </div>
        </section>
      )}
      {useDestinationBasedTax && (
        <section>
          <label className="block text-sm font-medium mb-1 text-slate-700">Tax Category</label>
          <select name="taxCategoryId" defaultValue={item?.taxCategoryId?.toString() ?? ""}
            className="w-full sm:w-1/2 border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900">
            <option value="">— None —</option>
            {taxCategories.map((t) => <option key={t.taxCategoryId} value={t.taxCategoryId}>{t.taxCategory}</option>)}
          </select>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Picture</h2>
        {item?.picFilename && (
          <div className="mb-3">
            <img src={`/api/items/pic-thumb/${item.picFilename}`} alt="" className="w-32 h-32 object-contain border rounded-lg" />
          </div>
        )}
        <input type="file" name="picture" accept="image/*"
          className="w-full sm:w-1/2 border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900" />
      </section>

      {attributes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Attributes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {attributes.map((a) => {
              const type = a.definitionType as DefinitionType;
              const value = attributeValues[a.definitionId] ?? "";
              return (
                <div key={a.definitionId}>
                  <label className="block text-sm font-medium mb-1 text-slate-700">{a.definitionName}</label>
                  {type === "CHECKBOX" ? (
                    <input
                      type="checkbox"
                      checked={value === "1"}
                      onChange={(e) => updateAttribute(a.definitionId, e.target.checked ? "1" : "0")}
                      className="w-5 h-5"
                    />
                  ) : type === "DROPDOWN" ? (
                    <input
                      type="text"
                      value={value ?? ""}
                      onChange={(e) => updateAttribute(a.definitionId, e.target.value || null)}
                      placeholder="Dropdown value"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                    />
                  ) : type === "DATE" ? (
                    <input
                      type="date"
                      value={value ?? ""}
                      onChange={(e) => updateAttribute(a.definitionId, e.target.value || null)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                    />
                  ) : type === "DECIMAL" ? (
                    <input
                      type="number"
                      step="0.0001"
                      value={value ?? ""}
                      onChange={(e) => updateAttribute(a.definitionId, e.target.value || null)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value ?? ""}
                      onChange={(e) => updateAttribute(a.definitionId, e.target.value || null)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Inventory</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => (
            <div key={loc.locationId}>
              <label className="block text-sm font-medium mb-1 text-slate-700">{loc.locationName}</label>
              <input
                type="number"
                step="0.001"
                name={`qty_${loc.locationId}`}
                defaultValue={quantities[loc.locationId]?.toString() ?? "0"}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 text-sm font-medium"
          data-testid="cancel-button">
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 text-sm font-medium"
          data-testid="save-button">
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
