import { requirePermission } from "@/lib/auth/with-permission";
import { getAll as listRewards } from "@/lib/rewards/repository";
import RewardsTable from "@/components/rewards/rewards-table";
import Link from "next/link";

export default async function RewardsPage() {
  await requirePermission("config");
  const rows = await listRewards();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Customer Rewards</h1>
        <Link href="/rewards/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm" data-testid="new-button">New</Link>
      </div>
      <div data-testid="data-table">
        <RewardsTable rows={rows} />
      </div>
    </div>
  );
}