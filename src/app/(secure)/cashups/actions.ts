"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/with-permission";
import { auth } from "@/lib/auth/options";
import { calculateTotal, deleteCashup, saveCashup, search as searchCashups, getInfo as getCashupInfo, getTotalRows, getEmptyRow } from "@/lib/cashups/repository";

function toDbTimestamp(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized.slice(0, 19);
}

export async function saveCashupAction(formData: FormData) {
  await requirePermission("cashups");
  const session = await auth();
  if (!session?.user?.personId) throw new Error("not authenticated");
  const cashupId = parseInt((formData.get("cashupId") as string) || "0", 10);
  const openDate = toDbTimestamp(formData.get("openDate") as string);
  const closeDate = toDbTimestamp(formData.get("closeDate") as string);
  const openAmountCash = parseFloat((formData.get("openAmountCash") as string) || "0") || 0;
  const transferAmountCash = parseFloat((formData.get("transferAmountCash") as string) || "0") || 0;
  const closedAmountCash = parseFloat((formData.get("closedAmountCash") as string) || "0") || 0;
  const closedAmountDue = parseFloat((formData.get("closedAmountDue") as string) || "0") || 0;
  const closedAmountCard = parseFloat((formData.get("closedAmountCard") as string) || "0") || 0;
  const closedAmountCheck = parseFloat((formData.get("closedAmountCheck") as string) || "0") || 0;
  const description = (formData.get("description") as string) || "";
  const note = formData.get("note") === "on";
  const employeeId = session.user.personId;
  const existing = cashupId > 0 ? await getCashupInfo(cashupId) : null;
  const closedAmountTotal = calculateTotal(
    openAmountCash,
    transferAmountCash,
    closedAmountCash,
    closedAmountDue,
    closedAmountCard,
    closedAmountCheck,
  );

  await saveCashup({
    cashupId,
    openDate,
    closeDate,
    openAmountCash: String(openAmountCash),
    transferAmountCash: String(transferAmountCash),
    closedAmountCash: String(closedAmountCash),
    closedAmountCard: String(closedAmountCard),
    closedAmountCheck: String(closedAmountCheck),
    closedAmountTotal,
    closedAmountDue: String(closedAmountDue),
    description,
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