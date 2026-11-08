import { requireGrant } from "@/lib/auth/with-permission";
import { getReport, runReport } from "@/lib/reports/registry";
import ReportView from "@/components/reports/report-view";
import { notFound } from "next/navigation";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { key } = await params;
  const def = getReport(key);
  if (!def) notFound();
  await requireGrant(def.permission);
  const filters = await searchParams;
  const rows = await runReport(def, {
    start: filters.start,
    end: filters.end,
    saleType: filters.sale_type ?? filters.saleType,
    locationId: filters.location_id ?? filters.locationId,
    itemCount: filters.item_count ?? filters.itemCount,
    discountType: filters.discount_type ?? filters.discountType,
    discount: filters.discount,
    customerId: filters.customer_id ?? filters.customerId,
    employeeId: filters.employee_id ?? filters.employeeId,
    supplierId: filters.supplier_id ?? filters.supplierId,
    receivingType: filters.receiving_type ?? filters.receivingType,
  });
  const serializableDef = {
    key: def.key,
    title: def.title,
    permission: def.permission,
    hasDateRange: def.hasDateRange,
    columns: def.columns,
    chart: def.chart,
    summary: def.summary && rows.length > 0 ? def.summary(rows) : undefined,
  };
  return <ReportView def={serializableDef} rows={rows} initialStart={filters.start ?? ""} initialEnd={filters.end ?? ""} />;
}