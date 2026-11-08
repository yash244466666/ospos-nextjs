"use client";

import { useState, useTransition } from "react";
import { saveTaxJurisdictionAction } from "@/app/(secure)/tax_jurisdictions/actions";

interface Initial {
  jurisdictionId: number; jurisdictionName: string; taxType: number; reportingAuthority: string | null;
  taxableAmount?: number | null; taxRate?: number; taxGroup: string | null; roundCode?: number; cascadeSequence: number; deleted: boolean;
}

export default function TaxJurisdictionForm({ initial }: { initial: Initial | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      action={(fd) => { setError(null); start(() => saveTaxJurisdictionAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Tax Jurisdiction</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="jurisdictionId" value={initial?.jurisdictionId ?? 0} />
      <div>
        <label className="block text-sm">Jurisdiction Name *</label>
        <input name="jurisdictionName" defaultValue={initial?.jurisdictionName ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div>
        <label className="block text-sm">Tax Type *</label>
        <input name="taxType" defaultValue={initial?.taxType ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div>
        <label className="block text-sm">Reporting Authority</label>
        <input name="reportingAuthority" defaultValue={initial?.reportingAuthority ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Taxable Amount</label>
        <input type="number" step="0.01" name="taxableAmount" defaultValue={String(initial?.taxableAmount ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Tax Rate</label>
        <input type="number" step="0.0001" name="taxRate" defaultValue={String(initial?.taxRate ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Tax Group</label>
        <input name="taxGroup" defaultValue={initial?.taxGroup ?? ""} className="border px-2 py-1 w-full" />
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