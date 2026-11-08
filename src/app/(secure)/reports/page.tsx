import { requirePermission } from "@/lib/auth/with-permission";
import { REPORTS } from "@/lib/reports/registry";
import Link from "next/link";

export default async function ReportsIndexPage() {
  await requirePermission("reports");
  return (
    <div className="p-4">
      <h1 className="text-xl mb-3">Reports</h1>
      <ul className="space-y-1">
        {REPORTS.filter((r) => !r.key.endsWith("_graphical")).map((r) => (
          <li key={r.key}>
            <Link href={`/reports/${r.key}`} className="text-blue-600">{r.title}</Link>
            <span className="text-xs text-gray-500 ml-2">[{r.permission}]</span>
          </li>
        ))}
      </ul>
    </div>
  );
}