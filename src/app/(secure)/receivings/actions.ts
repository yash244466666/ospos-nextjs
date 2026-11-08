"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import { requirePermission } from "@/lib/auth/with-permission";
import {
  addItem,
  addItemKit,
  clearAll,
  copyEntireReceiving,
  deleteItem,
  editItem,
  getCart,
  getStockDestination,
  getStockSource,
  removeSupplier,
  returnEntireReceiving,
  setComment,
  setMode,
  setReference,
  setStockDestination,
  setStockSource,
  setSupplier,
  getTotal,
} from "@/lib/receiving/receiving-lib";
import {
  cancelReceiving,
  completeReceiving,
  getReceiving,
  isValidReceipt,
  searchReceivings,
} from "@/lib/receiving/receiving-model";
import { getReceivingCart, saveReceivingCart, clearReceivingCart } from "@/lib/receiving/receiving-store";
import { getStockSearchSuggestions, suggestItems } from "@/lib/items/repository";

export async function getReceivingCartAction() {
  await requirePermission("receivings");
  return getReceivingCart();
}

export async function addItemAction(itemInput: string, quantity: string | number = "1") {
  await requirePermission("receivings");
  let cart = await getReceivingCart();
  const receiptId = cart.mode === "return" ? await isValidReceipt(itemInput) : null;
  if (receiptId !== null) {
    cart = await returnEntireReceiving(cart, itemInput);
  } else {
    const result = await addItem(cart, {
      itemIdOrNumber: itemInput.trim(),
      quantity,
      itemLocation: cart.stockSource,
    });
    cart = result.cart;
  }
  await saveReceivingCart(cart);
  revalidatePath("/receivings/register");
}

export async function editItemAction(
  line: number,
  edits: {
    description?: string;
    serialnumber?: string;
    quantity?: string;
    discount?: string;
    discountType?: number | null;
    price?: string;
    receivingQuantity?: string;
  },
) {
  await requirePermission("receivings");
  const cart = await getReceivingCart();
  const target = cart.cart.find((item) => item.line === line);
  if (!target) return;
  const updated = editItem(cart, line, {
    description: edits.description ?? target.description,
    serialnumber: edits.serialnumber ?? target.serialnumber,
    quantity: edits.quantity ?? target.quantity,
    discount: edits.discount ?? target.discount,
    discountType: edits.discountType ?? null,
    price: edits.price ?? target.price,
    receivingQuantity: edits.receivingQuantity ?? target.receivingQuantity,
  });
  await saveReceivingCart(updated);
  revalidatePath("/receivings/register");
}

export async function deleteItemAction(line: number) {
  await requirePermission("receivings");
  await saveReceivingCart(deleteItem(await getReceivingCart(), line));
  revalidatePath("/receivings/register");
}

export async function selectSupplierAction(supplierId: number) {
  await requirePermission("receivings");
  await saveReceivingCart(setSupplier(await getReceivingCart(), supplierId));
  revalidatePath("/receivings/register");
}

export async function removeSupplierAction() {
  await requirePermission("receivings");
  await saveReceivingCart(removeSupplier(await getReceivingCart()));
  revalidatePath("/receivings/register");
}

export async function setCommentAction(comment: string) {
  await requirePermission("receivings");
  await saveReceivingCart(setComment(await getReceivingCart(), comment));
  revalidatePath("/receivings/register");
}

export async function setReferenceAction(reference: string) {
  await requirePermission("receivings");
  await saveReceivingCart(setReference(await getReceivingCart(), reference));
  revalidatePath("/receivings/register");
}

export async function setLocationAction(locationId: number) {
  await requirePermission("receivings");
  await saveReceivingCart(setStockSource(await getReceivingCart(), locationId));
  revalidatePath("/receivings/register");
}

export async function setDestinationAction(locationId: number) {
  await requirePermission("receivings");
  await saveReceivingCart(setStockDestination(await getReceivingCart(), locationId));
  revalidatePath("/receivings/register");
}

export async function changeModeAction(mode: "receive" | "return" | "requisition") {
  await requirePermission("receivings");
  await saveReceivingCart(setMode(await getReceivingCart(), mode));
  revalidatePath("/receivings/register");
}

export async function completeReceivingAction(paymentType: string) {
  await requirePermission("receivings");
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getReceivingCart();
  if (cart.cart.length === 0) throw new Error("Cart is empty");
  const result = await completeReceiving({
    cart,
    employeeId: session.user.personId,
    paymentType,
  });
  await clearReceivingCart();
  if (result.receivingId === -1) {
    throw new Error("Receiving failed");
  }
  redirect(`/receivings/receipt/${result.receivingId}`);
}

export async function requisitionCompleteAction(paymentType: string) {
  await requirePermission("receivings");
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getReceivingCart();
  const source = getStockSource(cart);
  const destination = getStockDestination(cart);
  if (source === destination) return { error: "Source and destination must differ" };
  let current = cart;
  for (const line of [...cart.cart]) {
    current = deleteItem(current, line.line);
    current = (
      await addItem(current, {
        itemIdOrNumber: String(line.itemId),
        quantity: line.quantity,
        itemLocation: destination ?? 1,
        discount: line.discountType,
      })
    ).cart;
    current = (
      await addItem(current, {
        itemIdOrNumber: String(line.itemId),
        quantity: `-${line.quantity}`,
        itemLocation: source ?? 1,
        discount: line.discountType,
      })
    ).cart;
  }
  const result = await completeReceiving({
    cart: current,
    employeeId: session.user.personId,
    paymentType,
  });
  await clearReceivingCart();
  redirect(`/receivings/receipt/${result.receivingId}`);
}

export async function searchReceivingsAction(filters: Record<string, string> = {}) {
  await requirePermission("reports", "reports_receivings");
  return searchReceivings(filters.search ?? "", {
    start_date: filters.start_date,
    end_date: filters.end_date,
  });
}

export async function getReceivingRowAction(receivingId: number) {
  await requirePermission("reports", "reports_receivings");
  return getReceiving(receivingId);
}

export async function itemSearchAction(term: string) {
  await requirePermission("receivings");
  return suggestItems(term, { limit: 10 });
}

export async function stockItemSearchAction(term: string) {
  await requirePermission("receivings");
  return getStockSearchSuggestions(term, 10);
}

export async function addItemKitAction(
  itemKitId: number,
  itemLocation: number,
  discount: string,
  discountType: number,
) {
  await requirePermission("receivings");
  const cart = await addItemKit(
    await getReceivingCart(),
    String(itemKitId),
    itemLocation,
    discount,
    discountType,
  );
  await saveReceivingCart(cart);
  revalidatePath("/receivings/register");
}

export async function returnEntireReceivingAction(receiptInput: string) {
  await requirePermission("receivings");
  const cart = await returnEntireReceiving(await getReceivingCart(), receiptInput);
  await saveReceivingCart(cart);
  revalidatePath("/receivings/register");
}

export async function clearReceivingAction() {
  await requirePermission("receivings");
  await saveReceivingCart(clearAll(await getReceivingCart()));
  revalidatePath("/receivings/register");
}

export async function getReceivingTotalAction() {
  return getTotal(await getReceivingCart());
}

export async function cancelReceivingAction(receivingId: number) {
  await requirePermission("receivings");
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  await cancelReceiving(receivingId, session.user.personId);
  revalidatePath("/receivings/manage");
}

void copyEntireReceiving;
