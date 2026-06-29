"use client";

import { useState, useTransition } from "react";
import { saveTaxCategoryAction } from "@/app/(secure)/tax_categories/actions";

interface Initial { taxCategoryId: number; taxCategory: string; taxGroupSeq: string | null; deleted: boolean; }

export default function TaxCategoryForm({ initial }: { initial: Initial | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      action={(fd) => { setError(null); start(() => saveTaxCategoryAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Tax Category</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="taxCategoryId" value={initial?.taxCategoryId ?? 0} />
      <div>
        <label className="block text-sm">Category Name *</label>
        <input name="taxCategory" defaultValue={initial?.taxCategory ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div>
        <label className="block text-sm">Group Sequence</label>
        <input name="taxGroupSeq" defaultValue={initial?.taxGroupSeq ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}