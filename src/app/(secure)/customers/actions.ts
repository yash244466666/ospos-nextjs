"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import {
  saveCustomer, deleteCustomer, searchCustomers, getCustomer,
  emailExists, accountNumberExists, suggestCustomers,
} from "@/lib/persons/repository";
import { hash } from "bcryptjs";

export async function saveCustomerAction(formData: FormData) {
  await requirePermission("customers");
  const personIdRaw = formData.get("personId");
  const personId = personIdRaw ? parseInt(personIdRaw as string, 10) : null;
  const firstName = (formData.get("firstName") as string)?.trim();
  if (!firstName) throw new Error("First name required");
  const email = (formData.get("email") as string)?.trim().toLowerCase() || null;
  if (email && emailExists(email, personId)) {
    throw new Error("Email already exists");
  }
  const accountNumber = (formData.get("accountNumber") as string)?.trim() || null;
  if (accountNumber && accountNumberExists(accountNumber, personId)) {
    throw new Error("Account number already exists");
  }
  const id = saveCustomer(personId, {
    firstName,
    lastName: (formData.get("lastName") as string)?.trim() || null,
    gender: parseInt((formData.get("gender") as string) || "0", 10) || 0,
    email,
    phoneNumber: (formData.get("phoneNumber") as string) || null,
    address1: (formData.get("address1") as string) || null,
    address2: (formData.get("address2") as string) || null,
    city: (formData.get("city") as string) || null,
    state: (formData.get("state") as string) || null,
    zip: (formData.get("zip") as string) || null,
    country: (formData.get("country") as string) || null,
    comments: (formData.get("comments") as string) || null,
  }, {
    companyName: (formData.get("companyName") as string) || null,
    accountNumber,
    taxable: formData.get("taxable") === "on",
    discount: parseFloat((formData.get("discount") as string) || "0") || 0,
    discountType: parseInt((formData.get("discountType") as string) || "0", 10) || 0,
    points: parseInt((formData.get("points") as string) || "0", 10) || 0,
  });
  revalidatePath("/customers");
  redirect(`/customers/new/${id}`);
}

export async function deleteCustomerAction(personId: number) {
  await requirePermission("customers");
  deleteCustomer(personId);
  revalidatePath("/customers");
}

export async function searchCustomersAction(search: string) {
  await requirePermission("customers");
  return searchCustomers(search);
}

export async function getCustomerRowAction(personId: number) {
  await requirePermission("customers");
  return getCustomer(personId);
}

export async function suggestCustomersAction(term: string) {
  await requirePermission("customers");
  return suggestCustomers(term, 10);
}

export async function checkEmailAction(email: string, excludeId: number | null) {
  await requirePermission("customers");
  return emailExists(email, excludeId);
}

export async function checkAccountNumberAction(accountNumber: string, excludeId: number | null) {
  await requirePermission("customers");
  return accountNumberExists(accountNumber, excludeId);
}

export { getCustomer };