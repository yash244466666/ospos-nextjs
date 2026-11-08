"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import {
  deleteReward,
  getAll as listAll,
  getInfo as info,
  getPointsPercent,
  saveValue,
} from "@/lib/rewards/repository";

export async function saveRewardAction(formData: FormData) {
  await requirePermission("config");
  const id = parseInt((formData.get("rewardId") as string) || "0", 10);
  const name = ((formData.get("name") as string) || "").trim();
  const pointsPercent = parseFloat((formData.get("pointsPercent") as string) || "0") || 0;
  if (!name) throw new Error("Name required");
  await saveValue({ rewardId: id, name, pointsPercent, deleted: false });
  revalidatePath("/rewards");
  redirect("/rewards");
}

export async function deleteRewardAction(rewardId: number) {
  await requirePermission("config");
  await deleteReward(rewardId);
  revalidatePath("/rewards");
  redirect("/rewards");
}
export async function getRewardRowAction(id: number) { await requirePermission("rewards"); return info(id); }
export async function getRewardPointsPercentAction(id: number) { await requirePermission("rewards"); return getPointsPercent(id); }
export { listAll };
