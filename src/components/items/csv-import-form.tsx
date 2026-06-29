"use client";
import { useState, useTransition } from "react";

export function CsvImportForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: number; failed?: number; errors?: string[] } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const res = await fetch("/api/items/csv-import", { method: "POST", body: fd });
      const data = await res.json();
      setResult(data);
    });
  }

  function downloadTemplate() {
    window.open("/api/items/csv-template", "_blank");
  }

  return (
    <div className="space-y-4 bg-white p-6 rounded shadow-sm border border-slate-200 max-w-2xl">
      <div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-100"
        >
          Download CSV Template
        </button>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">CSV File</label>
          <input
            type="file"
            name="file"
            accept=".csv"
            required
            className="border border-slate-300 rounded px-3 py-2 w-full"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isPending ? "Importing..." : "Import"}
        </button>
      </form>
      {result && (
        <div className="border-t pt-3">
          {result.success !== undefined && (
            <p className="text-green-600 text-sm">Imported: {result.success} items</p>
          )}
          {result.failed !== undefined && (
            <p className="text-red-600 text-sm">Failed: {result.failed} rows</p>
          )}
          {result.errors && result.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 list-disc list-inside">
              {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}