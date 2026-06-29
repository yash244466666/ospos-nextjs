"use client";

import { useEffect, useState, useTransition } from "react";
import type { SaleCart } from "@/lib/sale/types";
import type { SaleTaxGroup, ItemTax } from "@/lib/tax";
import type { ItemRow } from "@/lib/items/repository";
import {
  addItemAction, suggestItemsAction, editItemAction, deleteItemAction, selectCustomerAction,
  removeCustomerAction, changeModeAction, addPaymentAction, deletePaymentAction,
  setCommentAction, setInvoiceNumberAction, completeSaleAction, suspendAction,
  setLocationAction,
} from "@/app/(secure)/sales/actions";

interface Props {
  initialCart: SaleCart;
  taxes: SaleTaxGroup[];
  itemTaxes: ItemTax[];
  totals: ReturnType<typeof import("@/lib/sale/types").getCartTotals>;
  locations: { locationId: number; locationName: string }[];
  customers: { customerId: number; label: string }[];
  invoiceFormat: string;
  taxIncluded: boolean;
  dinnerTableEnabled: boolean;
  currencySymbol: string;
}

export default function Register(props: Props) {
  const [itemInput, setItemInput] = useState("");
  const [suggestions, setSuggestions] = useState<ItemRow[]>([]);
  const [qty, setQty] = useState(1);
  const [paymentType, setPaymentType] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const term = itemInput.trim();
    if (!term) {
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

  const cart = props.initialCart;
  const total = props.totals.total;
  const paid = cart.payments.filter((p) => p.paymentType !== "cash_adjustment").reduce((s, p) => s + p.paymentAmount, 0);
  const due = Math.max(0, total - paid);

  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              className="border px-2 py-1 w-full"
              placeholder="Item name or barcode"
              value={itemInput}
              onChange={(e) => setItemInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && itemInput.trim()) {
                  start(() => addItemAction(itemInput.trim(), qty));
                  setItemInput("");
                  setSuggestions([]);
                }
              }}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg">
                {suggestions.map((item) => (
                  <button
                    key={item.itemId}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      start(() => addItemAction(String(item.itemId), qty));
                      setItemInput("");
                      setSuggestions([]);
                    }}
                  >
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.itemNumber ?? "No barcode"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="number"
            className="border px-2 py-1 w-20"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
          />
          <button
            className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
            disabled={pending || !itemInput.trim()}
            onClick={() => { start(() => addItemAction(itemInput.trim(), qty)); setItemInput(""); setSuggestions([]); }}
          >Add</button>
        </div>

        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Price</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Disc</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {cart.cart.map((l) => (
              <tr key={l.line} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{l.itemName}</div>
                  <div className="text-xs text-gray-500">{l.description}</div>
                </td>
                <td className="p-2 text-right">{l.price.toFixed(2)}</td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    className="w-16 border px-1 text-right"
                    value={l.quantity}
                    onChange={(e) => start(() => editItemAction(l.line, { quantity: parseFloat(e.target.value) || 0 }))}
                  />
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    className="w-16 border px-1 text-right"
                    value={l.discount}
                    onChange={(e) => start(() => editItemAction(l.line, { discount: parseFloat(e.target.value) || 0 }))}
                  />
                </td>
                <td className="p-2 text-right">{l.total.toFixed(2)}</td>
                <td className="p-2"><button className="text-red-600" onClick={() => start(() => deleteItemAction(l.line))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-2 flex-wrap">
          {(["sale", "sale_invoice", "sale_quote", "sale_work_order", "return"] as const).map((m) => (
            <button
              key={m}
              className={`px-3 py-1 border rounded ${cart.mode === m ? "bg-blue-600 text-white" : ""}`}
              onClick={() => start(() => changeModeAction(m))}
            >{m.replace("sale_", "").replace("_", " ")}</button>
          ))}
        </div>

        <div className="border p-3 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{props.totals.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>{props.totals.itemDiscount.toFixed(2)}</span></div>
          {props.taxes.map((t) => (
            <div key={t.taxGroup} className="flex justify-between"><span>Tax {t.taxGroup}</span><span>{t.saleTaxAmount.toFixed(2)}</span></div>
          ))}
          <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{props.currencySymbol}{total.toFixed(2)}</span></div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="border p-3 space-y-2">
          <label className="block text-sm">Customer</label>
          <select
            className="border px-2 py-1 w-full"
            value={cart.customerId ?? ""}
            onChange={(e) => { const v = e.target.value; if (v) start(() => selectCustomerAction(parseInt(v, 10))); else start(() => removeCustomerAction()); }}
          >
            <option value="">— Walk-in —</option>
            {props.customers.map((c) => <option key={c.customerId} value={c.customerId}>{c.label}</option>)}
          </select>
          <label className="block text-sm">Location</label>
          <select
            className="border px-2 py-1 w-full"
            value={cart.locationId}
            onChange={(e) => start(() => setLocationAction(parseInt(e.target.value, 10)))}
          >
            {props.locations.map((l) => <option key={l.locationId} value={l.locationId}>{l.locationName}</option>)}
          </select>
          <label className="block text-sm">Comment</label>
          <textarea
            className="border px-2 py-1 w-full"
            value={cart.comment}
            onChange={(e) => start(() => setCommentAction(e.target.value))}
          />
          {cart.mode === "sale_invoice" && (
            <>
              <label className="block text-sm">Invoice # ({props.invoiceFormat})</label>
              <input
                className="border px-2 py-1 w-full"
                value={cart.invoiceNumber}
                onChange={(e) => start(() => setInvoiceNumberAction(e.target.value))}
              />
            </>
          )}
        </div>

        <div className="border p-3 space-y-2">
          <div className="text-sm font-medium">Payments</div>
          {cart.payments.map((p) => (
            <div key={p.paymentId} className="flex justify-between text-sm">
              <span>{p.paymentType}</span>
              <span>{p.paymentAmount.toFixed(2)} <button className="text-red-600" onClick={() => start(() => deletePaymentAction(p.paymentId))}>×</button></span>
            </div>
          ))}
          <div className="flex justify-between text-sm"><span>Paid</span><span>{paid.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm font-bold"><span>Due</span><span>{due.toFixed(2)}</span></div>
          <div className="flex gap-2">
            <select className="border px-1 py-1" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
              <option value="check">Check</option>
              <option value="due">Due</option>
              <option value="bank_transfer">Transfer</option>
            </select>
            <input
              type="number"
              className="border px-2 py-1 flex-1"
              placeholder={due.toFixed(2)}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
            />
            <button
              className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
              disabled={pending}
              onClick={() => { const amt = tendered ? parseFloat(tendered) : due; start(() => addPaymentAction(paymentType, amt)); setTendered(""); }}
            >Pay</button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="bg-gray-600 text-white px-4 py-2 rounded flex-1 disabled:opacity-50"
            disabled={pending || cart.cart.length === 0}
            onClick={() => start(() => suspendAction())}
          >Suspend</button>
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded flex-1 disabled:opacity-50"
            disabled={pending || cart.cart.length === 0}
            onClick={() => start(() => completeSaleAction())}
          >Complete</button>
        </div>
      </div>
    </div>
  );
}