import { requirePermission } from "@/lib/auth/with-permission";
import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { rewards } from "@/db/schema";
import RewardsForm from "@/components/rewards/rewards-form";

export default async function RewardEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("config");
  const { id } = await params;
  const rewardId = parseInt(id, 10);
  const db = getDbSync();
  const row = rewardId > 0 ? (db.select().from(rewards).where(eq(rewards.rewardId, rewardId)).get() ?? null) : null;
  return <RewardsForm initial={row} />;
}