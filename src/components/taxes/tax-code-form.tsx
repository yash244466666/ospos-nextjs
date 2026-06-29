"use client";

import { useState, useTransition } from "react";
import { saveTaxCodeAction } from "@/app/(secure)/tax_codes/actions";

interface Initial { taxCodeId: number; taxCode: string; taxCodeName: string; city: string | null; state: string | null; deleted: boolean; }

export default function TaxCodeForm({ initial }: { initial: Initial | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      action={(fd) => { setError(null); start(() => saveTaxCodeAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Tax Code</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="taxCodeId" value={initial?.taxCodeId ?? 0} />
      <div>
        <label className="block text-sm">Code *</label>
        <input name="taxCode" defaultValue={initial?.taxCode ?? ""} className="border px-2 py-1 w-full font-mono" required />
      </div>
      <div>
        <label className="block text-sm">Name *</label>
        <input name="taxCodeName" defaultValue={initial?.taxCodeName ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div>
        <label className="block text-sm">City</label>
        <input name="city" defaultValue={initial?.city ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">State</label>
        <input name="state" defaultValue={initial?.state ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}