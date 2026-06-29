"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import {
  addItem, editItem, deleteItem, selectSupplier, removeSupplier,
  setComment, setInvoiceNumber, setReference, setLocation, changeMode,
  returnEntireReceiving, copyEntireReceiving, addItemKit, clearAllReceiving,
  isValidReceipt,
} from "@/lib/receiving/receiving-lib";
import { completeReceiving, getReceivings, getReceiving, searchReceivings, cancelReceiving } from "@/lib/receiving/receiving-model";
import { getReceivingCart, clearReceivingCart } from "@/lib/receiving/receiving-store";
import { getStockSearchSuggestions, suggestItems } from "@/lib/items/repository";

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

export async function searchReceivingsAction(filters: any) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return searchReceivings(filters);
}

export async function getReceivingRowAction(receivingId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getReceiving(receivingId);
}

export async function itemSearchAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return suggestItems(term, { limit: 10 });
}

export async function stockItemSearchAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  return getStockSearchSuggestions(term, 10);
}

export async function addItemKitAction(itemKitId: number, itemLocation: number, discount: number, discountType: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getReceivingCart();
  await addItemKit(cart, itemKitId, itemLocation, discount, discountType);
  revalidatePath("/receivings/register");
}

export async function returnEntireReceivingAction(receiptInput: string) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getReceivingCart();
  await returnEntireReceiving(cart, receiptInput);
  revalidatePath("/receivings/register");
}

export async function copyEntireReceivingAction(receivingId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getReceivingCart();
  await copyEntireReceiving(cart, receivingId);
  revalidatePath("/receivings/register");
}

export async function cancelReceivingAction(receivingId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  cancelReceiving(receivingId, session.user.personId as number);
  revalidatePath("/receivings");
}

export { isValidReceipt, getReceivings };