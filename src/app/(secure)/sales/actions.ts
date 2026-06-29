"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import {
  addItem, editItem, deleteItem, selectCustomer, removeCustomer,
  changeMode, addPayment, deletePayment, setComment, setInvoiceNumber,
  setPrintAfterSale, setEmailReceipt, setPriceWorkOrders, setLocation,
  returnEntireSale,
} from "@/lib/sale/sale-lib";
import { completeSale, suspendSale, cancelSale, copySaleToCart, getSale } from "@/lib/sale/sale-model";
import { getTaxes } from "@/lib/tax";
import { getCartTotals } from "@/lib/sale/types";
import { SALE_STATUS } from "@/lib/constants";
import { getConfig } from "@/lib/config";
import { suggestItems } from "@/lib/items/repository";

export async function getCartAction() {
  const session = await auth();
  if (!session?.user?.personId) return null;
  const { getCart } = await import("@/lib/sale/cart-store");
  const cart = await getCart();
  const { taxes, itemTaxes } = getTaxes(cart.cart);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  const totals = getCartTotals(cart.cart, taxTotal, getConfig("tax_included", "0") === "1");
  return { cart, taxes, itemTaxes, totals };
}

export async function suggestItemsAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) return [];
  return suggestItems(term.trim(), { limit: 6 });
}

export async function addItemAction(itemInput: string, quantity = 1) {
  await addItem(itemInput, quantity);
  revalidatePath("/sales/register");
}

export async function editItemAction(line: number, edits: Record<string, unknown>) {
  await editItem(line, edits);
  revalidatePath("/sales/register");
}

export async function deleteItemAction(line: number) {
  await deleteItem(line);
  revalidatePath("/sales/register");
}

export async function selectCustomerAction(customerId: number) {
  await selectCustomer(customerId);
  revalidatePath("/sales/register");
}

export async function removeCustomerAction() {
  await removeCustomer();
  revalidatePath("/sales/register");
}

export async function changeModeAction(mode: "sale" | "sale_invoice" | "sale_quote" | "sale_work_order" | "return") {
  await changeMode(mode);
  revalidatePath("/sales/register");
}

export async function addPaymentAction(paymentType: string, amountTendered: number) {
  await addPayment(paymentType, amountTendered);
  revalidatePath("/sales/register");
}

export async function deletePaymentAction(paymentId: string) {
  await deletePayment(paymentId);
  revalidatePath("/sales/register");
}

export async function setCommentAction(comment: string) {
  await setComment(comment);
  revalidatePath("/sales/register");
}

export async function setInvoiceNumberAction(num: string) {
  await setInvoiceNumber(num);
  revalidatePath("/sales/register");
}

export async function setPrintAfterSaleAction(v: boolean) {
  await setPrintAfterSale(v);
}

export async function setEmailReceiptAction(v: boolean) {
  await setEmailReceipt(v);
}

export async function setPriceWorkOrdersAction(v: boolean) {
  await setPriceWorkOrders(v);
}

export async function setLocationAction(locationId: number) {
  await setLocation(locationId);
  revalidatePath("/sales/register");
}

export async function suspendAction() {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const { getCart } = await import("@/lib/sale/cart-store");
  const cart = await getCart();
  const { taxes, itemTaxes } = getTaxes(cart.cart);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  const totals = getCartTotals(cart.cart, taxTotal, getConfig("tax_included", "0") === "1");
  await suspendSale({
    cart, taxes, itemTaxes,
    saleStatus: SALE_STATUS.SUSPENDED,
    employeeId: session.user.personId,
    subtotal: totals.subtotal,
    total: totals.total,
    taxTotal,
  });
  const { clearCart } = await import("@/lib/sale/cart-store");
  await clearCart();
  redirect("/sales/suspended");
}

export async function unsuspendAction(saleId: number) {
  await copySaleToCart(saleId);
  revalidatePath("/sales/register");
  redirect("/sales/register");
}

export async function cancelSaleAction(saleId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  cancelSale(saleId, session.user.personId);
  revalidatePath("/sales/suspended");
  redirect("/sales/suspended");
}

export async function completeSaleAction() {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const { getCart } = await import("@/lib/sale/cart-store");
  const cart = await getCart();
  if (cart.cart.length === 0) throw new Error("Cart is empty");
  const { taxes, itemTaxes } = getTaxes(cart.cart);
  const taxTotal = taxes.reduce((s, t) => s + t.saleTaxAmount, 0);
  const totals = getCartTotals(cart.cart, taxTotal, getConfig("tax_included", "0") === "1");
  const result = await completeSale({
    cart, taxes, itemTaxes,
    saleStatus: SALE_STATUS.COMPLETED,
    employeeId: session.user.personId,
    subtotal: totals.subtotal,
    total: totals.total,
    taxTotal,
  });
  const { clearCart } = await import("@/lib/sale/cart-store");
  await clearCart();
  if (cart.mode === "sale_invoice") redirect(`/sales/invoice/${result.saleId}`);
  redirect(`/sales/receipt/${result.saleId}`);
}

export async function returnEntireSaleAction(saleId: number) {
  await returnEntireSale(saleId);
  const sale = getSale(saleId);
  if (sale) {
    const items = (await import("@/lib/sale/sale-model")).getSaleItems(saleId);
    const { getCart, saveCart } = await import("@/lib/sale/cart-store");
    const cart = await getCart();
    cart.cart = items.map((r, idx) => ({
      line: idx + 1,
      itemId: r.itemId,
      itemLocation: r.itemLocation ?? 1,
      itemName: "",
      itemNumber: null,
      description: r.description ?? "",
      serialnumber: r.serialnumber ?? "",
      quantity: Math.abs(r.quantityPurchased),
      discount: r.discount,
      discountType: r.discountType,
      price: r.itemUnitPrice,
      costPrice: r.itemCostPrice,
      stockType: 0,
      taxCategoryId: null,
      taxedFlag: "",
      printOption: r.printOption,
      isSerialized: false,
      total: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
      discountedTotal: Math.abs(r.quantityPurchased) * r.itemUnitPrice,
    }));
    cart.payments = [];
    await saveCart(cart);
  }
  revalidatePath("/sales/register");
  redirect("/sales/register");
}
