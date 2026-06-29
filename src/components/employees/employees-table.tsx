"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteEmployeeAction } from "@/app/(secure)/employees/actions";

interface Row {
  personId: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  username: string;
  language: string | null;
  languageCode: string | null;
}

export default function EmployeesTable({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) return <div className="text-gray-500">No employees.</div>;
  return (
    <table className="w-full text-sm border">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Name</th>
          <th className="p-2 text-left">Username</th>
          <th className="p-2 text-left">Email</th>
          <th className="p-2 text-left">Language</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.personId} className="border-t">
            <td className="p-2">{r.firstName} {r.lastName ?? ""}</td>
            <td className="p-2">{r.username}</td>
            <td className="p-2">{r.email ?? ""}</td>
            <td className="p-2">{r.language ?? ""}</td>
            <td className="p-2 space-x-2">
              <Link href={`/employees/new/${r.personId}`} className="text-blue-600">Edit</Link>
              {r.personId !== 1 && (
                <button
                  className="text-red-600 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => { if (confirm(`Delete ${r.firstName}?`)) start(() => deleteEmployeeAction(r.personId)); }}
                >Delete</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}