"use client";

import { useState, useTransition } from "react";
import { saveCashupAction } from "@/app/(secure)/cashups/actions";

interface Initial {
  cashupId: number;
  openDate: number | null;
  closeDate: number | null;
  openAmountCash: number;
  transferAmountCash: number;
  closedAmountCash: number;
  note: string | null;
  employeeId: number | null;
  deleted: boolean;
}

function toInputValue(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CashupForm({ initial, employees }: { initial: Initial | null; employees: { personId: number; label: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      action={(fd) => { setError(null); start(() => saveCashupAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Cashup</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="cashupId" value={initial?.cashupId ?? 0} />
      <div>
        <label className="block text-sm">Open Date</label>
        <input type="datetime-local" name="openDate" defaultValue={toInputValue(initial?.openDate ?? null)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Close Date</label>
        <input type="datetime-local" name="closeDate" defaultValue={toInputValue(initial?.closeDate ?? null)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Open Cash</label>
        <input type="number" step="0.01" name="openAmountCash" defaultValue={String(initial?.openAmountCash ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Transfer Cash</label>
        <input type="number" step="0.01" name="transferAmountCash" defaultValue={String(initial?.transferAmountCash ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Closed Cash</label>
        <input type="number" step="0.01" name="closedAmountCash" defaultValue={String(initial?.closedAmountCash ?? 0)} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Employee</label>
        <select name="employeeId" defaultValue={String(initial?.employeeId ?? 0)} className="border px-2 py-1 w-full">
          <option value="0">— None —</option>
          {employees.map((e) => <option key={e.personId} value={e.personId}>{e.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm">Note</label>
        <textarea name="note" defaultValue={initial?.note ?? ""} className="border px-2 py-1 w-full" rows={2} />
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}