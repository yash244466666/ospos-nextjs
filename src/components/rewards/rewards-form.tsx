"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveRewardAction } from "@/app/(secure)/rewards/actions";

interface Initial { rewardId: number; name: string; pointsPercent: number; }

export default function RewardsForm({ initial }: { initial: Initial | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      data-testid="entity-form"
      action={(fd) => { setError(null); start(() => saveRewardAction(fd).catch((e) => setError((e as Error).message))); }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Reward</h1>
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
      <input type="hidden" name="rewardId" value={initial?.rewardId ?? 0} />
      <div>
        <label className="block text-sm">Name *</label>
        <input name="name" defaultValue={initial?.name ?? ""} className="border px-2 py-1 w-full" required />
      </div>
      <div>
        <label className="block text-sm">Points Percent</label>
        <input name="pointsPercent" type="number" step="0.01" defaultValue={initial?.pointsPercent ?? 0} className="border px-2 py-1 w-full" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-button">
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href="/rewards" className="px-4 py-1 text-sm">Back</Link>
      </div>
    </form>
  );
}