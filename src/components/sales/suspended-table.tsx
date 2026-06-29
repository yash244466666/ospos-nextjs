"use client";

import { useTransition } from "react";
import { unsuspendAction, cancelSaleAction } from "@/app/(secure)/sales/actions";

interface Props {
  sales: {
    saleId: number;
    saleTime: number | null;
    customerId: number | null;
    comment: string | null;
    saleType: number;
    dinnerTableId: number | null;
    invoiceNumber: string | null;
    quoteNumber: string | null;
    workOrderNumber: string | null;
  }[];
}

const SALE_TYPE_LABEL: Record<number, string> = {
  0: "POS", 1: "Invoice", 2: "Work Order", 3: "Quote", 4: "Return",
};

export default function SuspendedTable({ sales }: Props) {
  const [pending, start] = useTransition();
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
            <td className="p-2">{s.saleTime ? new Date(s.saleTime * 1000).toLocaleString() : ""}</td>
            <td className="p-2">{SALE_TYPE_LABEL[s.saleType] ?? s.saleType}</td>
            <td className="p-2">{s.invoiceNumber ?? s.quoteNumber ?? s.workOrderNumber ?? ""}</td>
            <td className="p-2">{s.comment ?? ""}</td>
            <td className="p-2 space-x-2">
              <button
                className="text-blue-600 disabled:opacity-50"
                disabled={pending}
                onClick={() => start(() => unsuspendAction(s.saleId))}
              >Unsuspend</button>
              <button
                className="text-red-600 disabled:opacity-50"
                disabled={pending}
                onClick={() => start(() => cancelSaleAction(s.saleId))}
              >Cancel</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}