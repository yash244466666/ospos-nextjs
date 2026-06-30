"use client";

import { useState, useTransition } from "react";
import { saveCategoryAction } from "@/app/(secure)/expenses_categories/actions";

interface Initial { expenseCategoryId: number; category: string; description: string | null; }

export default function CategoryForm({ initial }: { initial: Initial | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      data-testid="entity-form"
      action={(fd) => { setError(null); start(() => saveCategoryAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Category</h1>
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
      <input type="hidden" name="expenseCategoryId" value={initial?.expenseCategoryId ?? 0} />
      <div>
        <label className="block text-sm">Name</label>
        <input name="category" defaultValue={initial?.category ?? ""} required className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Description</label>
        <textarea name="description" defaultValue={initial?.description ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-button">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
