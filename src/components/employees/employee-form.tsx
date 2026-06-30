"use client";

import { useState, useTransition } from "react";
import { saveEmployeeAction } from "@/app/(secure)/employees/actions";

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
  username: string;
  language: string | null;
  languageCode: string | null;
  grants?: { permissionId: string }[];
}

interface Perm {
  moduleId: string;
  perms: { permissionId: string; moduleName: string }[];
}

export default function EmployeeForm({ initial, permissions, currentGrants }: { initial: Initial | null; permissions: Perm[]; currentGrants: string[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const grantedSet = new Set(initial?.grants?.map((g) => g.permissionId) ?? currentGrants);
  return (
    <form
      className="p-4 max-w-3xl space-y-3"
      data-testid="entity-form"
      action={(fd) => {
        setError(null);
        start(() => saveEmployeeAction(fd).catch((e) => setError((e as Error).message)));
      }}
    >
      <h1 className="text-xl">{initial ? "Edit" : "New"} Employee</h1>
      {error && <div className="text-red-600 text-sm" data-testid="form-error">{error}</div>}
      <input type="hidden" name="personId" value={initial?.personId ?? 0} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="First Name" name="firstName" defaultValue={initial?.firstName ?? ""} required />
        <Field label="Last Name" name="lastName" defaultValue={initial?.lastName ?? ""} />
        <Field label="Username" name="username" defaultValue={initial?.username ?? ""} required />
        <Field label="Password (blank = unchanged)" name="password" type="password" defaultValue="" />
        <Field label="Email" name="email" type="email" defaultValue={initial?.email ?? ""} />
        <Field label="Phone" name="phoneNumber" defaultValue={initial?.phoneNumber ?? ""} />
        <Field label="Address 1" name="address1" defaultValue={initial?.address1 ?? ""} />
        <Field label="Address 2" name="address2" defaultValue={initial?.address2 ?? ""} />
        <Field label="City" name="city" defaultValue={initial?.city ?? ""} />
        <Field label="State" name="state" defaultValue={initial?.state ?? ""} />
        <Field label="Zip" name="zip" defaultValue={initial?.zip ?? ""} />
        <Field label="Country" name="country" defaultValue={initial?.country ?? ""} />
        <Field label="Language" name="language" defaultValue={initial?.language ?? "en"} />
        <Field label="Language Code" name="languageCode" defaultValue={initial?.languageCode ?? "en-US"} />
      </div>
      <div>
        <label className="block text-sm">Comments</label>
        <textarea name="comments" defaultValue={initial?.comments ?? ""} className="border px-2 py-1 w-full" />
      </div>
      <div>
        <h2 className="font-medium mb-1">Grants</h2>
        <div className="border p-3 max-h-72 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-sm">
          {permissions.map((p) => (
            <div key={p.moduleId} className="col-span-2 md:col-span-3 font-medium mt-1">{p.moduleId}</div>
          ))}
          {permissions.flatMap((p) => p.perms).map((perm) => (
            <label key={perm.permissionId} className="flex items-center gap-1">
              <input type="checkbox" name={`grant_${perm.permissionId}`} defaultChecked={grantedSet.has(perm.permissionId)} />
              <span>{perm.permissionId}</span>
            </label>
          ))}
        </div>
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-button">
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