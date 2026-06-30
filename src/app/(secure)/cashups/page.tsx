import { requirePermission } from "@/lib/auth/with-permission";
import { listCashups } from "@/lib/cashups/repository";
import CashupsTable from "@/components/cashups/cashups-table";
import Link from "next/link";

export default async function CashupsPage() {
  await requirePermission("cashups");
  const rows = listCashups();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Cashups</h1>
        <Link href="/cashups/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New Cashup</Link>
      </div>
      <div data-testid="data-table">
        <CashupsTable rows={rows} />
      </div>
    </div>
  );
}