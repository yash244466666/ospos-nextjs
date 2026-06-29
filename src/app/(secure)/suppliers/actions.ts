"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import {
  saveSupplier, deleteSupplier, searchSuppliers, getSupplier,
  accountNumberExists,
} from "@/lib/persons/repository";

export async function saveSupplierAction(formData: FormData) {
  await requirePermission("suppliers");
  const personIdRaw = formData.get("personId");
  const personId = personIdRaw ? parseInt(personIdRaw as string, 10) : null;
  const firstName = (formData.get("firstName") as string)?.trim();
  if (!firstName) throw new Error("First name required");
  const accountNumber = (formData.get("accountNumber") as string)?.trim() || null;
  if (accountNumber && accountNumberExists(accountNumber, personId)) {
    throw new Error("Account number already exists");
  }
  const id = saveSupplier(personId, {
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
    companyName: (formData.get("companyName") as string) || null,
    agencyName: (formData.get("agencyName") as string) || null,
    accountNumber,
  });
  revalidatePath("/suppliers");
  redirect(`/suppliers/new/${id}`);
}

export async function deleteSupplierAction(personId: number) {
  await requirePermission("suppliers");
  deleteSupplier(personId);
  revalidatePath("/suppliers");
}

export { searchSuppliers, getSupplier };