"use client";

import { useState, useTransition } from "react";
import { saveGiftcardAction } from "@/app/(secure)/giftcards/actions";

interface Initial { giftcardId: number; giftcardNumber: string; value: number | null; personId: number | null; }

export default function GiftcardForm({ initial, customers }: { initial: Initial | null; customers: { personId: number; label: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      data-testid="entity-form"
      action={(fd) => { setError(null); start(() => saveGiftcardAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Gift Card</h1>
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
      <input type="hidden" name="giftcardId" value={initial?.giftcardId ?? 0} />
      <div>
        <label className="block text-sm">Number (blank = auto-generate)</label>
        <input name="giftcardNumber" defaultValue={initial?.giftcardNumber ?? ""} className="border px-2 py-1 w-full font-mono" />
      </div>
      <div>
        <label className="block text-sm">Value</label>
        <input type="number" step="0.01" name="value" defaultValue={String(initial?.value ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Customer</label>
        <select name="personId" defaultValue={String(initial?.personId ?? 0)} className="border px-2 py-1 w-full">
          <option value="0">— None —</option>
          {customers.map((c) => <option key={c.personId} value={c.personId}>{c.label}</option>)}
        </select>
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-button">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}