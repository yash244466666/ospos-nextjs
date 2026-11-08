"use client";

import { useTransition } from "react";
import { unsuspendAction, discardSuspendedSaleAction } from "@/app/(secure)/sales/actions";

interface Props {
  sales: {
    saleId: number;
    docId: string;
    saleTime: string;
    customerId: number | null;
    comment: string;
    dinnerTableId: number | null;
  }[];
}

export default function SuspendedTable({ sales }: Props) {
  const [pending, start] = useTransition();
  const run = (task: () => Promise<unknown>) => {
    start(() => {
      void task();
    });
  };
  if (sales.length === 0) return <div className="text-gray-500">No suspended sales.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Date</th>
          <th className="p-2 text-left">Type</th>
          <th className="p-2 text-left">Invoice/Quote/WO #</th>
          <th className="p-2 text-left">Comment</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {sales.map((s) => (
          <tr key={s.saleId} className="border-t">
            <td className="p-2">{s.saleTime}</td>
            <td className="p-2">{s.docId}</td>
            <td className="p-2">{s.docId}</td>
            <td className="p-2">{s.comment ?? ""}</td>
            <td className="p-2 space-x-2">
              <button
                className="text-blue-600 disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => unsuspendAction(s.saleId))}
              >Unsuspend</button>
              <button
                className="text-red-600 disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => discardSuspendedSaleAction(s.saleId))}
              >Cancel</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}