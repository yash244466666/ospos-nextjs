import { requirePermission } from "@/lib/auth/with-permission";
import { getInfo as getReward } from "@/lib/rewards/repository";
import RewardsForm from "@/components/rewards/rewards-form";

export default async function RewardEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("config");
  const { id } = await params;
  const rewardId = parseInt(id, 10);
  const row = rewardId > 0 ? await getReward(rewardId) : null;
  return <RewardsForm initial={row} />;
}