"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReceivingCart } from "@/lib/receiving/receiving-store";
import {
  addItemAction,
  changeModeAction,
  completeReceivingAction,
  deleteItemAction,
  editItemAction,
  removeSupplierAction,
  requisitionCompleteAction,
  selectSupplierAction,
  setCommentAction,
  setDestinationAction,
  setLocationAction,
  setReferenceAction,
} from "@/app/(secure)/receivings/actions";

interface Props {
  initialCart: ReceivingCart;
  total: string;
  locations: { locationId: number; locationName: string }[];
  suppliers: { supplierId: number; label: string }[];
}

function money(value: string | number): string {
  const numeric = Number(value);
  return `$${Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00"}`;
}

export default function Register(props: Props) {
  const router = useRouter();
  const [itemInput, setItemInput] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paymentType, setPaymentType] = useState("Cash");
  const [pending, startTransition] = useTransition();
  const cart = props.initialCart;

  const run = (task: () => Promise<unknown>) => {
    startTransition(() => {
      void task().then(() => router.refresh());
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <h1 className="text-xl font-semibold text-slate-900">Receiving</h1>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2"
            placeholder="Item name or barcode"
            value={itemInput}
            onChange={(event) => setItemInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && itemInput.trim()) {
                run(() => addItemAction(itemInput.trim(), quantity));
                setItemInput("");
              }
            }}
          />
          <input
            type="number"
            min={0}
            step="any"
            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-2 text-right"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
          <button
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={pending || !itemInput.trim()}
            onClick={() => {
              run(() => addItemAction(itemInput.trim(), quantity));
              setItemInput("");
            }}
          >
            Add
          </button>
        </div>

        <table className="w-full border text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-right">Cost</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Pack Qty</th>
              <th className="p-2 text-right">Disc</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {cart.cart.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  No items yet.
                </td>
              </tr>
            ) : null}
            {cart.cart.map((line) => (
              <tr key={line.line} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{line.name}</div>
                  <div className="text-xs text-slate-500">{line.description}</div>
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                    defaultValue={Number(line.price).toFixed(2)}
                    onBlur={(event) =>
                      run(() => editItemAction(line.line, { price: event.target.value }))
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="any"
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
                    defaultValue={line.quantity}
                    onBlur={(event) =>
                      run(() => editItemAction(line.line, { quantity: event.target.value }))
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  <select
                    className="rounded border border-slate-300 px-2 py-1"
                    defaultValue={line.receivingQuantity}
                    onChange={(event) =>
                      run(() =>
                        editItemAction(line.line, { receivingQuantity: event.target.value }),
                      )
                    }
                  >
                    {Object.entries(line.receivingQuantityChoices).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
                    defaultValue={line.discount}
                    onBlur={(event) =>
                      run(() => editItemAction(line.line, { discount: event.target.value }))
                    }
                  />
                </td>
                <td className="p-2 text-right">{money(line.total)}</td>
                <td className="p-2">
                  <button
                    className="text-red-600"
                    onClick={() => run(() => deleteItemAction(line.line))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-2">
          {(["receive", "return", "requisition"] as const).map((mode) => (
            <button
              key={mode}
              className={`rounded border px-3 py-1 ${
                cart.mode === mode ? "bg-[var(--color-primary)] text-white" : "bg-white"
              }`}
              onClick={() => run(() => changeModeAction(mode))}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="border p-3 text-sm">
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{money(props.total)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2 border p-3">
          <label className="block text-sm">Supplier</label>
          <select
            className="w-full rounded border px-2 py-1"
            value={cart.supplierId}
            onChange={(event) => {
              const value = event.target.value;
              run(() =>
                value ? selectSupplierAction(Number(value)) : removeSupplierAction(),
              );
            }}
          >
            <option value="-1">— None —</option>
            {props.suppliers.map((supplier) => (
              <option key={supplier.supplierId} value={supplier.supplierId}>
                {supplier.label}
              </option>
            ))}
          </select>

          <label className="block text-sm">
            {cart.mode === "requisition" ? "Source location" : "Location"}
          </label>
          <select
            className="w-full rounded border px-2 py-1"
            value={cart.stockSource ?? ""}
            onChange={(event) => run(() => setLocationAction(Number(event.target.value)))}
          >
            {props.locations.map((location) => (
              <option key={location.locationId} value={location.locationId}>
                {location.locationName}
              </option>
            ))}
          </select>

          {cart.mode === "requisition" ? (
            <>
              <label className="block text-sm">Destination location</label>
              <select
                className="w-full rounded border px-2 py-1"
                value={cart.stockDestination ?? ""}
                onChange={(event) =>
                  run(() => setDestinationAction(Number(event.target.value)))
                }
              >
                {props.locations.map((location) => (
                  <option key={location.locationId} value={location.locationId}>
                    {location.locationName}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <label className="block text-sm">Reference</label>
          <input
            className="w-full rounded border px-2 py-1"
            defaultValue={cart.reference}
            onBlur={(event) => run(() => setReferenceAction(event.target.value))}
          />
          <label className="block text-sm">Comment</label>
          <textarea
            className="w-full rounded border px-2 py-1"
            rows={2}
            defaultValue={cart.comment}
            onBlur={(event) => run(() => setCommentAction(event.target.value))}
          />
          <label className="block text-sm">Payment type</label>
          <select
            className="w-full rounded border px-2 py-1"
            value={paymentType}
            onChange={(event) => setPaymentType(event.target.value)}
          >
            {["Cash", "Check", "Debit Card", "Credit Card", "Due", "Bank Transfer", "Wallet"].map(
              (option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ),
            )}
          </select>
          <button
            className="w-full rounded bg-[var(--color-primary)] px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={pending || cart.cart.length === 0}
            onClick={() =>
              run(() =>
                cart.mode === "requisition"
                  ? requisitionCompleteAction(paymentType)
                  : completeReceivingAction(paymentType),
              )
            }
          >
            Complete
          </button>
        </div>
      </div>
    </div>
  );
}
