"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteRewardAction } from "@/app/(secure)/rewards/actions";

interface Row { rewardId: number; name: string; pointsPercent: number; }

export default function RewardsTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No rewards.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100"><tr>
        <th className="p-2 text-left">Name</th><th className="p-2 text-right">Points %</th><th className="p-2"></th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rewardId} className="border-t">
            <td className="p-2">{r.name}</td>
            <td className="p-2 text-right">{r.pointsPercent.toFixed(2)}</td>
            <td className="p-2 space-x-2">
              <Link href={`/rewards/new/${r.rewardId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteRewardAction(r.rewardId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}