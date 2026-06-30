"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/with-permission";
import { getDbSync } from "@/lib/db";
import { rewards } from "@/db/schema";

export async function saveRewardAction(formData: FormData) {
  await requirePermission("config");
  const db = getDbSync();
  const id = parseInt((formData.get("rewardId") as string) || "0", 10);
  const name = ((formData.get("name") as string) || "").trim();
  const pointsPercent = parseFloat((formData.get("pointsPercent") as string) || "0") || 0;
  if (!name) throw new Error("Name required");
  let outId: number;
  if (id > 0) {
    db.update(rewards).set({ name, pointsPercent }).where(eq(rewards.rewardId, id)).run();
    outId = id;
  } else {
    outId = db.insert(rewards).values({ name, pointsPercent, deleted: false }).returning({ id: rewards.rewardId }).get().id;
  }
  revalidatePath("/rewards");
  redirect("/rewards");
}

export async function deleteRewardAction(rewardId: number) {
  await requirePermission("config");
  const db = getDbSync();
  db.update(rewards).set({ deleted: true }).where(eq(rewards.rewardId, rewardId)).run();
  revalidatePath("/rewards");
  redirect("/rewards");
}
import { getAll as listAll, getInfo as info, getPointsPercent } from "@/lib/rewards/repository";
export async function getRewardRowAction(id: number) { await requirePermission("rewards"); return info(id); }
export async function getRewardPointsPercentAction(id: number) { await requirePermission("rewards"); return getPointsPercent(id); }
export { listAll };
