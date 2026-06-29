"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteItemKitAction } from "@/app/(secure)/item_kits/actions";

interface Row {
  itemKitId: number;
  itemKitNumber: string | null;
  name: string;
  description: string | null;
}

export default function ItemKitTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No item kits.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Number</th>
          <th className="p-2 text-left">Name</th>
          <th className="p-2 text-left">Description</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.itemKitId} className="border-t">
            <td className="p-2 font-mono">{r.itemKitNumber ?? ""}</td>
            <td className="p-2">{r.name}</td>
            <td className="p-2 text-gray-600">{r.description ?? ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/item_kits/new/${r.itemKitId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteItemKitAction(r.itemKitId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}