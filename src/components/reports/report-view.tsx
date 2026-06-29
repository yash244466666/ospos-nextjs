"use client";

import Link from "next/link";
import type { ReportDef } from "@/lib/reports/registry";

interface Props {
  def: ReportDef;
  rows: Record<string, unknown>[];
  initialStart: string;
  initialEnd: string;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(2);
  }
  if (typeof v === "string" && /^\d{10}$/.test(v)) {
    const d = new Date(parseInt(v, 10) * 1000);
    return d.toLocaleString();
  }
  return String(v);
}

export default function ReportView({ def, rows, initialStart, initialEnd }: Props) {
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl">{def.title}</h1>
        <Link href="/reports" className="text-sm text-blue-600">← Back</Link>
      </div>
      {def.hasDateRange && (
        <form className="flex gap-2 mb-3 items-end" method="get" action={`/reports/${def.key}`}>
          <div>
            <label className="block text-xs">Start</label>
            <input type="date" name="start" defaultValue={initialStart} className="border px-2 py-1" />
          </div>
          <div>
            <label className="block text-xs">End</label>
            <input type="date" name="end" defaultValue={initialEnd} className="border px-2 py-1" />
          </div>
          <button type="submit"
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
          >Apply</button>
          <Link href={`/reports/${def.key}/export?start=${encodeURIComponent(initialStart)}&end=${encodeURIComponent(initialEnd)}`}
            className="bg-gray-200 px-3 py-1 rounded text-sm">Export CSV</Link>
        </form>
      )}
      {rows.length === 0 ? (
        <div className="text-gray-500">No data.</div>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              {def.columns.map((c) => (
                <th key={c.name} className={`p-2 ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                {def.columns.map((c) => (
                  <td key={c.name} className={`p-2 ${c.align === "right" ? "text-right" : ""}`}>{fmt(r[c.name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}