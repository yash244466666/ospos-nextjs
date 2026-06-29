"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteTaxCategoryAction } from "@/app/(secure)/tax_categories/actions";

interface Row { taxCategoryId: number; taxCategory: string; taxGroupSeq: string | null; }

export default function TaxCategoryTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No tax categories.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100"><tr>
        <th className="p-2 text-left">Category</th><th className="p-2 text-left">Group Seq</th><th className="p-2"></th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.taxCategoryId} className="border-t">
            <td className="p-2">{r.taxCategory}</td>
            <td className="p-2 text-gray-600">{r.taxGroupSeq ?? ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/tax_categories/new/${r.taxCategoryId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteTaxCategoryAction(r.taxCategoryId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}