"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import { changePassword } from "@/lib/employees/repository";
import { hashPassword } from "@/lib/auth/password";
import { auth } from "@/lib/auth/options";

export async function changePasswordAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not logged in");
  const newPass = (formData.get("new_password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";
  if (newPass.length < 4) throw new Error("Password too short");
  if (newPass !== confirm) throw new Error("Passwords do not match");
  const employeeId = parseInt(String(session.user.id), 10);
  const hashed = await hashPassword(newPass);
  changePassword(employeeId, hashed, 2);
  revalidatePath("/home");
  redirect("/home?changed=1");
}

export async function getHomeStatsAction(): Promise<{ salesToday: number; itemsInStock: number; suspendedSales: number; }> {
  await requirePermission("home");
  return { salesToday: 0, itemsInStock: 0, suspendedSales: 0 };
}
