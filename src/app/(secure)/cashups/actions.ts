"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import { deleteCashup, saveCashup } from "@/lib/cashups/repository";

export async function saveCashupAction(formData: FormData) {
  await requirePermission("cashups");
  const cashupId = parseInt((formData.get("cashupId") as string) || "0", 10);
  const openDateStr = formData.get("openDate") as string;
  const closeDateStr = formData.get("closeDate") as string;
  const openDate = openDateStr ? Math.floor(new Date(openDateStr).getTime() / 1000) : null;
  const closeDate = closeDateStr ? Math.floor(new Date(closeDateStr).getTime() / 1000) : null;
  const openAmountCash = parseFloat((formData.get("openAmountCash") as string) || "0") || 0;
  const transferAmountCash = parseFloat((formData.get("transferAmountCash") as string) || "0") || 0;
  const closedAmountCash = parseFloat((formData.get("closedAmountCash") as string) || "0") || 0;
  const note = (formData.get("note") as string) || null;
  const employeeId = parseInt((formData.get("employeeId") as string) || "0", 10) || null;

  const id = saveCashup({
    cashupId,
    openDate,
    closeDate,
    openAmountCash,
    transferAmountCash,
    closedAmountCash,
    note,
    employeeId,
  });
  revalidatePath("/cashups");
  redirect(`/cashups/new/${id}`);
}

export async function deleteCashupAction(cashupId: number) {
  await requirePermission("cashups");
  deleteCashup(cashupId);
  revalidatePath("/cashups");
}