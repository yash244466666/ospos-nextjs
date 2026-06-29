"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import { changePassword } from "@/lib/employees/repository";
import { hashPassword } from "@/lib/auth/password";

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
  revalidatePath("/change-password");
  redirect("/home?changed=1");
}
