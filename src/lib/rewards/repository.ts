import { eq } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { rewards } from "@/db/schema";

export interface RewardRow {
  rewardId: number;
  name: string;
  pointsPercent: number;
  deleted: boolean;
}

export function getAll(): RewardRow[] {
  return getDbSync().select().from(rewards)
    .where(eq(rewards.deleted, false))
    .all() as RewardRow[];
}

export function getInfo(rewardId: number): RewardRow | null {
  return (getDbSync().select().from(rewards)
    .where(eq(rewards.rewardId, rewardId)).get() as RewardRow) ?? null;
}

export function getName(rewardId: number): string | null {
  return getInfo(rewardId)?.name ?? null;
}

export function getPointsPercent(rewardId: number): number {
  return getInfo(rewardId)?.pointsPercent ?? 0;
}

export function getEmptyRow(): RewardRow {
  return { rewardId: 0, name: "", pointsPercent: 0, deleted: false };
}

export function saveValue(input: RewardRow): number {
  const db = getDbSync();
  return db.transaction((tx) => {
    if (input.rewardId) {
      tx.update(rewards).set({ name: input.name, pointsPercent: input.pointsPercent })
        .where(eq(rewards.rewardId, input.rewardId)).run();
      return input.rewardId;
    }
    return tx.insert(rewards).values({ name: input.name, pointsPercent: input.pointsPercent, deleted: false })
      .returning({ id: rewards.rewardId }).get().id;
  });
}

export function deleteReward(rewardId: number): void {
  getDbSync().update(rewards).set({ deleted: true })
    .where(eq(rewards.rewardId, rewardId)).run();
}
