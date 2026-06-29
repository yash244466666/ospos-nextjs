"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveDinnerTableAction } from "@/app/(secure)/dinner_tables/actions";

interface Initial { dinnerTableId: number; name: string; }

export default function DinnerTablesForm({ initial }: { initial: Initial | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      action={(fd) => { setError(null); start(() => saveDinnerTableAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Dinner Table</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="dinnerTableId" value={initial?.dinnerTableId ?? 0} />
      <div>
        <label className="block text-sm">Name *</label>
        <input name="name" defaultValue={initial?.name ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href="/dinner_tables" className="px-4 py-1 text-sm">Back</Link>
      </div>
    </form>
  );
}