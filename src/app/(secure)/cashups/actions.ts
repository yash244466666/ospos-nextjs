"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import { deleteCashup, saveCashup, search as searchCashups, getInfo as getCashupInfo, getTotalRows, getEmptyRow } from "@/lib/cashups/repository";

function toDbTimestamp(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized.slice(0, 19);
}

export async function saveCashupAction(formData: FormData) {
  await requirePermission("cashups");
  const cashupId = parseInt((formData.get("cashupId") as string) || "0", 10);
  const openDate = toDbTimestamp(formData.get("openDate") as string);
  const closeDate = toDbTimestamp(formData.get("closeDate") as string);
  const openAmountCash = parseFloat((formData.get("openAmountCash") as string) || "0") || 0;
  const transferAmountCash = parseFloat((formData.get("transferAmountCash") as string) || "0") || 0;
  const closedAmountCash = parseFloat((formData.get("closedAmountCash") as string) || "0") || 0;
  const note = formData.get("note") === "on";
  const employeeId = parseInt((formData.get("employeeId") as string) || "0", 10) || null;
  const existing = cashupId > 0 ? await getCashupInfo(cashupId) : null;

  await saveCashup({
    cashupId,
    openDate,
    closeDate,
    openAmountCash: String(openAmountCash),
    transferAmountCash: String(transferAmountCash),
    closedAmountCash: String(closedAmountCash),
    closedAmountCard: existing?.closedAmountCard ?? "0",
    closedAmountCheck: existing?.closedAmountCheck ?? "0",
    closedAmountTotal: existing?.closedAmountTotal ?? "0",
    closedAmountDue: existing?.closedAmountDue ?? "0",
    description: existing?.description ?? "",
    note,
    employeeId,
  });
  revalidatePath("/cashups");
  redirect("/cashups");
}

export async function deleteCashupAction(cashupId: number) {
  await requirePermission("cashups");
  await deleteCashup(cashupId);
  revalidatePath("/cashups");
  redirect("/cashups");
}

export async function searchCashupsAction(filters: Parameters<typeof searchCashups>[0]) {
  await requirePermission("cashups");
  return searchCashups(filters);
}

export async function getCashupRowAction(cashupId: number) {
  await requirePermission("cashups");
  return getCashupInfo(cashupId);
}

export async function getCashupTotalRowsAction() {
  return getTotalRows();
}

export { getEmptyRow };