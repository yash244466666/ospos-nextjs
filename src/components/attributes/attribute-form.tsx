"use client";

import { useState, useTransition } from "react";
import { saveAttributeAction } from "@/app/(secure)/attributes/actions";
import type { DefinitionRow, DefinitionType } from "@/lib/attributes/repository";

const TYPES: DefinitionType[] = ["TEXT", "DROPDOWN", "DECIMAL", "DATE", "CHECKBOX", "GROUP"];

interface Initial extends DefinitionRow {}

export default function AttributeForm({
  initial,
  values,
  groups,
}: {
  initial: Initial | null;
  values: { attributeId: number; attributeValue: string | null }[];
  groups: DefinitionRow[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<DefinitionType>(initial?.definitionType ?? "TEXT");
  const [valueLines, setValueLines] = useState<string[]>(
    values.length > 0 ? values.map((v) => v.attributeValue ?? "") : [""]
  );

  function addValue() { setValueLines([...valueLines, ""]); }
  function removeValue(idx: number) { setValueLines(valueLines.filter((_, i) => i !== idx)); }
  function updateValue(idx: number, v: string) {
    setValueLines(valueLines.map((x, i) => (i === idx ? v : x)));
  }

  function onSubmit(fd: FormData) {
    setError(null);
    if (type === "DROPDOWN") {
      fd.set("values", JSON.stringify(valueLines.filter((v) => v.trim() !== "")));
    } else {
      fd.set("values", "[]");
    }
    start(() => saveAttributeAction(fd).catch((e) => setError((e as Error).message)));
  }

  return (
    <form className="p-4 max-w-xl space-y-3" action={onSubmit}>
      <h1 className="text-xl">{initial ? "Edit" : "New"} Attribute</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="definitionId" value={initial?.definitionId ?? 0} />
      <div>
        <label className="block text-sm">Name *</label>
        <input name="definitionName" defaultValue={initial?.definitionName ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div>
        <label className="block text-sm">Type</label>
        <select
          name="definitionType"
          defaultValue={initial?.definitionType ?? "TEXT"}
          className="border px-2 py-1 w-full"
          onChange={(e) => setType(e.target.value as DefinitionType)}
        >
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm">Unit</label>
        <input name="definitionUnit" defaultValue={initial?.definitionUnit ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Visible In</label>
        <div className="flex gap-4 text-sm">
          {[
            { key: "show_in_items", label: "Items", flag: 1 },
            { key: "show_in_sales", label: "Sales", flag: 2 },
            { key: "show_in_receivings", label: "Receivings", flag: 4 },
          ].map((f) => (
            <label key={f.key} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="definitionFlags"
                value={f.key}
                defaultChecked={initial ? (initial.definitionFlags & f.flag) !== 0 : false}
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>
      {type === "GROUP" && (
        <div>
          <label className="block text-sm">Parent Group</label>
          <select name="definitionFk" defaultValue={String(initial?.definitionFk ?? 0)} className="border px-2 py-1 w-full">
            <option value="0">— None —</option>
            {groups.map((g) => <option key={g.definitionId} value={g.definitionId}>{g.definitionName}</option>)}
          </select>
        </div>
      )}
      {type === "DROPDOWN" && (
        <div className="pt-2">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-medium">Values</h2>
            <button type="button" onClick={addValue} className="text-sm bg-gray-200 px-2 py-1 rounded">+ Add</button>
          </div>
          {valueLines.map((v, i) => (
            <div key={i} className="flex gap-2 mb-1">
              <input
                value={v}
                onChange={(e) => updateValue(i, e.target.value)}
                className="border px-2 py-1 flex-1"
                placeholder="Value"
              />
              <button type="button" onClick={() => removeValue(i)} className="text-red-600">x</button>
            </div>
          ))}
        </div>
      )}
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-button">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}