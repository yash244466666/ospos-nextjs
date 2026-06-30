"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import { auth } from "@/lib/auth/options";
import { isAdmin } from "@/lib/auth/rbac";
import { hash } from "bcryptjs";
import {
  saveEmployee, deleteEmployee, searchEmployees, getEmployee,
  usernameExists, listAllPermissions, listEmployeeGrants,
} from "@/lib/persons/repository";

export async function saveEmployeeAction(formData: FormData) {
  const session = await requirePermission("employees");
  const currentPersonId = session!.user.personId as number;
  const personIdRaw = formData.get("personId");
  const personId = personIdRaw ? parseInt(personIdRaw as string, 10) : null;

  if (personId === 1 && !isAdmin(currentPersonId as number)) {
    throw new Error("Only admin can edit the superadmin");
  }

  const firstName = (formData.get("firstName") as string)?.trim();
  if (!firstName) throw new Error("First name required");
  const username = (formData.get("username") as string)?.trim();
  if (!username) throw new Error("Username required");
  if (usernameExists(username, personId)) throw new Error("Username exists");

  const password = (formData.get("password") as string) || undefined;
  if (!personId && !password) throw new Error("Password required for new employee");
  const hashed = password ? await hash(password, 10) : undefined;

  const grantsList: { permissionId: string; menuGroup?: string | null }[] = [];
  const allPerms = listAllPermissions();
  for (const p of allPerms) {
    const v = formData.get(`grant_${p.permissionId}`);
    if (v === "on") {
      grantsList.push({ permissionId: p.permissionId });
    }
  }

  const id = saveEmployee(personId, {
    firstName,
    lastName: (formData.get("lastName") as string)?.trim() || null,
    email: (formData.get("email") as string)?.trim().toLowerCase() || null,
    phoneNumber: (formData.get("phoneNumber") as string) || null,
    address1: (formData.get("address1") as string) || null,
    address2: (formData.get("address2") as string) || null,
    city: (formData.get("city") as string) || null,
    state: (formData.get("state") as string) || null,
    zip: (formData.get("zip") as string) || null,
    country: (formData.get("country") as string) || null,
    comments: (formData.get("comments") as string) || null,
  }, {
    username,
    password: hashed,
    language: (formData.get("language") as string) || null,
    languageCode: (formData.get("languageCode") as string) || null,
    grants: grantsList,
  });
  revalidatePath("/employees");
  redirect("/employees");
}

export async function deleteEmployeeAction(personId: number) {
  const session = await requirePermission("employees");
  if (personId === 1) throw new Error("Cannot delete superadmin");
  if (personId === (session!.user.personId as number)) throw new Error("Cannot delete yourself");
  if (!isAdmin(session!.user.personId as number)) throw new Error("Admin only");
  deleteEmployee(personId);
  revalidatePath("/employees");
  redirect("/employees");
}

export async function searchEmployeesAction(term: string) {
  await requirePermission("employees");
  return searchEmployees(term);
}

export async function getEmployeeRowAction(personId: number) {
  await requirePermission("employees");
  return getEmployee(personId);
}

export async function checkUsernameAction(username: string, excludeId: number | null) {
  await requirePermission("employees");
  return usernameExists(username, excludeId);
}

export async function changePasswordAction(oldPassword: string, newPassword: string) {
  const session = await requirePermission("home");
  const { changePassword } = await import("@/lib/employees/repository");
  const { verifyPassword } = await import("@/lib/auth/password");
  const emp = getEmployee(session!.user.personId as number);
  if (!emp) throw new Error("Employee not found");
  if (!verifyPassword(oldPassword, emp.password)) throw new Error("Old password incorrect");
  const hashed = await hash(newPassword, 10);
  changePassword(session!.user.personId as number, hashed);
  return { ok: true };
}

export { searchEmployees, getEmployee, listAllPermissions, listEmployeeGrants };