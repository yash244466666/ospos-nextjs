"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteCategoryAction } from "@/app/(secure)/expenses_categories/actions";

interface Row { expenseCategoryId: number; category: string; description: string | null; }

export default function CategoriesTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No categories.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr><th className="p-2 text-left">Category</th><th className="p-2 text-left">Description</th><th className="p-2"></th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.expenseCategoryId} className="border-t">
            <td className="p-2">{r.category}</td>
            <td className="p-2">{r.description ?? ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/expenses_categories/new/${r.expenseCategoryId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteCategoryAction(r.expenseCategoryId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}