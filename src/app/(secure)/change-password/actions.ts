"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import { changePassword } from "@/lib/employees/repository";
import { checkPassword } from "@/lib/auth/password";
import { hashPassword } from "@/lib/auth/password";
import { lang } from "@/lib/i18n/lang";

export async function changePasswordAction(formData: FormData) {
  if (process.env.DISALLOW_PASSWORD_CHANGE === "true") {
    throw new Error(lang("Employees.password_change_disabled"));
  }
  const session = await auth();
  if (!session?.user?.personId) throw new Error(lang("Error.not_logged_in"));
  const personId = session.user.personId;

  const current = (formData.get("current_password") as string) ?? "";
  const newPass = (formData.get("new_password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";
  if (!current) throw new Error(lang("Employees.current_password_invalid"));
  if (newPass.length < 8) throw new Error(lang("Employees.password_minlength"));
  if (newPass !== confirm) throw new Error(lang("Employees.password_must_match"));
  if (newPass === current) throw new Error(lang("Employees.password_new_not_same"));

  const username = session.user.name ?? "";
  if (!username || !(await checkPassword(username, current))) {
    throw new Error(lang("Employees.current_password_invalid"));
  }

  await changePassword(personId, await hashPassword(newPass), 2);
  revalidatePath("/change-password");
  redirect("/home?changed=1");
}
