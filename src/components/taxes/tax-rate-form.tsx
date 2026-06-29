"use client";

import { useState, useTransition } from "react";
import { saveTaxRateAction } from "@/app/(secure)/taxes/actions";

interface Initial {
  taxCodeLinkId: number; taxCodeId: number; taxCategoryId: number; jurisdictionId: number;
  taxRate: number; roundCode: number; cascadeSequence: number;
}
interface Code { taxCodeId: number; taxCode: string; taxCodeName: string; }
interface Cat { taxCategoryId: number; taxCategory: string; }
interface Jur { jurisdictionId: number; jurisdictionName: string; }

export default function TaxRateForm({
  initial, codes, categories, jurisdictions,
}: {
  initial: Initial | null;
  codes: Code[];
  categories: Cat[];
  jurisdictions: Jur[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      action={(fd) => { setError(null); start(() => saveTaxRateAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Tax Rate</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="taxCodeLinkId" value={initial?.taxCodeLinkId ?? 0} />
      <div>
        <label className="block text-sm">Tax Code *</label>
        <select name="taxCodeId" defaultValue={String(initial?.taxCodeId ?? 0)} className="border px-2 py-1 w-full">
          <option value="0">— Select —</option>
          {codes.map((c) => <option key={c.taxCodeId} value={c.taxCodeId}>{c.taxCode} — {c.taxCodeName}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm">Tax Category *</label>
        <select name="taxCategoryId" defaultValue={String(initial?.taxCategoryId ?? 0)} className="border px-2 py-1 w-full">
          <option value="0">— Select —</option>
          {categories.map((c) => <option key={c.taxCategoryId} value={c.taxCategoryId}>{c.taxCategory}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm">Jurisdiction *</label>
        <select name="jurisdictionId" defaultValue={String(initial?.jurisdictionId ?? 0)} className="border px-2 py-1 w-full">
          <option value="0">— Select —</option>
          {jurisdictions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.jurisdictionName}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm">Tax Rate</label>
        <input type="number" step="0.0001" name="taxRate" defaultValue={String(initial?.taxRate ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Round Code</label>
        <input type="number" name="roundCode" defaultValue={String(initial?.roundCode ?? 1)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Cascade Sequence</label>
        <input type="number" name="cascadeSequence" defaultValue={String(initial?.cascadeSequence ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}