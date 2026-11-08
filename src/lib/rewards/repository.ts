import { eq } from "drizzle-orm";
import { insertReturning } from "@/lib/db/insert";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { customerPackages } from "@/db/schema";

export interface RewardRow {
  rewardId: number;
  name: string;
  pointsPercent: number;
  deleted: boolean;
}

/**
 * Rewards (customer packages) repository. Mirrors upstream
 * `Customer_rewards`, whose table is `customers_packages`; `package_id` and
 * `package_name` map onto the existing `rewardId` / `name` names.
 */
function toRewardRow(row: typeof customerPackages.$inferSelect): RewardRow {
  return {
    rewardId: row.packageId,
    name: row.packageName ?? "",
    pointsPercent: row.pointsPercent,
    deleted: row.deleted,
  };
}

export async function getAll(): Promise<RewardRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(customerPackages)
    .where(eq(customerPackages.deleted, false));
  return rows.map(toRewardRow);
}

export async function getInfo(rewardId: number): Promise<RewardRow | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(customerPackages)
    .where(eq(customerPackages.packageId, rewardId))
    .limit(1);
  return rows[0] ? toRewardRow(rows[0]) : null;
}

export async function getName(rewardId: number): Promise<string | null> {
  return (await getInfo(rewardId))?.name ?? null;
}

export async function getPointsPercent(rewardId: number): Promise<number> {
  return (await getInfo(rewardId))?.pointsPercent ?? 0;
}

export function getEmptyRow(): RewardRow {
  return { rewardId: 0, name: "", pointsPercent: 0, deleted: false };
}

export async function saveValue(input: RewardRow): Promise<number> {
  const values = {
    packageName: input.name,
    pointsPercent: input.pointsPercent,
  };
  return withTransaction(async (tx) => {
    if (input.rewardId) {
      await tx
        .update(customerPackages)
        .set(values)
        .where(eq(customerPackages.packageId, input.rewardId));
      return input.rewardId;
    }
    const inserted = await insertReturning(tx, customerPackages, { ...values, deleted: false }, customerPackages.packageId);
    const result = Array.isArray(inserted) ? inserted[0] : inserted;
    return result.id;
  });
}

export async function deleteReward(rewardId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(customerPackages)
    .set({ deleted: true })
    .where(eq(customerPackages.packageId, rewardId));
}
