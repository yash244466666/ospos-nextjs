"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteExpenseAction } from "@/app/(secure)/expenses/actions";
import { formatDb } from "@/lib/datetime";

interface Row {
  expenseId: number;
  date: string | null;
  amount: string;
  paymentType: string;
  expenseCategoryId: number | null;
  description: string | null;
}

export default function ExpensesTable({ rows, categories }: { rows: Row[]; categories: { expenseCategoryId: number; category: string }[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No expenses.</div>;
  const catName = (id: number | null) => categories.find((c) => c.expenseCategoryId === id)?.category ?? "";
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Date</th>
          <th className="p-2 text-left">Category</th>
          <th className="p-2 text-right">Amount</th>
          <th className="p-2 text-left">Payment</th>
          <th className="p-2 text-left">Description</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.expenseId} className="border-t">
            <td className="p-2">{r.date ? formatDb(r.date, "Y-m-d") : ""}</td>
            <td className="p-2">{catName(r.expenseCategoryId)}</td>
            <td className="p-2 text-right">{Number(r.amount).toFixed(2)}</td>
            <td className="p-2">{r.paymentType}</td>
            <td className="p-2">{r.description ?? ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/expenses/new/${r.expenseId}`} className="text-blue-600">Edit</Link>
              <button className="text-red-600 disabled:opacity-50" disabled={pending}
                onClick={() => { if (confirm("Delete?")) start(() => deleteExpenseAction(r.expenseId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}