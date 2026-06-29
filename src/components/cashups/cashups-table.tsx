"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteCashupAction } from "@/app/(secure)/cashups/actions";

interface Row {
  cashupId: number;
  openDate: number | null;
  closeDate: number | null;
  openAmountCash: number;
  transferAmountCash: number;
  closedAmountCash: number;
  employeeId: number | null;
}

function fmtDate(ts: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

export default function CashupsTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No cashups.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Open Date</th>
          <th className="p-2 text-left">Close Date</th>
          <th className="p-2 text-right">Open Cash</th>
          <th className="p-2 text-right">Transfer</th>
          <th className="p-2 text-right">Closed Cash</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cashupId} className="border-t">
            <td className="p-2">{fmtDate(r.openDate)}</td>
            <td className="p-2">{fmtDate(r.closeDate)}</td>
            <td className="p-2 text-right">{r.openAmountCash.toFixed(2)}</td>
            <td className="p-2 text-right">{r.transferAmountCash.toFixed(2)}</td>
            <td className="p-2 text-right">{r.closedAmountCash.toFixed(2)}</td>
            <td className="p-2 space-x-2">
              <Link href={`/cashups/new/${r.cashupId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteCashupAction(r.cashupId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}