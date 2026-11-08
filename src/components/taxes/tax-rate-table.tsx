"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteTaxRateAction } from "@/app/(secure)/taxes/actions";

interface Row {
  taxCodeLinkId: number; taxCode: string; taxCodeName: string; taxCategory: string;
  jurisdictionName: string | null; taxRate: string; roundCode: number; cascadeSequence: number;
}

export default function TaxRateTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No tax rates. Configure tax codes, categories, and jurisdictions first.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100"><tr>
        <th className="p-2 text-left">Code</th><th className="p-2 text-left">Category</th><th className="p-2 text-left">Jurisdiction</th>
        <th className="p-2 text-right">Rate</th><th className="p-2 text-left">Round</th><th className="p-2 text-left">Cascade</th><th className="p-2"></th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.taxCodeLinkId} className="border-t">
            <td className="p-2 font-mono">{r.taxCode}</td>
            <td className="p-2">{r.taxCategory}</td>
            <td className="p-2">{r.jurisdictionName ?? ""}</td>
            <td className="p-2 text-right">{Number(r.taxRate).toFixed(4)}</td>
            <td className="p-2">{r.roundCode}</td>
            <td className="p-2">{r.cascadeSequence}</td>
            <td className="p-2 space-x-2">
              <Link href={`/taxes/new/${r.taxCodeLinkId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteTaxRateAction(r.taxCodeLinkId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}