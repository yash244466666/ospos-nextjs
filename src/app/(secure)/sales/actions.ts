"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/options";
import { requirePermission } from "@/lib/auth/with-permission";
import { getCart, saveCart } from "@/lib/sale/cart-store";
import * as saleLib from "@/lib/sale/sale-lib";
import type { SaleTotals } from "@/lib/sale/types";
import {
  addPayment,
  checkForCashRounding,
  clearAll,
  copyEntireSale,
  deletePayment,
  getAmountDue,
  getPaymentsTotal,
  getTotal,
  getTotals,
  removeCustomer,
  resetCashRounding,
  returnEntireSale,
  setCustomer,
  setEmployee,
  setMode,
  setSaleType,
  setSuspendedId,
  applyCustomerDiscount,
  addItemKit,
} from "@/lib/sale/sale-lib";
import {
  EMPTY_CART,
  INSUFFICIENT_GIFTCARD_BALANCE,
  INSUFFICIENT_REWARD_POINTS,
  cancelSale,
  checkInvoiceNumberExists,
  checkQuoteNumberExists,
  checkWorkOrderNumberExists,
  completeSale,
  deleteSuspendedSale,
  getSale,
  getSuspendedSaleInfo,
  restoreSale,
  suspendSale,
  updateSaleStatus,
} from "@/lib/sale/sale-model";
import { getTaxes, type ItemTaxDetail, type SaleTaxGroup } from "@/lib/tax";
import {
  SALE_STATUS,
  SALE_TYPE,
  DISCOUNT_TYPE,
  CASH_ADJUSTMENT,
  NEW_ITEM,
} from "@/lib/constants";
import {
  getConfig,
  getConfigBool,
  getConfigNumber,
  loadConfig,
} from "@/lib/config";
import { getDb } from "@/lib/db";
import {
  customers,
  dinnerTables,
  giftcards,
  itemKits,
  people,
  stockLocations,
} from "@/db/schema";
import {
  getInfoByIdOrNumber,
  getItemKitById,
  suggestItems,
} from "@/lib/items/repository";
import { sendSaleEmail } from "@/lib/email";
import { parseBarcode, barcodeFormatsFromConfig, render } from "@/lib/token";
import { dec, toDbDecimal } from "@/lib/money";
import { lang } from "@/lib/i18n/lang";

async function reloadData(extra: { error?: string | null; warning?: string | null } = {}): Promise<{
  cart: Awaited<ReturnType<typeof getCart>>;
  taxes: SaleTaxGroup[];
  itemTaxes: ItemTaxDetail[];
  totals: SaleTotals;
  error?: string | null;
  warning?: string | null;
}> {
  const cart = await getCart();
  const { taxes, itemTaxes } = await getTaxes(
    cart.cart.map((line) => ({
      itemId: line.itemId,
      line: line.line,
      quantity: line.quantity,
      price: line.price,
      discount: line.discount,
      discountType: line.discountType,
      taxCategoryId: line.taxCategoryId,
    })),
    { saleId: cart.saleId, registerMode: cart.mode, customerId: cart.customerId ?? -1 },
  );
  const totals = getTotals(cart, taxes);
  return { cart, taxes, itemTaxes, totals, ...extra };
}

export async function getCartAction() {
  const session = await auth();
  if (!session?.user?.personId) return null;
  await loadConfig();
  return reloadData();
}

export async function suggestItemsAction(term: string) {
  const session = await auth();
  if (!session?.user?.personId) return [];
  return suggestItems(term.trim(), { limit: 6 });
}

export async function addItemAction(itemInput: string, quantity: string | number = "1") {
  await requirePermission("sales");
  await loadConfig();
  let cart = await getCart();
  const trimmed = itemInput.trim();
  const parsed = parseBarcode(trimmed, barcodeFormatsFromConfig());
  const barcodeQuantity = parsed.quantity || String(quantity);
  const barcodeItem =
    parsed.item !== trimmed
      ? parsed.item
      : trimmed;
  const isReturn = cart.mode === "return";
  const signedQuantity = isReturn
    ? toDbDecimal(dec(barcodeQuantity).negated(), 4)
    : barcodeQuantity;

  const { isValidReceipt } = await import("@/lib/sale/sale-model");
  const receipt = isReturn ? await isValidReceipt(barcodeItem) : null;
  if (receipt) {
    cart = await returnEntireSale(cart, `POS ${receipt.id}`);
    await saveCart(cart);
    revalidatePath("/sales/register");
    return { error: null, warning: null };
  }

  const { getItemKitById: lookupKit } = await import("@/lib/items/repository");
  const kitPieces = barcodeItem.split(" ");
  const kitId = Number(/^KIT$/i.test(kitPieces[0]) ? kitPieces[1] : kitPieces[0]);
  const kit = Number.isFinite(kitId) && kitId > 0 ? await lookupKit(kitId) : null;

  let discount = getConfig("default_sales_discount", "0");
  let discountType = getConfigNumber("default_sales_discount_type", DISCOUNT_TYPE.PERCENT);
  let error: string | null = null;
  let warning: string | null = null;

  if (cart.customerId !== null && cart.customerId !== NEW_ITEM) {
    const db = await getDb();
    const customerRows = await db
      .select({
        discount: customers.discount,
        discountType: customers.discountType,
      })
      .from(customers)
      .where(eq(customers.personId, cart.customerId))
      .limit(1);
    if (customerRows[0] && customerRows[0].discount !== "") {
      discount = customerRows[0].discount;
      discountType = customerRows[0].discountType;
    }
  }

  if (kit) {
    if (discountType === kit.kitDiscountType) {
      if (dec(kit.kitDiscount).gt(discount)) discount = kit.kitDiscount;
    } else {
      discount = kit.kitDiscount;
      discountType = kit.kitDiscountType;
    }
    const header = await saleLib.addItem(cart, {
      itemIdOrNumber: String(kit.itemId || kit.itemKitId),
      itemLocation: cart.locationId,
      quantity: signedQuantity,
      discount: 0,
      discountType,
      priceMode: 1,
      kitPriceOption: kit.priceOption,
      kitPrintOption: kit.printOption,
      priceOverride: parsed.price !== null ? String(parsed.price) : null,
    });
    cart = header.cart;
    if (!header.success) error = lang("Sales.unable_to_add_item");
    else {
      warning = await saleLib.outOfStock(cart, kit.itemId, cart.locationId);
    }
    const kitResult = await addItemKit(
      cart,
      barcodeItem,
      cart.locationId,
      discount,
      discountType,
      kit.priceOption,
      kit.printOption,
    );
    cart = kitResult.cart;
    if (!kitResult.success) error = lang("Sales.unable_to_add_item");
    else if (kitResult.stockWarning) warning = kitResult.stockWarning;
  } else {
    const result = await saleLib.addItem(cart, {
      itemIdOrNumber: barcodeItem,
      itemLocation: cart.locationId,
      quantity: signedQuantity,
      discount,
      discountType,
      priceOverride: parsed.price !== null ? String(parsed.price) : null,
    });
    cart = result.cart;
    if (!result.success) error = lang("Sales.unable_to_add_item");
    else {
      const item = await getInfoByIdOrNumber(barcodeItem, true);
      if (item) warning = await saleLib.outOfStock(cart, item.itemId, cart.locationId);
    }
  }

  await saveCart(cart);
  revalidatePath("/sales/register");
  return { error, warning };
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
    discountedTotal?: string | null;
  },
) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  let cart = await getCart();
  const target = cart.cart.find((item) => item.line === line);
  if (!target) return { error: lang("Sales.unable_to_add_item") };

  const hasPriceGrant = session.user.personId === 1 ||
    (await import("@/lib/auth/rbac")).hasGrant("sales_change_price", session.user.personId);
  if (edits.price !== undefined && edits.price !== target.price && !(await hasPriceGrant)) {
    return { error: lang("Sales.error_editing_item") };
  }
  if (edits.discountType === DISCOUNT_TYPE.PERCENT && dec(edits.discount ?? "0").gt(100)) {
    return { error: lang("Sales.discount_invalid") };
  }
  if (
    edits.discountType === DISCOUNT_TYPE.FIXED &&
    dec(edits.discount ?? "0").gt(dec(edits.quantity ?? target.quantity).abs().times(edits.price ?? target.price))
  ) {
    return { error: lang("Sales.discount_invalid") };
  }
  if (cart.mode !== "return" && dec(edits.quantity ?? target.quantity).lt(0)) {
    return { error: lang("Sales.negative_quantity_invalid") };
  }

  cart = saleLib.editItem(cart, line, {
    description: edits.description ?? target.description,
    serialnumber: edits.serialnumber ?? target.serialnumber,
    quantity: edits.quantity ?? target.quantity,
    discount: edits.discount ?? target.discount,
    discountType: edits.discountType ?? null,
    price: edits.price ?? target.price,
    discountedTotal: edits.discountedTotal ?? null,
  });
  await saveCart(cart);
  revalidatePath("/sales/register");
  return { error: null };
}

export async function deleteItemAction(line: number) {
  const cart = await getCart();
  await saveCart(await saleLib.deleteItem(cart, line));
  revalidatePath("/sales/register");
}

export async function selectCustomerAction(customerId: number) {
  let cart = await getCart();
  cart = setCustomer(cart, customerId);
  const db = await getDb();
  const rows = await db
    .select({ discount: customers.discount, discountType: customers.discountType })
    .from(customers)
    .where(eq(customers.personId, customerId))
    .limit(1);
  if (rows[0] && rows[0].discount !== "") {
    cart = applyCustomerDiscount(cart, rows[0].discount, rows[0].discountType);
  }
  await saveCart(cart);
  revalidatePath("/sales/register");
}

export async function removeCustomerAction() {
  await saveCart(removeCustomer(await getCart()));
  revalidatePath("/sales/register");
}

export async function changeModeAction(
  mode: "sale" | "sale_invoice" | "sale_quote" | "sale_work_order" | "return",
) {
  let cart = setMode(await getCart(), mode);
  const saleType =
    mode === "sale_invoice"
      ? SALE_TYPE.INVOICE
      : mode === "sale_quote"
        ? SALE_TYPE.QUOTE
        : mode === "sale_work_order"
          ? SALE_TYPE.WORK_ORDER
          : mode === "return"
            ? SALE_TYPE.RETURN
            : SALE_TYPE.POS;
  cart = setSaleType(cart, saleType);
  cart = { ...cart, payments: [] };
  await saveCart(cart);
  revalidatePath("/sales/register");
}

export async function addPaymentAction(
  paymentType: string,
  amountTendered: string,
  referenceCode: string | null = null,
) {
  await requirePermission("sales");
  await loadConfig();
  let cart = await getCart();
  let error: string | null = null;
  let warning: string | null = null;

  if (!paymentType) {
    return reloadData({ error: lang("Sales.must_enter_numeric") });
  }
  if (
    paymentType !== lang("Sales.giftcard") &&
    paymentType !== lang("Sales.rewards") &&
    (paymentType.includes(lang("Sales.giftcard")) || paymentType.includes(lang("Sales.rewards")))
  ) {
    return reloadData({ error: lang("Sales.must_enter_numeric") });
  }

  const isReturnMode = cart.mode === "return";
  if (!isReturnMode && dec(amountTendered).lt(0) && paymentType !== lang("Sales.giftcard")) {
    return reloadData({ error: lang("Sales.negative_amount_tendered") });
  }

  if (paymentType === lang("Sales.giftcard")) {
    const giftcardNumber = amountTendered;
    const db = await getDb();
    const rows = await db
      .select()
      .from(giftcards)
      .where(
        and(eq(giftcards.giftcardNumber, giftcardNumber), eq(giftcards.deleted, false)),
      )
      .limit(1);
    const card = rows[0];
    const already = cart.payments
      .filter((p) => p.paymentType === `${lang("Sales.giftcard")}:${giftcardNumber}`)
      .reduce((sum, p) => sum.plus(dec(p.paymentAmount)), dec(0));
    const value = card ? dec(card.value) : dec(0);
    if (card?.personId !== null && card?.personId !== cart.customerId && card?.personId !== undefined) {
      error = lang("Giftcards.cannot_use", { 0: giftcardNumber });
    } else if (value.minus(already).lte(0) && cart.mode === "sale") {
      error = lang("Giftcards.remaining_balance", { 0: giftcardNumber, 1: value.toFixed(2) });
    } else {
      const remainingRaw = value.minus(await getAmountDue(cart));
      const remaining = remainingRaw.gt(0) ? remainingRaw : dec(0);
      cart = saleLib.setGiftcardRemainder(cart, remaining.toFixed(2));
      const tender = dec(await getAmountDue(cart)).lt(value)
        ? dec(await getAmountDue(cart))
        : value;
      cart = addPayment(cart, `${lang("Sales.giftcard")}:${giftcardNumber}`, tender.toFixed(4));
      warning = lang("Giftcards.remaining_balance", {
        0: giftcardNumber,
        1: remaining.toFixed(2),
      });
    }
  } else if (paymentType === lang("Sales.rewards")) {
    const db = await getDb();
    const rows = await db
      .select({ packageId: customers.packageId, points: customers.points })
      .from(customers)
      .where(eq(customers.personId, cart.customerId ?? NEW_ITEM))
      .limit(1);
    const packageId = rows[0]?.packageId;
    if (packageId === null || packageId === undefined) {
      error = lang("Sales.rewards_remaining_balance") + toDbDecimal(0, 2);
    } else {
      const points = dec(rows[0]?.points ?? 0);
      const already = cart.payments
        .filter((p) => p.paymentType === lang("Sales.rewards"))
        .reduce((sum, p) => sum.plus(dec(p.paymentAmount)), dec(0));
      if (points.minus(already).lte(0)) {
        error = lang("Sales.rewards_remaining_balance") + points.toFixed(2);
      } else {
        const due = dec(await getAmountDue(cart));
        const remaining = points.minus(due).gt(0) ? points.minus(due) : dec(0);
        cart = saleLib.setRewardsRemainder(cart, remaining.toFixed(2));
        cart = addPayment(cart, lang("Sales.rewards"), (due.lt(points) ? due : points).toFixed(4));
        warning = lang("Sales.rewards_remaining_balance") + remaining.toFixed(2);
      }
    }
  } else if (paymentType === lang("Sales.cash")) {
    const amountDue = await getTotal(cart, true);
    const salesTotal = await getTotal(cart, false);
    cart = addPayment(cart, paymentType, amountTendered);
    const adjustment = dec(amountDue).minus(salesTotal);
    if (!adjustment.isZero()) {
      cart = { ...cart, cashMode: true };
      cart = addPayment(
        cart,
        lang("Sales.cash_adjustment"),
        adjustment.toFixed(4),
        null,
        CASH_ADJUSTMENT.CASH_ADJUSTMENT_TRUE,
      );
    }
  } else {
    const requireReference = [
      lang("Sales.debit"),
      lang("Sales.credit"),
    ].includes(paymentType);
    if (requireReference) {
      const min = getConfigNumber("payment_reference_code_min", 3);
      const max = getConfigNumber("payment_reference_code_max", 20);
      if (!referenceCode) {
        error = lang("Sales.must_enter_reference_code");
      } else if (!/^[A-Za-z0-9]+$/.test(referenceCode)) {
        error = lang("Sales.reference_code_invalid_characters");
      } else if (referenceCode.length < min || referenceCode.length > max) {
        error = lang("Sales.reference_code_length_error");
      }
    }
    if (!error) {
      cart = addPayment(cart, paymentType, amountTendered, referenceCode);
    }
  }

  if (!error) await saveCart(cart);
  revalidatePath("/sales/register");
  return reloadData({ error, warning });
}

export async function deletePaymentAction(paymentType: string) {
  const cart = deletePayment(await getCart(), paymentType);
  await saveCart(cart);
  revalidatePath("/sales/register");
}

export async function clearCartAction() {
  await requirePermission("sales");
  await saveCart(clearAll(await getCart()));
  revalidatePath("/sales/register");
  redirect("/sales/register");
}

export async function setCommentAction(comment: string) {
  await saveCart(saleLib.setComment(await getCart(), comment));
  revalidatePath("/sales/register");
}

export async function setInvoiceNumberAction(num: string) {
  await saveCart(saleLib.setInvoiceNumber(await getCart(), num));
  revalidatePath("/sales/register");
}

export async function setQuoteNumberAction(num: string) {
  await saveCart(saleLib.setQuoteNumber(await getCart(), num));
  revalidatePath("/sales/register");
}

export async function setWorkOrderNumberAction(num: string) {
  await saveCart(saleLib.setWorkOrderNumber(await getCart(), num));
  revalidatePath("/sales/register");
}

export async function setPrintAfterSaleAction(value: boolean) {
  await saveCart(saleLib.setPrintAfterSale(await getCart(), value));
}

export async function setEmailReceiptAction(value: boolean) {
  await saveCart(saleLib.setEmailReceipt(await getCart(), value));
}

export async function setPriceWorkOrdersAction(value: boolean) {
  await saveCart(saleLib.setPriceWorkOrders(await getCart(), value));
}

export async function setLocationAction(locationId: number) {
  await saveCart(saleLib.setSaleLocation(await getCart(), locationId));
  revalidatePath("/sales/register");
}

export async function setDinnerTableAction(dinnerTableId: number) {
  const cart = { ...saleLib.setDinnerTable(await getCart(), dinnerTableId), payments: [] };
  await saveCart(cart);
  revalidatePath("/sales/register");
}

export async function setEmployeeAction(employeeId: number) {
  await saveCart(setEmployee(await getCart(), employeeId));
  revalidatePath("/sales/register");
}

export async function getGiftcardAction(number: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(giftcards)
    .where(and(eq(giftcards.giftcardNumber, number), eq(giftcards.deleted, false)))
    .limit(1);
  const card = rows[0];
  if (!card) return null;
  return {
    giftcardId: card.giftcardId,
    giftcardNumber: card.giftcardNumber,
    value: Number(card.value),
    personId: card.personId,
  };
}

export async function showKeyboardShortcutsAction() {
  return { ok: true };
}

async function buildCompletionInput(
  status: number,
): Promise<
  | { ok: true; input: Parameters<typeof completeSale>[0] }
  | { ok: false; error: string }
> {
  await loadConfig();
  const session = await auth();
  if (!session?.user?.personId) return { ok: false, error: "login" };
  const cart = await getCart();
  if (cart.cart.length === 0) return { ok: false, error: lang("Sales.unable_to_add_item") };

  const { taxes, itemTaxes } = await getTaxes(
    cart.cart.map((line) => ({
      itemId: line.itemId,
      line: line.line,
      quantity: line.quantity,
      price: line.price,
      discount: line.discount,
      discountType: line.discountType,
      taxCategoryId: line.taxCategoryId,
    })),
    { saleId: cart.saleId, registerMode: cart.mode, customerId: cart.customerId ?? -1 },
  );
  const totals = getTotals(cart, taxes);
  if (cart.mode !== "return" && dec(totals.total).lt(0)) {
    return { ok: false, error: lang("Sales.negative_total_invalid") };
  }
  if (
    !totals.paymentsCoverTotal &&
    cart.mode !== "sale_invoice" &&
    cart.mode !== "sale_quote"
  ) {
    return { ok: false, error: lang("Sales.amount_due_not_covered") };
  }

  const payments = cart.payments.map((payment) => ({ ...payment }));
  const due = dec(cart.cashMode ? totals.cashAmountDue : totals.amountDue);
  if (due.negated().gt(0)) {
    const refund = due.negated();
    const cash = payments.find((payment) => payment.paymentType === lang("Sales.cash"));
    if (cash) {
      cash.cashRefund = toDbDecimal(refund, 2);
    } else {
      payments.push({
        paymentType: lang("Sales.cash"),
        paymentAmount: "0",
        cashRefund: toDbDecimal(refund, 2),
        cashAdjustment: 0,
        referenceCode: null,
      });
    }
  }

  let invoiceNumber = cart.invoiceNumber || null;
  let quoteNumber = cart.quoteNumber || null;
  let workOrderNumber = cart.workOrderNumber || null;
  let saleType = cart.saleType;

  if (cart.mode === "sale_invoice") {
    const format = getConfig("sales_invoice_format", "{CO}");
    if (!invoiceNumber && format) invoiceNumber = await render(format, { save: true });
    if (cart.saleId === -1 && invoiceNumber && (await checkInvoiceNumberExists(invoiceNumber))) {
      return { ok: false, error: lang("Sales.invoice_number_duplicate", { 0: invoiceNumber }) };
    }
    saleType = SALE_TYPE.INVOICE;
  } else if (cart.mode === "sale_quote") {
    if (!quoteNumber) {
      quoteNumber = await render(getConfig("sales_quote_format", "Q%y{QSEQ:6}"), { save: true });
    }
    if (cart.saleId === -1 && (await checkQuoteNumberExists(quoteNumber))) {
      return { ok: false, error: lang("Sales.quote_number_duplicate", { 0: quoteNumber }) };
    }
    saleType = SALE_TYPE.QUOTE;
  } else if (cart.mode === "sale_work_order") {
    if (!workOrderNumber) {
      workOrderNumber = await render(
        getConfig("work_order_format", "W%y{WSEQ:6}"),
        { save: true },
      );
    }
    if (cart.saleId === -1 && (await checkWorkOrderNumberExists(workOrderNumber))) {
      return { ok: false, error: lang("Sales.work_order_number_duplicate", { 0: workOrderNumber }) };
    }
    saleType = SALE_TYPE.WORK_ORDER;
  } else if (cart.mode === "return") {
    saleType = SALE_TYPE.RETURN;
  } else {
    saleType = SALE_TYPE.POS;
  }

  return {
    ok: true,
    input: {
      cart: cart.cart,
      status,
      customerId: cart.customerId,
      employeeId: session.user.personId,
      comment: cart.comment,
      invoiceNumber,
      quoteNumber,
      workOrderNumber,
      saleType,
      payments,
      dinnerTableId: cart.dinnerTableId,
      saleId: cart.saleId,
      taxes,
      itemTaxes,
    },
  };
}

export async function suspendAction() {
  await requirePermission("sales");
  await loadConfig();
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  const cart = await getCart();
  if (cart.cart.length === 0) return { error: lang("Sales.unable_to_add_item") };
  const saleId = await suspendSale({
    cart: cart.cart,
    status: SALE_STATUS.SUSPENDED,
    customerId: cart.customerId,
    employeeId: session.user.personId,
    comment: cart.comment,
    invoiceNumber: cart.invoiceNumber || null,
    quoteNumber: cart.quoteNumber || null,
    workOrderNumber: cart.workOrderNumber || null,
    saleType: cart.saleType,
    payments: cart.payments,
    dinnerTableId: cart.dinnerTableId,
    saleId: cart.saleId,
    taxes: [],
    itemTaxes: [],
  });
  await saveCart(clearAll(setSuspendedId(cart, saleId)));
  redirect("/sales/suspended");
}

export async function unsuspendAction(saleId: number) {
  await requirePermission("reports", "reports_sales");
  const sale = await getSuspendedSaleInfo(saleId);
  if (!sale) return { error: lang("Sales.unable_to_add_item") };
  const cart = await getCart();
  const copied = await copyEntireSale({ ...cart, cart: [], payments: [] }, saleId);
  await saveCart({
    ...copied,
    mode:
      sale.saleType === SALE_TYPE.QUOTE
        ? "sale_quote"
        : sale.saleType === SALE_TYPE.WORK_ORDER
          ? "sale_work_order"
          : sale.saleType === SALE_TYPE.INVOICE
            ? "sale_invoice"
            : sale.saleType === SALE_TYPE.RETURN
              ? "return"
              : "sale",
    suspendedId: saleId,
  });
  revalidatePath("/sales/register");
  redirect("/sales/register");
}

export async function cancelSaleAction(saleId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  await requirePermission("reports", "reports_sales");
  await cancelSale(saleId, session.user.personId);
  revalidatePath("/sales/suspended");
  redirect("/sales/suspended");
}

export async function completeSaleAction() {
  await requirePermission("sales");
  const cart = await getCart();
  const status =
    cart.mode === "sale_quote" || cart.mode === "sale_work_order"
      ? SALE_STATUS.SUSPENDED
      : SALE_STATUS.COMPLETED;
  const built = await buildCompletionInput(status);
  if (!built.ok) {
    if (built.error === "login") redirect("/login");
    return reloadData({ error: built.error });
  }
  const saleId = await completeSale(built.input);
  if (saleId === INSUFFICIENT_GIFTCARD_BALANCE) {
    return reloadData({ error: lang("Sales.insufficient_giftcard_balance") });
  }
  if (saleId === INSUFFICIENT_REWARD_POINTS) {
    return reloadData({ error: lang("Sales.insufficient_reward_points") });
  }
  if (saleId === INSUFFICIENT_STOCK) {
    return reloadData({ error: lang("Sales.insufficient_stock") });
  }
  if (saleId === EMPTY_CART || saleId === -1) {
    return reloadData({ error: lang("Sales.transaction_failed") });
  }

  const finalCart = await getCart();
  if (cart.mode === "sale_quote") {
    await saveCart(clearAll(setSuspendedId(finalCart, saleId)));
    redirect(`/sales/quote/${saleId}`);
  }
  if (cart.mode === "sale_work_order") {
    await saveCart(clearAll(setSuspendedId(finalCart, saleId)));
    redirect(`/sales/work_order/${saleId}`);
  }
  await saveCart(clearAll(finalCart));
  if (cart.mode === "sale_invoice") redirect(`/sales/invoice/${saleId}`);
  redirect(`/sales/receipt/${saleId}`);
}

const INSUFFICIENT_STOCK = -4;

export async function returnEntireSaleAction(receiptInput: string) {
  let cart = await getCart();
  cart = await returnEntireSale(cart, receiptInput);
  await saveCart(cart);
  revalidatePath("/sales/register");
  redirect("/sales/register");
}

export async function sendPdfAction(
  saleId: number,
  kind: "invoice" | "quote" | "work_order" | "receipt",
) {
  const result = await sendSaleEmail(saleId, kind);
  return { ok: result.ok, message: result.message };
}

export async function checkInvoiceNumberAction(
  invoiceNumber: string,
  excludeSaleId: number | null = null,
): Promise<boolean> {
  return checkInvoiceNumberExists(invoiceNumber, excludeSaleId);
}

export async function discardSuspendedSaleAction(saleId: number) {
  await requirePermission("sales", "sales_delete");
  const sale = await getSale(saleId);
  if (sale?.dinnerTableId && sale.dinnerTableId > 2) {
    const db = await getDb();
    await db
      .update(dinnerTables)
      .set({ status: 0 })
      .where(eq(dinnerTables.dinnerTableId, sale.dinnerTableId));
  }
  await deleteSuspendedSale(saleId);
  const cart = await getCart();
  if (cart.suspendedId === saleId) await saveCart(clearAll(cart));
  revalidatePath("/sales/suspended");
  revalidatePath("/sales/register");
}

export async function getSuspendedSaleInfoAction(saleId: number) {
  return getSuspendedSaleInfo(saleId);
}

export async function deleteSaleAction(saleId: number) {
  const session = await auth();
  if (!session?.user?.personId) redirect("/login");
  await requirePermission("sales", "sales_delete");
  await cancelSale(saleId, session.user.personId);
  revalidatePath("/sales/manage");
}

export async function restoreSaleAction(saleId: number) {
  await requirePermission("sales", "sales_delete");
  await restoreSale(saleId);
  revalidatePath("/sales/manage");
}

export async function resetCashRoundingAction() {
  const { cart } = resetCashRounding(await getCart());
  await saveCart(cart);
}

export async function getRegisterPaymentOptionsAction() {
  const { getPaymentOptions } = await import("@/lib/sale/sale-model");
  return getPaymentOptions(true, true);
}

export async function getRegisterLocationsAction() {
  const db = await getDb();
  return db
    .select()
    .from(stockLocations)
    .where(eq(stockLocations.deleted, false));
}

export async function getRegisterPeopleAction() {
  const db = await getDb();
  return db
    .select({
      personId: people.personId,
      firstName: people.firstName,
      lastName: people.lastName,
    })
    .from(people);
}

void itemKits;
void getPaymentsTotal;
void checkForCashRounding;
void updateSaleStatus;
void getItemKitById;
