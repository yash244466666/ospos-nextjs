"use client";

import { useState, useTransition } from "react";
import { saveSupplierAction } from "@/app/(secure)/suppliers/actions";

interface Initial {
  personId: number;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  comments: string | null;
  companyName: string | null;
  agencyName: string | null;
  accountNumber: string | null;
}

export default function SupplierForm({ initial }: { initial: Initial | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="p-4 max-w-2xl space-y-3"
      action={(fd) => {
        setError(null);
        start(() => saveSupplierAction(fd).catch((e) => setError((e as Error).message)));
      }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Supplier</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input type="hidden" name="personId" value={initial?.personId ?? 0} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="First Name" name="firstName" defaultValue={initial?.firstName ?? ""} required />
        <Field label="Last Name" name="lastName" defaultValue={initial?.lastName ?? ""} />
        <Field label="Company" name="companyName" defaultValue={initial?.companyName ?? ""} />
        <Field label="Agency" name="agencyName" defaultValue={initial?.agencyName ?? ""} />
        <Field label="Account #" name="accountNumber" defaultValue={initial?.accountNumber ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={initial?.email ?? ""} />
        <Field label="Phone" name="phoneNumber" defaultValue={initial?.phoneNumber ?? ""} />
        <Field label="Address 1" name="address1" defaultValue={initial?.address1 ?? ""} />
        <Field label="Address 2" name="address2" defaultValue={initial?.address2 ?? ""} />
        <Field label="City" name="city" defaultValue={initial?.city ?? ""} />
        <Field label="State" name="state" defaultValue={initial?.state ?? ""} />
        <Field label="Zip" name="zip" defaultValue={initial?.zip ?? ""} />
        <Field label="Country" name="country" defaultValue={initial?.country ?? ""} />
      </div>
      <div>
        <label className="block text-sm">Comments</label>
        <textarea name="comments" defaultValue={initial?.comments ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function Field({ label, name, type = "text", defaultValue, required }: { label: string; name: string; type?: string; defaultValue?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm">{label}</label>
      <input type={type} name={name} defaultValue={defaultValue} required={required} className="border px-2 py-1 w-full" />
    </div>
  );
}