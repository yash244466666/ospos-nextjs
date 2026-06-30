import { requirePermission } from "@/lib/auth/with-permission";
import { getReport, runReport } from "@/lib/reports/registry";
import ReportView from "@/components/reports/report-view";
import { notFound } from "next/navigation";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { key } = await params;
  const def = getReport(key);
  if (!def) notFound();
  // Split "reports_sales" → module="reports", sub="sales"
  const subperm = def.permission.startsWith("reports_") ? def.permission.slice("reports_".length) : undefined;
  await requirePermission("reports", subperm);
  const filters = await searchParams;
  const rows = runReport(def, { start: filters.start, end: filters.end });
  const serializableDef = {
    key: def.key,
    title: def.title,
    permission: def.permission,
    hasDateRange: def.hasDateRange,
    columns: def.columns,
    chart: def.chart,
  };
  return <ReportView def={serializableDef} rows={rows} initialStart={filters.start ?? ""} initialEnd={filters.end ?? ""} />;
}