"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteTaxCodeAction } from "@/app/(secure)/tax_codes/actions";

interface Row { taxCodeId: number; taxCode: string; taxCodeName: string; city: string | null; state: string | null; }

export default function TaxCodeTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No tax codes.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100"><tr>
        <th className="p-2 text-left">Code</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">City</th><th className="p-2 text-left">State</th><th className="p-2"></th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.taxCodeId} className="border-t">
            <td className="p-2 font-mono">{r.taxCode}</td>
            <td className="p-2">{r.taxCodeName}</td>
            <td className="p-2 text-gray-600">{r.city ?? ""}</td>
            <td className="p-2 text-gray-600">{r.state ?? ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/tax_codes/new/${r.taxCodeId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteTaxCodeAction(r.taxCodeId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}