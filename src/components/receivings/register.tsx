"use client";

import { useState, useTransition } from "react";
import type { ReceivingCart } from "@/lib/receiving/receiving-store";
import {
  addItemAction, editItemAction, deleteItemAction, selectSupplierAction,
  removeSupplierAction, setCommentAction, setInvoiceNumberAction, setReferenceAction,
  setLocationAction, changeModeAction, completeReceivingAction,
} from "@/app/(secure)/receivings/actions";

interface Props {
  initialCart: ReceivingCart;
  totals: { subtotal: number; total: number };
  locations: { locationId: number; locationName: string }[];
  suppliers: { supplierId: number; label: string }[];
}

export default function Register(props: Props) {
  const [itemInput, setItemInput] = useState("");
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();
  const cart = props.initialCart;
  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex gap-2">
          <input
            className="border px-2 py-1 flex-1"
            placeholder="Item name or barcode"
            value={itemInput}
            onChange={(e) => setItemInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && itemInput.trim()) {
                start(() => addItemAction(itemInput.trim(), qty));
                setItemInput("");
              }
            }}
          />
          <input
            type="number"
            className="border px-2 py-1 w-20"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
          />
          <button
            className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
            disabled={pending || !itemInput.trim()}
            onClick={() => { start(() => addItemAction(itemInput.trim(), qty)); setItemInput(""); }}
          >Add</button>
        </div>

        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Cost</th>
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

        <div className="flex gap-2">
          {(["receive", "return"] as const).map((m) => (
            <button
              key={m}
              className={`px-3 py-1 border rounded ${cart.mode === m ? "bg-blue-600 text-white" : ""}`}
              onClick={() => start(() => changeModeAction(m))}
            >{m}</button>
          ))}
        </div>

        <div className="border p-3 text-sm">
          <div className="flex justify-between font-bold"><span>Total</span><span>{props.totals.total.toFixed(2)}</span></div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="border p-3 space-y-2">
          <label className="block text-sm">Supplier</label>
          <select
            className="border px-2 py-1 w-full"
            value={cart.supplierId ?? ""}
            onChange={(e) => { const v = e.target.value; if (v) start(() => selectSupplierAction(parseInt(v, 10))); else start(() => removeSupplierAction()); }}
          >
            <option value="">— None —</option>
            {props.suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.label}</option>)}
          </select>
          <label className="block text-sm">Location</label>
          <select
            className="border px-2 py-1 w-full"
            value={cart.locationId}
            onChange={(e) => start(() => setLocationAction(parseInt(e.target.value, 10)))}
          >
            {props.locations.map((l) => <option key={l.locationId} value={l.locationId}>{l.locationName}</option>)}
          </select>
          <label className="block text-sm">Invoice #</label>
          <input
            className="border px-2 py-1 w-full"
            value={cart.invoiceNumber}
            onChange={(e) => start(() => setInvoiceNumberAction(e.target.value))}
          />
          <label className="block text-sm">Reference</label>
          <input
            className="border px-2 py-1 w-full"
            value={cart.reference}
            onChange={(e) => start(() => setReferenceAction(e.target.value))}
          />
          <label className="block text-sm">Comment</label>
          <textarea
            className="border px-2 py-1 w-full"
            value={cart.comment}
            onChange={(e) => start(() => setCommentAction(e.target.value))}
          />
        </div>

        <button
          className="bg-blue-700 text-white px-4 py-2 rounded w-full disabled:opacity-50"
          disabled={pending || cart.cart.length === 0}
          onClick={() => start(() => completeReceivingAction("cash"))}
        >Complete Receiving</button>
      </div>
    </div>
  );
}