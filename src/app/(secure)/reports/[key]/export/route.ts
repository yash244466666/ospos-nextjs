import { requirePermission } from "@/lib/auth/with-permission";
import { getReport, runReport } from "@/lib/reports/registry";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = getReport(key);
  if (!def) return new Response("Not found", { status: 404 });
  const subperm = def.permission.startsWith("reports_") ? def.permission.slice("reports_".length) : undefined;
  await requirePermission("reports", subperm);
  const url = new URL(req.url);
  const filters = { start: url.searchParams.get("start") ?? undefined, end: url.searchParams.get("end") ?? undefined };
  const rows = runReport(def, filters);
  const header = def.columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((r) => def.columns.map((c) => csvEscape(r[c.name])).join(",")).join("\n");
  return new Response(`${header}\n${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${def.key}.csv"`,
    },
  });
}