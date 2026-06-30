"use client";

import { useState, useTransition } from "react";
import { saveConfigTabAction } from "@/app/(secure)/config/actions";
import type { ConfigTab } from "@/lib/config/tabs";

interface Props {
  tabs: ConfigTab[];
  values: Record<string, string>;
  encryptedValues: Record<string, string>;
}

export default function ConfigTabs({ tabs, values, encryptedValues }: Props) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const tab = tabs.find((t) => t.key === active);

  function submit(fd: FormData) {
    setStatus(null);
    start(() => saveConfigTabAction(active, fd).then(() => setStatus("Saved")).catch((e) => setStatus(`Error: ${(e as Error).message}`)));
  }

  return (
    <div className="p-4 max-w-3xl">
      <h1 className="text-xl mb-3">Configuration</h1>
      <div className="flex gap-1 mb-3 flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} type="button"
            data-testid={`config-tab-${t.key}`}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1 text-sm rounded ${active === t.key ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >{t.label}</button>
        ))}
      </div>
      {status && <div className="text-sm mb-2 p-2 bg-gray-100 rounded">{status}</div>}
      {tab && (
        <form action={submit} className="space-y-3" key={active}>
          {tab.fields.map((f) => {
            const val = f.encrypted ? encryptedValues[f.key] ?? "" : values[f.key] ?? "";
            return (
              <div key={f.key}>
                <label className="block text-sm mb-1">{f.label}</label>
                {f.type === "checkbox" ? (
                  <input type="checkbox" name={f.key} defaultChecked={val === "1"} />
                ) : f.type === "textarea" ? (
                  <textarea name={f.key} defaultValue={val} className="border px-2 py-1 w-full" rows={3} />
                ) : f.type === "select" ? (
                  <select name={f.key} defaultValue={val} className="border px-2 py-1 w-full">
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                    name={f.key} defaultValue={val} placeholder={f.placeholder} className="border px-2 py-1 w-full" />
                )}
              </div>
            );
          })}
          <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="save-config-button">
            {pending ? "Saving…" : `Save ${tab.label}`}
          </button>
        </form>
      )}
    </div>
  );
}