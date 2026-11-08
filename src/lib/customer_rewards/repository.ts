import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, customerPackages } from "@/db/schema";

export interface CustomerRewardRow {
  customerId: number;
  rewardId: number;
}

/**
 * Customer reward assignment repository. Upstream stores the assigned reward
 * package on `customers.package_id` (the old Next.js port used a separate
 * `customer_rewards` join table); `person_id` maps onto `customerId` and
 * `package_id` onto `rewardId` so existing callers keep compiling.
 */
export async function getAll(): Promise<CustomerRewardRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ customerId: customers.personId, rewardId: customers.packageId })
    .from(customers)
    .where(isNotNull(customers.packageId));
  return rows.map((r) => ({ customerId: r.customerId, rewardId: Number(r.rewardId) }));
}

export async function exists(customerId: number, rewardId: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ customerId: customers.personId })
    .from(customers)
    .where(and(eq(customers.personId, customerId), eq(customers.packageId, rewardId)))
    .limit(1);
  return rows.length > 0;
}

export async function existsForCustomer(customerId: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ customerId: customers.personId })
    .from(customers)
    .where(and(eq(customers.personId, customerId), isNotNull(customers.packageId)))
    .limit(1);
  return rows.length > 0;
}

export async function saveValue(input: {
  customerId: number;
  rewardId: number;
}): Promise<void> {
  const db = await getDb();
  await db
    .update(customers)
    .set({ packageId: input.rewardId })
    .where(eq(customers.personId, input.customerId));
}

export async function getName(customerId: number): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ name: customerPackages.packageName })
    .from(customers)
    .innerJoin(customerPackages, eq(customerPackages.packageId, customers.packageId))
    .where(eq(customers.personId, customerId))
    .limit(1);
  return rows[0]?.name ?? null;
}

export async function getPointsPercent(customerId: number): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ pointsPercent: customerPackages.pointsPercent })
    .from(customers)
    .innerJoin(customerPackages, eq(customerPackages.packageId, customers.packageId))
    .where(eq(customers.personId, customerId))
    .limit(1);
  return rows[0]?.pointsPercent ?? 0;
}

export async function deleteForCustomer(customerId: number): Promise<void> {
  const db = await getDb();
  await db
    .update(customers)
    .set({ packageId: null })
    .where(eq(customers.personId, customerId));
}

export async function getForCustomer(customerId: number): Promise<CustomerRewardRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ customerId: customers.personId, rewardId: customers.packageId })
    .from(customers)
    .where(and(eq(customers.personId, customerId), isNotNull(customers.packageId)));
  return rows.map((r) => ({ customerId: r.customerId, rewardId: Number(r.rewardId) }));
}
