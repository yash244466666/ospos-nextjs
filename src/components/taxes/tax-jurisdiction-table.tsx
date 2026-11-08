"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteTaxJurisdictionAction } from "@/app/(secure)/tax_jurisdictions/actions";

interface Row {
  jurisdictionId: number; jurisdictionName: string; taxType: number; taxRate?: number; roundCode?: number; cascadeSequence: number;
}

export default function TaxJurisdictionTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No tax jurisdictions.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100"><tr>
        <th className="p-2 text-left">Name</th><th className="p-2 text-left">Tax Type</th><th className="p-2 text-right">Rate</th><th className="p-2 text-left">Round</th><th className="p-2 text-left">Cascade</th><th className="p-2"></th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.jurisdictionId} className="border-t">
            <td className="p-2">{r.jurisdictionName}</td>
            <td className="p-2">{r.taxType}</td>
            <td className="p-2 text-right">{(r.taxRate ?? 0).toFixed(4)}</td>
            <td className="p-2">{r.roundCode ?? ""}</td>
            <td className="p-2">{r.cascadeSequence}</td>
            <td className="p-2 space-x-2">
              <Link href={`/tax_jurisdictions/new/${r.jurisdictionId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteTaxJurisdictionAction(r.jurisdictionId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}