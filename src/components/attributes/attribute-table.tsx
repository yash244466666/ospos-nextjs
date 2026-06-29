"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteAttributeAction } from "@/app/(secure)/attributes/actions";
import type { DefinitionRow } from "@/lib/attributes/repository";

function flagLabels(flags: number): string {
  const out: string[] = [];
  if (flags & 1) out.push("Items");
  if (flags & 2) out.push("Sales");
  if (flags & 4) out.push("Receivings");
  return out.join(", ");
}

export default function AttributeTable({ rows }: { rows: DefinitionRow[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No attribute definitions.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Name</th>
          <th className="p-2 text-left">Type</th>
          <th className="p-2 text-left">Unit</th>
          <th className="p-2 text-left">Visible In</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.definitionId} className="border-t">
            <td className="p-2">{r.definitionName}</td>
            <td className="p-2">{r.definitionType}</td>
            <td className="p-2 text-gray-600">{r.definitionUnit ?? ""}</td>
            <td className="p-2 text-gray-600">{flagLabels(r.definitionFlags)}</td>
            <td className="p-2 space-x-2">
              <Link href={`/attributes/new/${r.definitionId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteAttributeAction(r.definitionId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}