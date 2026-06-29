import { eq, desc } from "drizzle-orm";
import { getDbSync } from "@/lib/db";
import { customerRewards } from "@/db/schema";

export interface CustomerRewardRow {
  customerId: number;
  rewardId: number;
}

export function getAll(): CustomerRewardRow[] {
  return getDbSync().select().from(customerRewards).all() as CustomerRewardRow[];
}

export function exists(customerId: number, rewardId: number): boolean {
  const row = getDbSync().select().from(customerRewards)
    .where(eq(customerRewards.customerId, customerId)).get();
  return !!row && row.rewardId === rewardId;
}

export function existsForCustomer(customerId: number): boolean {
  const row = getDbSync().select({ c: customerRewards.customerId }).from(customerRewards)
    .where(eq(customerRewards.customerId, customerId)).get();
  return !!row;
}

export function saveValue(input: { customerId: number; rewardId: number }): void {
  getDbSync().insert(customerRewards).values({
    customerId: input.customerId, rewardId: input.rewardId,
  }).run();
}

export function getName(customerId: number): string | null {
  return null;
}

export function getPointsPercent(customerId: number): number {
  return 0;
}

export function deleteForCustomer(customerId: number): void {
  getDbSync().delete(customerRewards).where(eq(customerRewards.customerId, customerId)).run();
}

export function getForCustomer(customerId: number): CustomerRewardRow[] {
  return getDbSync().select().from(customerRewards)
    .where(eq(customerRewards.customerId, customerId))
    .all() as CustomerRewardRow[];
}

void desc;
