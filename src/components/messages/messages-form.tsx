"use client";

import { useState, useTransition } from "react";
import { sendSmsAction } from "@/app/(secure)/messages/actions";

export default function MessagesForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <form className="p-4 max-w-md space-y-3"
      data-testid="messages-form"
      action={(fd) => {
        setResult(null);
        start(() => sendSmsAction(fd).then((r) => setResult(r.message)));
      }}
    >
      <h1 className="text-xl">Send Message</h1>
      {result && <div className="text-sm bg-gray-100 p-2 rounded">{result}</div>}
      <div>
        <label className="block text-sm">Phone</label>
        <input name="phone" className="border px-2 py-1 w-full font-mono" placeholder="+8801XXXXXXXXX" />
      </div>
      <div>
        <label className="block text-sm">Message</label>
        <textarea name="message" rows={4} className="border px-2 py-1 w-full" />
      </div>
      <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50" data-testid="send-button">
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}