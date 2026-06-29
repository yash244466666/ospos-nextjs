"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import { getCart, saveCart, emptyCart } from "@/lib/sale/cart-store";
import {
  addItem, editItem, deleteItem, setMode, addPayment, deletePayment,
  setComment as libSetComment, setInvoiceNumber as libSetInvoiceNumber,
  setEmployee, removeCustomer, setSaleLocation as libSetLocation,
  clearAll, returnEntireSale, copyEntireSale,
} from "@/lib/sale/sale-lib";
import { completeSale, suspendSale, cancelSale, copySaleToCart, getSale, checkInvoiceNumberExists, updateSaleStatus, getSuspendedSaleInfo } from "@/lib/sale/sale-model";
import { getTaxes } from "@/lib/tax";
import { getCartTotals } from "@/lib/sale/types";
import { SALE_STATUS } from "@/lib/constants";
import { getConfig } from "@/lib/config";
import { suggestItems } from "@/lib/items/repository";
import { sendSaleEmail } from "@/lib/email";

export async function getCartAction() {
  const session = await auth();
  if (!session?.user?.personId) return null;
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
  await editItem(line, edits as any);
  revalidatePath("/sales/register");
}

export async function deleteItemAction(line: number) {
  await deleteItem(line);
  revalidatePath("/sales/register");
}

export async function selectCustomerAction(customerId: number) {
  const cart = await getCart();
  cart.customerId = customerId;
  await saveCart(cart);
  revalidatePath("/sales/register");
}

export async function removeCustomerAction() {
  const cart = await getCart();
  cart.customerId = null;
  cart.giftcardRemainder = 0;
  cart.rewardsRemainder = 0;
  cart.invoiceNumber = "";
  cart.quoteNumber = "";
  cart.payments = cart.payments.filter((p) => !p.paymentType.startsWith("Gift Card: ") && p.paymentType !== "Rewards");
  await saveCart(cart);
  revalidatePath("/sales/register");
}

export async function changeModeAction(mode: "sale" | "sale_invoice" | "sale_quote" | "sale_work_order" | "return") {
  await setMode(mode);
  revalidatePath("/sales/register");
}

export async function addPaymentAction(paymentType: string, amountTendered: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getCart();
  await addPayment(cart, paymentType, amountTendered, 0, session.user.personId);
  revalidatePath("/sales/register");
}

export async function deletePaymentAction(paymentId: string) {
  const cart = await getCart();
  await deletePayment(cart, paymentId);
  revalidatePath("/sales/register");
}

export async function setCommentAction(comment: string) {
  const cart = await getCart();
  await libSetComment(cart, comment);
  revalidatePath("/sales/register");
}

export async function setInvoiceNumberAction(num: string) {
  const cart = await getCart();
  await libSetInvoiceNumber(cart, num);
  revalidatePath("/sales/register");
}

export async function setPrintAfterSaleAction(v: boolean) {
  const cart = await getCart();
  cart.printAfterSale = v;
  await saveCart(cart);
}

export async function setEmailReceiptAction(v: boolean) {
  const cart = await getCart();
  cart.emailReceipt = v;
  await saveCart(cart);
}

export async function setPriceWorkOrdersAction(v: boolean) {
  const cart = await getCart();
  cart.priceWorkOrders = v;
  await saveCart(cart);
}

export async function setLocationAction(locationId: number) {
  const cart = await getCart();
  await libSetLocation(cart, locationId);
  revalidatePath("/sales/register");
}

export async function setDinnerTableAction(dinnerTableId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getCart();
  cart.dinnerTableId = dinnerTableId;
  cart.payments = [];
  await saveCart(cart);
  revalidatePath("/sales/register");
}

export async function getGiftcardAction(number: string) {
  const { getGiftcardValue } = await import("@/lib/giftcards/repository");
  return getGiftcardValue(number);
}

export async function showKeyboardShortcutsAction() {
  // No-op — UI handles the dialog. Action exists for parity with PHP and any future logging.
  return { ok: true };
}

export async function suspendAction() {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getCart();
  if (cart.cart.length === 0) throw new Error("Cart is empty");
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
  await clearAll();
  redirect("/sales/suspended");
}

export async function unsuspendAction(saleId: number) {
  const cart = await getCart();
  await copyEntireSale(cart, saleId);
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
  await clearAll();
  if (cart.mode === "sale_invoice") redirect(`/sales/invoice/${result.saleId}`);
  if (cart.mode === "sale_quote") redirect(`/sales/quote/${result.saleId}`);
  if (cart.mode === "sale_work_order") redirect(`/sales/work_order/${result.saleId}`);
  redirect(`/sales/receipt/${result.saleId}`);
}

export async function returnEntireSaleAction(receiptInput: string) {
  const cart = await getCart();
  await returnEntireSale(cart, receiptInput);
  revalidatePath("/sales/register");
  redirect("/sales/register");
}

export async function sendPdfAction(saleId: number, kind: "invoice" | "quote" | "work_order" | "receipt") {
  const result = await sendSaleEmail(saleId, kind);
  return { ok: result.ok, message: result.message };
}

export async function checkInvoiceNumberAction(invoiceNumber: string, excludeSaleId: number | null = null): Promise<boolean> {
  return checkInvoiceNumberExists(invoiceNumber, excludeSaleId);
}

export async function discardSuspendedSaleAction(saleId: number) {
  updateSaleStatus(saleId, SALE_STATUS.CANCELED);
  const cart = await getCart();
  if (cart.suspendedId === saleId) {
    await clearAll();
  }
  revalidatePath("/sales/suspended");
  revalidatePath("/sales/register");
}

export async function getSuspendedSaleInfoAction(saleId: number) {
  return getSuspendedSaleInfo(saleId);
}

export async function setEmployeeAction(employeeId: number) {
  const cart = await getCart();
  await setEmployee(cart, employeeId);
  revalidatePath("/sales/register");
}

void emptyCart;
void copySaleToCart;
