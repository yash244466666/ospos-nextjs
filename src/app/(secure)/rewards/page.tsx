import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { rewards } from "@/db/schema";
import RewardsTable from "@/components/rewards/rewards-table";
import Link from "next/link";

export default async function RewardsPage() {
  await requirePermission("config");
  const db = getDbSync();
  const rows = db.select().from(rewards).where(eq(rewards.deleted, false)).all();
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl">Customer Rewards</h1>
        <Link href="/rewards/new/0" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">New</Link>
      </div>
      <RewardsTable rows={rows} />
    </div>
  );
}