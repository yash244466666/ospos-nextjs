"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import type { SaleCart } from "@/lib/sale/types";
import type { SaleTaxGroup, ItemTax } from "@/lib/tax";
import type { ItemRow } from "@/lib/items/repository";
import {
  addItemAction, suggestItemsAction, editItemAction, deleteItemAction, selectCustomerAction,
  removeCustomerAction, changeModeAction, addPaymentAction, deletePaymentAction,
  setCommentAction, setInvoiceNumberAction, completeSaleAction, suspendAction,
  setLocationAction, setDinnerTableAction, setEmailReceiptAction, getGiftcardAction,
  showKeyboardShortcutsAction,
} from "@/app/(secure)/sales/actions";
import { Search, Plus, Trash2, CreditCard, User, MapPin, MessageSquare, HelpCircle, Calculator, Receipt, ShoppingCart, Pause, Check, Briefcase, RotateCcw } from "lucide-react";

interface Props {
  initialCart: SaleCart;
  taxes: SaleTaxGroup[];
  itemTaxes: ItemTax[];
  totals: ReturnType<typeof import("@/lib/sale/types").getCartTotals>;
  locations: { locationId: number; locationName: string }[];
  customers: { customerId: number; label: string; balance: number }[];
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

const MODE_CONFIG: { key: Props["initialCart"]["mode"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "sale", label: "POS Sale", icon: ShoppingCart },
  { key: "sale_invoice", label: "Invoice", icon: Receipt },
  { key: "sale_quote", label: "Quote", icon: Briefcase },
  { key: "sale_work_order", label: "Work Order", icon: Check },
  { key: "return", label: "Return", icon: RotateCcw },
];

export default function Register(props: Props) {
  const [itemInput, setItemInput] = useState("");
  const [suggestions, setSuggestions] = useState<ItemRow[]>([]);
  const [qty, setQty] = useState(1);
  const [paymentType, setPaymentType] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [mode, setMode] = useState<Props["initialCart"]["mode"]>(props.initialCart.mode);
  const [pending, start] = useTransition();
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Props["customers"]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const refresh = useCallback(() => {
    start(async () => {
      // server-driven revalidation placeholder
    });
  }, [start]);

  useEffect(() => {
    const term = itemInput.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      start(async () => {
        const items = await suggestItemsAction(term);
        setSuggestions(items);
      });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [itemInput]);

  useEffect(() => {
    if (customerSearch.trim().length < 2) {
      setCustomerResults(props.customers);
      return;
    }
    const t = customerSearch.toLowerCase();
    setCustomerResults(props.customers.filter((c) => c.label.toLowerCase().includes(t)));
  }, [customerSearch, props.customers]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cart = props.initialCart;
  const total = props.totals.total;
  const paid = cart.payments.filter((p) => p.paymentType !== "cash_adjustment").reduce((s, p) => s + p.paymentAmount, 0);
  const due = Math.max(0, total - paid);
  const change = paid > total ? paid - total : 0;

  const onAdd = (raw: string, q: number) => {
    start(async () => {
      await addItemAction(raw, q);
      setItemInput("");
      setSuggestions([]);
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Point of Sale</h1>
          <div className="flex-1" />
          <button
            onClick={() => setHelpOpen(true)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Keyboard shortcuts"
            title="Ctrl+H"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              placeholder="Scan barcode or type item name..."
              value={itemInput}
              onChange={(e) => setItemInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && itemInput.trim()) onAdd(itemInput.trim(), qty); }}
              data-testid="item-input"
            />
            {suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-72 overflow-auto">
                {suggestions.map((item) => (
                  <button
                    key={item.itemId}
                    type="button"
                    className="block w-full px-4 py-3 text-left text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
                    onClick={() => onAdd(String(item.itemId), qty)}
                  >
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">
                      {item.itemNumber ?? "No barcode"} · {props.currencySymbol}{(item.unitPrice ?? 0).toFixed(2)} · stock {item.receivingQuantity ?? "—"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              className="w-24 border border-slate-300 rounded-lg px-3 py-2.5 text-right bg-white"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
            />
            <button
              className="bg-[var(--color-accent)] hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
              disabled={pending || !itemInput.trim()}
              onClick={() => onAdd(itemInput.trim(), qty)}
              data-testid="add-item-button"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
          <table className="w-full text-sm" data-testid="cart-table">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-3 text-left font-medium text-slate-700">Item</th>
                <th className="p-3 text-right font-medium text-slate-700">Price</th>
                <th className="p-3 text-right font-medium text-slate-700">Qty</th>
                <th className="p-3 text-right font-medium text-slate-700">Disc %</th>
                <th className="p-3 text-right font-medium text-slate-700">Total</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {cart.cart.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No items yet. Scan or search to add.
                  </td>
                </tr>
              )}
              {cart.cart.map((l) => (
                <tr key={l.line} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors" data-testid={`cart-row-${l.line}`}>
                  <td className="p-3">
                    <div className="font-medium text-slate-900" data-testid={`cart-item-name-${l.line}`}>{l.itemName}</div>
                    {l.description && <div className="text-xs text-slate-500">{l.description}</div>}
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 border border-slate-300 rounded px-2 py-1 text-right bg-white"
                      value={l.price.toFixed(2)}
                      onChange={(e) => start(() => editItemAction(l.line, { price: parseFloat(e.target.value) || 0 }))}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      className="w-20 border border-slate-300 rounded px-2 py-1 text-right bg-white"
                      value={l.quantity}
                      onChange={(e) => start(() => editItemAction(l.line, { quantity: parseFloat(e.target.value) || 0 }))}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      className="w-20 border border-slate-300 rounded px-2 py-1 text-right bg-white"
                      value={l.discount}
                      onChange={(e) => start(() => editItemAction(l.line, { discount: parseFloat(e.target.value) || 0 }))}
                    />
                  </td>
                  <td className="p-3 text-right font-medium text-slate-900" data-testid={`cart-row-total-${l.line}`}>{props.currencySymbol}{l.total.toFixed(2)}</td>
                  <td className="p-3">
                    <button
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      onClick={() => start(() => deleteItemAction(l.line))}
                      aria-label="remove line"
                      data-testid={`cart-row-delete-${l.line}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          {MODE_CONFIG.map((m) => (
            <button
              key={m.key}
              data-testid={`mode-${m.key}`}
              onClick={() => { setMode(m.key); start(() => changeModeAction(m.key)); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === m.key
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <m.icon className="w-4 h-4" />
              {m.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm p-5 max-w-sm ml-auto">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600" data-testid="totals-subtotal"><span>Subtotal</span><span className="font-medium text-slate-900">{props.currencySymbol}{props.totals.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-slate-600" data-testid="totals-discount"><span>Discount</span><span className="font-medium text-slate-900">{props.currencySymbol}{props.totals.itemDiscount.toFixed(2)}</span></div>
            {props.taxes.map((t) => (
              <div key={t.taxGroup} className="flex justify-between text-slate-600" data-testid={`tax-${t.taxGroup}`}><span>Tax {t.taxGroup}</span><span className="font-medium text-slate-900">{props.currencySymbol}{t.saleTaxAmount.toFixed(2)}</span></div>
            ))}
            <div className="flex justify-between text-lg font-semibold border-t border-slate-200 pt-2 text-slate-900" data-testid="totals-total">
              <span>Total</span><span data-testid="totals-total-value">{props.currencySymbol}{total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-96 space-y-5">
        <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><User className="w-4 h-4" /> Customer</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              placeholder="Search customer…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={cart.customerId ?? ""}
              onChange={(e) => { const v = e.target.value; if (v) start(() => selectCustomerAction(parseInt(v, 10))); else start(() => removeCustomerAction()); }}
            >
              <option value="">— Walk-in —</option>
              {customerResults.map((c) => <option key={c.customerId} value={c.customerId}>{c.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Location</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={cart.locationId}
              onChange={(e) => start(() => setLocationAction(parseInt(e.target.value, 10)))}
            >
              {props.locations.map((l) => <option key={l.locationId} value={l.locationId}>{l.locationName}</option>)}
            </select>
          </div>

          {props.dinnerTableEnabled && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Dinner Table</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                value={cart.dinnerTableId ?? ""}
                onChange={(e) => { const v = e.target.value; if (!v) return; start(() => setDinnerTableAction(parseInt(v, 10))); }}
              >
                <option value="">— None —</option>
                {props.dinnerTables.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.status === "occupied"}>{t.name} {t.status === "occupied" ? "(occupied)" : ""}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Comment</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              rows={2}
              value={cart.comment}
              onChange={(e) => start(() => setCommentAction(e.target.value))}
            />
          </div>

          {(mode === "sale_invoice" || mode === "sale_quote" || mode === "sale_work_order") && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Number ({props.invoiceFormat})</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                value={cart.invoiceNumber ?? cart.quoteNumber ?? cart.workOrderNumber ?? ""}
                onChange={(e) => start(() => setInvoiceNumberAction(e.target.value))}
                data-testid="document-number-input"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={props.emailReceipt}
              onChange={(e) => start(() => setEmailReceiptAction(e.target.checked))}
            />
            Email receipt
          </label>
        </div>

        <div className="bg-white rounded-xl border border-[var(--color-border)] shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CreditCard className="w-4 h-4" /> Payments
          </div>
          {cart.payments.length > 0 && (
            <div className="space-y-1.5">
              {cart.payments.map((p) => (
                <div key={p.paymentId} className="flex justify-between text-sm">
                  <span className="text-slate-600">{p.paymentType}</span>
                  <span className="font-medium text-slate-900 flex items-center gap-2">
                    {props.currencySymbol}{p.paymentAmount.toFixed(2)}
                    <button
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      onClick={() => start(() => deletePaymentAction(p.paymentId))}
                      aria-label="remove payment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between text-sm text-slate-600 border-t border-slate-100 pt-2" data-testid="payments-paid">
            <span>Paid</span><span className="font-medium text-slate-900">{props.currencySymbol}{paid.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-slate-900" data-testid="payments-due">
            <span>Due</span><span data-testid="payments-due-value">{props.currencySymbol}{due.toFixed(2)}</span>
          </div>
          {change > 0 && (
            <div className="flex justify-between text-sm text-emerald-600 font-medium" data-testid="payments-change">
              <span>Change</span><span data-testid="payments-change-value">{props.currencySymbol}{change.toFixed(2)}</span>
            </div>
          )}

          <div className="flex gap-2">
            <select
              className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              data-testid="payment-type"
            >
              {props.paymentOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              type="number"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              placeholder={due.toFixed(2)}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              data-testid="payment-amount"
            />
            <button
              className="bg-[var(--color-accent)] hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              disabled={pending}
              data-testid="add-payment-button"
              onClick={() => {
                const amt = tendered ? parseFloat(tendered) : due;
                if (paymentType === "giftcard") {
                  const num = window.prompt("Enter gift card number:");
                  if (num) start(async () => {
                    const gc = await getGiftcardAction(num);
                    if (gc) await addPaymentAction("giftcard", Math.min(gc.value, amt));
                  });
                  setTendered("");
                  return;
                }
                start(() => addPaymentAction(paymentType, amt));
                setTendered("");
              }}
            >
              Pay
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
            disabled={pending || cart.cart.length === 0}
            onClick={() => start(() => suspendAction())}
            data-testid="suspend-sale-button"
          >
            <Pause className="w-4 h-4" /> Suspend
          </button>
          <button
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[var(--color-accent)] hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors"
            disabled={pending || cart.cart.length === 0}
            onClick={() => start(() => completeSaleAction())}
            data-testid="complete-sale-button"
          >
            <Calculator className="w-4 h-4" /> Complete
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setHelpOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[var(--color-accent)]" /> Keyboard Shortcuts
            </h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-2 font-medium text-slate-700">Ctrl + H</td><td className="py-2 text-slate-600">Show this help</td></tr>
                <tr><td className="py-2 font-medium text-slate-700">Enter (item field)</td><td className="py-2 text-slate-600">Add item</td></tr>
                <tr><td className="py-2 font-medium text-slate-700">Esc</td><td className="py-2 text-slate-600">Close dialog</td></tr>
              </tbody>
            </table>
            <button className="mt-5 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-medium transition-colors" onClick={() => setHelpOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
