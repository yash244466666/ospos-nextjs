"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SaleCart } from "@/lib/sale/types";
import type { SaleTaxGroup, ItemTaxDetail } from "@/lib/tax";
import type { ItemRow } from "@/lib/items/repository";
import type { SaleTotals } from "@/lib/sale/types";
import {
  addItemAction,
  suggestItemsAction,
  editItemAction,
  deleteItemAction,
  selectCustomerAction,
  removeCustomerAction,
  changeModeAction,
  addPaymentAction,
  deletePaymentAction,
  setCommentAction,
  setInvoiceNumberAction,
  setQuoteNumberAction,
  setWorkOrderNumberAction,
  completeSaleAction,
  suspendAction,
  setLocationAction,
  setDinnerTableAction,
  setEmailReceiptAction,
  getGiftcardAction,
  showKeyboardShortcutsAction,
} from "@/app/(secure)/sales/actions";
import {
  Search, Plus, Trash2, CreditCard, User, MapPin, MessageSquare,
  HelpCircle, Receipt, ShoppingCart, Pause, Check, Briefcase, RotateCcw,
} from "lucide-react";

interface CustomerOption {
  customerId: number;
  label: string;
  balance: number;
}

interface Props {
  initialCart: SaleCart;
  taxes: SaleTaxGroup[];
  itemTaxes: ItemTaxDetail[];
  totals: SaleTotals;
  locations: { locationId: number; locationName: string }[];
  customers: CustomerOption[];
  dinnerTables: { id: number; name: string; status: string }[];
  paymentOptions: string[];
  giftcards: { id: number; number: string; value: number }[];
  invoiceFormat: string;
  taxIncluded: boolean;
  dinnerTableEnabled: boolean;
  currencySymbol: string;
  emailReceipt: boolean;
  priceWorkOrders: boolean;
}

const MODE_CONFIG: {
  key: SaleCart["mode"];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "sale", label: "POS Sale", icon: ShoppingCart },
  { key: "sale_invoice", label: "Invoice", icon: Receipt },
  { key: "sale_quote", label: "Quote", icon: Briefcase },
  { key: "sale_work_order", label: "Work Order", icon: Check },
  { key: "return", label: "Return", icon: RotateCcw },
];

function money(symbol: string, value: string | number | null | undefined): string {
  const numeric = Number(value ?? 0);
  return `${symbol}${Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00"}`;
}

export default function Register(props: Props) {
  const router = useRouter();
  const [itemInput, setItemInput] = useState("");
  const [suggestions, setSuggestions] = useState<ItemRow[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [paymentType, setPaymentType] = useState(props.paymentOptions[0] ?? "Cash");
  const [tendered, setTendered] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [mode, setMode] = useState<SaleCart["mode"]>(props.initialCart.mode);
  const [pending, startTransition] = useTransition();
  const [customerSearch, setCustomerSearch] = useState("");
  const customerResults =
    customerSearch.trim().length < 2
      ? props.customers
      : props.customers.filter((c) =>
          c.label.toLowerCase().includes(customerSearch.toLowerCase()),
        );
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<{ error?: string | null; warning?: string | null }>({});
  const run = (task: () => Promise<void>) => {
    startTransition(() => {
      void task();
    });
  };

  useEffect(() => {
    const term = itemInput.trim();
    if (term.length < 2) {
      return;
    }
    const timeout = window.setTimeout(() => {
      run(async () => {
        setSuggestions(await suggestItemsAction(term));
      });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [itemInput]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setHelpOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cart = props.initialCart;
  const totalValue = props.totals.total;
  const paidValue = cart.payments
    .filter((payment) => !payment.cashAdjustment)
    .reduce((sum, payment) => sum + Number(payment.paymentAmount), 0);
  const dueValue = Math.max(0, Number(totalValue) - paidValue);
  const changeValue = paidValue > Number(totalValue) ? paidValue - Number(totalValue) : 0;

  function refresh(result?: { error?: string | null; warning?: string | null }) {
    setMessage(result ?? {});
    router.refresh();
  }

  function onAdd(raw: string, qty: string) {
    run(async () => {
      const result = await addItemAction(raw, qty);
      setItemInput("");
      setSuggestions([]);
      refresh(result);
    });
  }

  function onAddPayment() {
    const amount = tendered || dueValue.toFixed(2);
    run(async () => {
      if (paymentType === props.paymentOptions.find((p) => p.toLowerCase().includes("gift"))) {
        const number = window.prompt("Enter gift card number:");
        if (number) {
          const card = await getGiftcardAction(number);
          if (card) refresh(await addPaymentAction(paymentType, number, referenceCode || null));
        }
        setTendered("");
        return;
      }
      refresh(await addPaymentAction(paymentType, amount, referenceCode || null));
      setTendered("");
      setReferenceCode("");
    });
  }

  const referenceRequired = /debit|credit/i.test(paymentType);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Point of Sale</h1>
          <div className="flex-1" />
          <button
            onClick={() => setHelpOpen(true)}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Keyboard shortcuts"
            title="Ctrl+H"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>

        {message.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {message.error}
          </div>
        ) : null}
        {message.warning ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {message.warning}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              placeholder="Scan barcode or type item name..."
              value={itemInput}
              onChange={(event) => setItemInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && itemInput.trim()) onAdd(itemInput.trim(), quantity);
              }}
              data-testid="item-input"
            />
            {itemInput.trim().length >= 2 && suggestions.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {suggestions.map((item) => (
                  <button
                    key={item.itemId}
                    type="button"
                    className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-slate-50"
                    onClick={() => onAdd(String(item.itemId), quantity)}
                  >
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">
                      {item.itemNumber ?? "No barcode"} · {money(props.currencySymbol, item.unitPrice)} · stock {item.receivingQuantity ?? "—"}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="any"
              className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-right"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              data-testid="item-quantity"
            />
            <button
              className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              disabled={pending || !itemInput.trim()}
              onClick={() => onAdd(itemInput.trim(), quantity)}
              data-testid="add-item-button"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="cart-table">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="p-3 text-left font-medium text-slate-700">Item</th>
                <th className="p-3 text-right font-medium text-slate-700">Price</th>
                <th className="p-3 text-right font-medium text-slate-700">Qty</th>
                <th className="p-3 text-right font-medium text-slate-700">Disc</th>
                <th className="p-3 text-right font-medium text-slate-700">Total</th>
                <th className="w-10 p-3" />
              </tr>
            </thead>
            <tbody>
              {cart.cart.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No items yet. Scan or search to add.
                  </td>
                </tr>
              ) : null}
              {cart.cart.map((line) => (
                <tr
                  key={line.line}
                  className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                  data-testid={`cart-row-${line.line}`}
                >
                  <td className="p-3">
                    <div className="font-medium text-slate-900" data-testid={`cart-item-name-${line.line}`}>
                      {line.name}
                    </div>
                    {line.description ? (
                      <div className="text-xs text-slate-500">{line.description}</div>
                    ) : null}
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-right"
                      defaultValue={Number(line.price).toFixed(2)}
                      onBlur={(event) =>
                        run(async () => {
                          refresh(await editItemAction(line.line, { price: event.target.value }));
                        })
                      }
                    />
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      step="any"
                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right"
                      defaultValue={line.quantity}
                      onBlur={(event) =>
                        run(async () => {
                          refresh(await editItemAction(line.line, { quantity: event.target.value }));
                        })
                      }
                    />
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      step="any"
                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right"
                      defaultValue={line.discount}
                      onBlur={(event) =>
                        run(async () => {
                          refresh(await editItemAction(line.line, { discount: event.target.value }));
                        })
                      }
                    />
                  </td>
                  <td
                    className="p-3 text-right font-medium text-slate-900"
                    data-testid={`cart-row-total-${line.line}`}
                  >
                    {money(props.currencySymbol, line.discountedTotal)}
                  </td>
                  <td className="p-3">
                    <button
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      onClick={() =>
                        run(async () => {
                          await deleteItemAction(line.line);
                          router.refresh();
                        })
                      }
                      aria-label="remove line"
                      data-testid={`cart-row-delete-${line.line}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          {MODE_CONFIG.map((entry) => (
            <button
              key={entry.key}
              data-testid={`mode-${entry.key}`}
              onClick={() => {
                setMode(entry.key);
                run(async () => {
                  await changeModeAction(entry.key);
                  router.refresh();
                });
              }}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                mode === entry.key
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <entry.icon className="h-4 w-4" />
              {entry.label}
            </button>
          ))}
        </div>

        <div className="ml-auto max-w-sm rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600" data-testid="totals-subtotal">
              <span>Subtotal</span>
              <span className="font-medium text-slate-900">{money(props.currencySymbol, props.totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600" data-testid="totals-discount">
              <span>Discount</span>
              <span className="font-medium text-slate-900">{money(props.currencySymbol, props.totals.totalDiscount)}</span>
            </div>
            {props.taxes.map((tax) => (
              <div key={tax.taxGroup} className="flex justify-between text-slate-600" data-testid={`tax-${tax.taxGroup}`}>
                <span>{tax.name || tax.taxGroup}</span>
                <span className="font-medium text-slate-900">{money(props.currencySymbol, tax.saleTaxAmount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold text-slate-900" data-testid="totals-total">
              <span>Total</span>
              <span data-testid="totals-total-value">{money(props.currencySymbol, totalValue)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full space-y-5 lg:w-96">
        <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <User className="h-4 w-4" /> Customer
            </label>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              placeholder="Search customer…"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
            />
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={cart.customerId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                run(async () => {
                  if (value) await selectCustomerAction(Number(value));
                  else await removeCustomerAction();
                  router.refresh();
                });
              }}
            >
              <option value="">— Walk-in —</option>
              {customerResults.map((customer) => (
                <option key={customer.customerId} value={customer.customerId}>
                  {customer.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <MapPin className="h-4 w-4" /> Location
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={cart.locationId}
              onChange={(event) =>
                run(async () => {
                  await setLocationAction(Number(event.target.value));
                  router.refresh();
                })
              }
            >
              {props.locations.map((location) => (
                <option key={location.locationId} value={location.locationId}>
                  {location.locationName}
                </option>
              ))}
            </select>
          </div>

          {props.dinnerTableEnabled ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Dinner Table</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={cart.dinnerTableId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  run(async () => {
                    await setDinnerTableAction(Number(value));
                    router.refresh();
                  });
                }}
              >
                <option value="">— None —</option>
                {props.dinnerTables.map((table) => (
                  <option key={table.id} value={table.id} disabled={table.status === "occupied"}>
                    {table.name} {table.status === "occupied" ? "(occupied)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <MessageSquare className="h-4 w-4" /> Comment
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              rows={2}
              defaultValue={cart.comment}
              onBlur={(event) =>
                run(async () => {
                  await setCommentAction(event.target.value);
                  router.refresh();
                })
              }
            />
          </div>

          {mode !== "sale" && mode !== "return" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                {mode === "sale_invoice" ? "Invoice #" : mode === "sale_quote" ? "Quote #" : "Work Order #"}{" "}
                <span className="text-xs text-slate-500">({props.invoiceFormat})</span>
              </label>
              <input
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                defaultValue={cart.invoiceNumber || cart.quoteNumber || cart.workOrderNumber || ""}
                onBlur={(event) =>
                  run(async () => {
                    if (mode === "sale_invoice") await setInvoiceNumberAction(event.target.value);
                    else if (mode === "sale_quote") await setQuoteNumberAction(event.target.value);
                    else await setWorkOrderNumberAction(event.target.value);
                    router.refresh();
                  })
                }
                data-testid="document-number-input"
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              defaultChecked={props.emailReceipt}
              onChange={(event) =>
                run(async () => {
                  await setEmailReceiptAction(event.target.checked);
                })
              }
            />
            Email receipt
          </label>
        </div>

        <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CreditCard className="h-4 w-4" /> Payments
          </div>
          {cart.payments.length > 0 ? (
            <div className="space-y-1.5">
              {cart.payments.map((payment) => (
                <div key={payment.paymentType} className="flex justify-between text-sm">
                  <span className="text-slate-600">{payment.paymentType}</span>
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    {money(props.currencySymbol, payment.paymentAmount)}
                    <button
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      onClick={() =>
                        run(async () => {
                          await deletePaymentAction(payment.paymentType);
                          router.refresh();
                        })
                      }
                      aria-label="remove payment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-sm text-slate-600" data-testid="payments-paid">
            <span>Paid</span>
            <span className="font-medium text-slate-900">{money(props.currencySymbol, paidValue)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-slate-900" data-testid="payments-due">
            <span>Due</span>
            <span data-testid="payments-due-value">{money(props.currencySymbol, dueValue)}</span>
          </div>
          {changeValue > 0 ? (
            <div className="flex justify-between text-sm font-medium text-emerald-600" data-testid="payments-change">
              <span>Change</span>
              <span data-testid="payments-change-value">{money(props.currencySymbol, changeValue)}</span>
            </div>
          ) : null}

          <div className="flex gap-2">
            <select
              className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              data-testid="payment-type"
            >
              {props.paymentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder={dueValue.toFixed(2)}
              value={tendered}
              onChange={(event) => setTendered(event.target.value)}
              data-testid="payment-amount"
            />
            <button
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              disabled={pending}
              data-testid="add-payment-button"
              onClick={onAddPayment}
            >
              Pay
            </button>
          </div>
          {referenceRequired ? (
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Reference code"
              value={referenceCode}
              onChange={(event) => setReferenceCode(event.target.value)}
              data-testid="payment-reference"
            />
          ) : null}

          <div className="flex gap-2">
            <button
              className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
              disabled={pending || cart.cart.length === 0}
              onClick={() => run(async () => { await completeSaleAction(); })}
              data-testid="complete-sale-button"
            >
              Complete
            </button>
            <button
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
              disabled={pending || cart.cart.length === 0}
              onClick={() => run(async () => { await suspendAction(); })}
              data-testid="suspend-sale-button"
            >
              <Pause className="h-4 w-4" /> Suspend
            </button>
          </div>
        </div>
      </div>

      {helpOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHelpOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Keyboard shortcuts</h2>
            <ul className="space-y-1 text-sm text-slate-600">
              <li>Enter — add the typed item</li>
              <li>Ctrl+H — toggle this help</li>
            </ul>
            <button
              className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={() => setHelpOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

void showKeyboardShortcutsAction;
