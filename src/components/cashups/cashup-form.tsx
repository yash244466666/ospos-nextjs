"use client";

import { useState, useTransition } from "react";
import { saveCashupAction } from "@/app/(secure)/cashups/actions";

interface Initial {
  cashupId: number;
  openDate: string | null;
  closeDate: string | null;
  openAmountCash: string;
  transferAmountCash: string;
  closedAmountCash: string;
  closedAmountDue: string;
  closedAmountCard: string;
  closedAmountCheck: string;
  closedAmountTotal: string;
  description: string;
  note: boolean;
  employeeId: number | null;
  deleted: boolean;
}

function toInputValue(ts: string | null): string {
  if (!ts) return "";
  return ts.replace(" ", "T").slice(0, 16);
}

export default function CashupForm({ initial, employees }: { initial: Initial | null; employees: { personId: number; label: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      data-testid="entity-form"
      action={(fd) => { setError(null); start(() => saveCashupAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Cashup</h1>
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
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
        <input type="number" step="0.01" name="openAmountCash" defaultValue={initial?.openAmountCash ?? "0"} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Transfer Cash</label>
        <input type="number" step="0.01" name="transferAmountCash" defaultValue={initial?.transferAmountCash ?? "0"} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Closed Cash</label>
        <input type="number" step="0.01" name="closedAmountCash" defaultValue={initial?.closedAmountCash ?? "0"} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Closed Due</label>
        <input type="number" step="0.01" name="closedAmountDue" defaultValue={initial?.closedAmountDue ?? "0"} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Closed Card</label>
        <input type="number" step="0.01" name="closedAmountCard" defaultValue={initial?.closedAmountCard ?? "0"} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Closed Check</label>
        <input type="number" step="0.01" name="closedAmountCheck" defaultValue={initial?.closedAmountCheck ?? "0"} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Closed Total (calculated)</label>
        <input type="text" name="closedAmountTotal" readOnly defaultValue={initial?.closedAmountTotal ?? "0"} className="border px-2 py-1 w-full bg-slate-50" />
      </div>
      <div>
        <label className="block text-sm">Employee</label>
        <select name="employeeId" defaultValue={String(initial?.employeeId ?? 0)} className="border px-2 py-1 w-full">
          <option value="0">— None —</option>
          {employees.map((e) => <option key={e.personId} value={e.personId}>{e.label}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" name="note" defaultChecked={initial?.note ?? false} />
        <label className="block text-sm">Note</label>
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-button">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}