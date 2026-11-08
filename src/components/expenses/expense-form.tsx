"use client";

import { useState, useTransition } from "react";
import { saveExpenseAction } from "@/app/(secure)/expenses/actions";

interface Initial {
  expenseId: number;
  amount: string | null;
  paymentType: string | null;
  expenseCategoryId: number | null;
  description: string | null;
}

export default function ExpenseForm({ initial, categories }: { initial: Initial | null; categories: { expenseCategoryId: number; category: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="p-4 max-w-xl space-y-3"
      data-testid="entity-form"
      action={(fd) => { setError(null); start(() => saveExpenseAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Expense</h1>
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
      <input type="hidden" name="expenseId" value={initial?.expenseId ?? 0} />
      <div>
        <label className="block text-sm">Amount</label>
        <input type="number" step="0.01" name="amount" defaultValue={String(initial?.amount ?? 0)} required className="border px-2 py-1 w-full" />
      </div>
      <div>
        <label className="block text-sm">Category</label>
        <select name="expenseCategoryId" defaultValue={String(initial?.expenseCategoryId ?? 0)} className="border px-2 py-1 w-full">
          <option value="0">— None —</option>
          {categories.map((c) => <option key={c.expenseCategoryId} value={c.expenseCategoryId}>{c.category}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm">Payment Type</label>
        <select name="paymentType" defaultValue={initial?.paymentType ?? "cash"} className="border px-2 py-1 w-full">
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
          <option value="check">Check</option>
          <option value="bank_transfer">Transfer</option>
        </select>
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