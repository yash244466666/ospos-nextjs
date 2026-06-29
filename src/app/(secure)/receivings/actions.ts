"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import {
  addItem, editItem, deleteItem, selectSupplier, removeSupplier,
  setComment, setInvoiceNumber, setReference, setLocation, changeMode,
} from "@/lib/receiving/receiving-lib";
import { completeReceiving } from "@/lib/receiving/receiving-model";
import { getReceivingCart, clearReceivingCart } from "@/lib/receiving/receiving-store";

export async function getReceivingCartAction() {
  const session = await auth();
  if (!session?.user?.personId) return null;
  return getReceivingCart();
}

export async function addItemAction(itemInput: string, quantity = 1) {
  await addItem(itemInput, quantity);
  revalidatePath("/receivings/register");
}

export async function editItemAction(line: number, edits: Record<string, unknown>) {
  await editItem(line, edits);
  revalidatePath("/receivings/register");
}

export async function deleteItemAction(line: number) {
  await deleteItem(line);
  revalidatePath("/receivings/register");
}

export async function selectSupplierAction(supplierId: number) {
  await selectSupplier(supplierId);
  revalidatePath("/receivings/register");
}

export async function removeSupplierAction() {
  await removeSupplier();
  revalidatePath("/receivings/register");
}

export async function setCommentAction(comment: string) {
  await setComment(comment);
  revalidatePath("/receivings/register");
}

export async function setInvoiceNumberAction(num: string) {
  await setInvoiceNumber(num);
  revalidatePath("/receivings/register");
}

export async function setReferenceAction(ref: string) {
  await setReference(ref);
  revalidatePath("/receivings/register");
}

export async function setLocationAction(locationId: number) {
  await setLocation(locationId);
  revalidatePath("/receivings/register");
}

export async function changeModeAction(mode: "receive" | "return") {
  await changeMode(mode);
  revalidatePath("/receivings/register");
}

export async function completeReceivingAction(paymentType: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getReceivingCart();
  if (cart.cart.length === 0) throw new Error("Cart is empty");
  const result = await completeReceiving({ cart, employeeId: session.user.personId as number, paymentType });
  await clearReceivingCart();
  redirect(`/receivings/receipt/${result.receivingId}`);
}