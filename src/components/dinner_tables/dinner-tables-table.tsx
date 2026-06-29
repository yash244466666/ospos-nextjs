"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteDinnerTableAction } from "@/app/(secure)/dinner_tables/actions";

interface Row { dinnerTableId: number; name: string; status: number; }

export default function DinnerTablesTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No dinner tables.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100"><tr>
        <th className="p-2 text-left">Name</th><th className="p-2 text-left">Status</th><th className="p-2"></th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.dinnerTableId} className="border-t">
            <td className="p-2">{r.name}</td>
            <td className="p-2 text-gray-600">{r.status === 0 ? "Available" : "Occupied"}</td>
            <td className="p-2 space-x-2">
              <Link href={`/dinner_tables/new/${r.dinnerTableId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteDinnerTableAction(r.dinnerTableId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}