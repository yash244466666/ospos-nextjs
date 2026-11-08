"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteGiftcardAction } from "@/app/(secure)/giftcards/actions";

interface Row { giftcardId: number; giftcardNumber: string | null; value: string; personId: number | null; }

export default function GiftcardsTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No giftcards.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Number</th>
          <th className="p-2 text-right">Value</th>
          <th className="p-2 text-left">Customer</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.giftcardId} className="border-t">
            <td className="p-2 font-mono">{r.giftcardNumber ?? ""}</td>
            <td className="p-2 text-right">{Number(r.value).toFixed(2)}</td>
            <td className="p-2">{r.personId ?? ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/giftcards/new/${r.giftcardId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteGiftcardAction(r.giftcardId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}