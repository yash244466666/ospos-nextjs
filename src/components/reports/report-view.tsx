"use client";

import Link from "next/link";
import { BarChart, HBarChart, LineChart, PieChart } from "./charts";

interface SerializableReportDef {
  key: string;
  title: string;
  permission: string;
  hasDateRange?: boolean;
  columns: { name: string; label: string; align?: "left" | "right" }[];
  chart?: "bar" | "hbar" | "line" | "pie";
  inputs?: string[];
  summary?: Record<string, unknown>;
}

interface Props {
  def: SerializableReportDef;
  rows: Record<string, unknown>[];
  initialStart: string;
  initialEnd: string;
  locations?: { locationId: number; locationName: string }[];
  filters?: Record<string, string | undefined>;
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

function ChartFor({ def, rows }: { def: SerializableReportDef; rows: Record<string, unknown>[] }) {
  if (!def.chart) return null;
  const labelKey = def.columns[0]?.name ?? "label";
  const valueKey = def.columns.find((c) => c.name !== labelKey)?.name ?? "value";
  const data = rows.map((r) => ({
    label: String(r[labelKey] ?? ""),
    value: Number(r[valueKey] ?? 0),
  }));
  switch (def.chart) {
    case "bar": return <BarChart data={data} />;
    case "hbar": return <HBarChart data={data} />;
    case "line": return <LineChart data={data} />;
    case "pie": return <PieChart data={data} />;
  }
  return null;
}

export default function ReportView({
  def,
  rows,
  initialStart,
  initialEnd,
  locations = [],
  filters = {},
}: Props) {
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-xl">{def.title}</h1>
        <Link href="/reports" className="text-sm text-blue-600">← Back</Link>
      </div>
      {def.hasDateRange && (
        <form className="mb-3 flex flex-wrap items-end gap-2" method="get" action={`/reports/${def.key}`} data-testid="report-filter-form">
          <div>
            <label className="block text-xs">Start</label>
            <input type="date" name="start" defaultValue={initialStart} data-testid="report-date-start" className="border px-2 py-1" />
          </div>
          <div>
            <label className="block text-xs">End</label>
            <input type="date" name="end" defaultValue={initialEnd} data-testid="report-date-end" className="border px-2 py-1" />
          </div>
          {def.inputs?.some((input) => input === "sale_type" || input === "saleType") ? (
            <div>
              <label className="block text-xs">Sale type</label>
              <select name="sale_type" defaultValue={filters.sale_type ?? "complete"} className="border px-2 py-1">
                <option value="complete">Completed Sales and Returns</option>
                <option value="sales">Completed Sales</option>
                <option value="quotes">Quotes</option>
                <option value="work_orders">Work Orders</option>
                <option value="canceled">Canceled</option>
                <option value="returns">Returns</option>
              </select>
            </div>
          ) : null}
          {def.inputs?.some((input) => input === "location_id" || input === "locationId") ? (
            <div>
              <label className="block text-xs">Location</label>
              <select name="location_id" defaultValue={filters.location_id ?? "all"} className="border px-2 py-1">
                <option value="all">All</option>
                {locations.map((location) => (
                  <option key={location.locationId} value={location.locationId}>{location.locationName}</option>
                ))}
              </select>
            </div>
          ) : null}
          {def.inputs?.includes("item_count") ? (
            <div>
              <label className="block text-xs">Item count</label>
              <select name="item_count" defaultValue={filters.item_count ?? "all"} className="border px-2 py-1">
                <option value="all">All</option>
                <option value="zero_and_less">Zero and less</option>
                <option value="more_than_zero">More than zero</option>
              </select>
            </div>
          ) : null}
          {def.inputs?.includes("discount_type") ? (
            <div>
              <label className="block text-xs">Discount type</label>
              <select name="discount_type" defaultValue={filters.discount_type ?? "0"} className="border px-2 py-1">
                <option value="0">Percent</option>
                <option value="1">Fixed</option>
              </select>
            </div>
          ) : null}
          {def.inputs?.includes("discount") ? (
            <div>
              <label className="block text-xs">Discount</label>
              <input name="discount" defaultValue={filters.discount ?? "0"} className="w-20 border px-2 py-1" />
            </div>
          ) : null}
          {def.inputs?.includes("receiving_type") ? (
            <div>
              <label className="block text-xs">Receiving type</label>
              <select name="receiving_type" defaultValue={filters.receiving_type ?? "all"} className="border px-2 py-1">
                <option value="all">All</option>
                <option value="receiving">Receivings</option>
                <option value="returns">Returns</option>
                <option value="requisitions">Requisitions</option>
              </select>
            </div>
          ) : null}
          <button type="submit"
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
            data-testid="report-apply-button"
          >Apply</button>
          <Link href={`/reports/${def.key}/export?start=${encodeURIComponent(initialStart)}&end=${encodeURIComponent(initialEnd)}`}
            className="rounded bg-gray-200 px-3 py-1 text-sm"
            data-testid="report-export-link">Export CSV</Link>
        </form>
      )}
      {def.chart && rows.length > 0 && (
        <div className="mb-4 p-3 border rounded bg-white">
          <ChartFor def={def} rows={rows} />
        </div>
      )}
      {def.summary && Object.keys(def.summary).length > 0 ? (
        <div className="mb-3 rounded border bg-white p-3 text-sm" data-testid="report-summary">
          {Object.entries(def.summary).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span>{key.replace(/_/g, " ")}</span>
              <span>{fmt(value)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="text-gray-500">No data.</div>
      ) : (
        <table className="w-full text-sm border" data-testid="report-table">
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