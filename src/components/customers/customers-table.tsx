"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteCustomerAction } from "@/app/(secure)/customers/actions";

interface Row {
  personId: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  companyName: string | null;
  accountNumber: string | null;
  discount: number;
  discountType: number;
  taxable: boolean;
  points: number;
}

export default function CustomersTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No customers.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Name</th>
          <th className="p-2 text-left">Company</th>
          <th className="p-2 text-left">Email</th>
          <th className="p-2 text-left">Phone</th>
          <th className="p-2 text-left">Account #</th>
          <th className="p-2 text-right">Discount</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.personId} className="border-t">
            <td className="p-2">{r.firstName} {r.lastName ?? ""}</td>
            <td className="p-2">{r.companyName ?? ""}</td>
            <td className="p-2">{r.email ?? ""}</td>
            <td className="p-2">{r.phoneNumber ?? ""}</td>
            <td className="p-2">{r.accountNumber ?? ""}</td>
            <td className="p-2 text-right">{r.discount}{r.discountType === 0 ? "%" : ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/customers/new/${r.personId}`} className="text-blue-600">Edit</Link>
              <button
                className="text-red-600 disabled:opacity-50"
                disabled={pending}
                onClick={() => { if (confirm(`Delete ${r.firstName}?`)) start(() => deleteCustomerAction(r.personId)); }}
              >Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}