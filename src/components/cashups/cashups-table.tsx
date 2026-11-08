"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteCashupAction } from "@/app/(secure)/cashups/actions";
import { formatDb } from "@/lib/datetime";

interface Row {
  cashupId: number;
  openDate: string | null;
  closeDate: string | null;
  openAmountCash: string;
  transferAmountCash: string;
  closedAmountCash: string;
  employeeId: number | null;
}

function fmtDate(ts: string | null): string {
  if (!ts) return "";
  return formatDb(ts, "Y-m-d H:i:s");
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
            <td className="p-2 text-right">{Number(r.openAmountCash).toFixed(2)}</td>
            <td className="p-2 text-right">{Number(r.transferAmountCash).toFixed(2)}</td>
            <td className="p-2 text-right">{Number(r.closedAmountCash).toFixed(2)}</td>
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