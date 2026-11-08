import { getConfig, getConfigDecrypted } from "@/lib/config";

export interface MailchimpResult { ok: boolean; message: string; data?: unknown; }

function getDc(apiKey: string): string {
  const parts = apiKey.split("-");
  return parts[1] ?? "us1";
}

async function callMailchimp(method: string, path: string, body?: unknown): Promise<MailchimpResult> {
  const apiKey = getConfigDecrypted("mailchimp_api_key", "");
  if (!apiKey) return { ok: false, message: "Mailchimp not configured" };
  const dc = getDc(apiKey);
  const url = `https://${dc}.api.mailchimp.com/3.0${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `Mailchimp error ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, message: "OK", data };
  } catch (error: unknown) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Mailchimp call failed",
    };
  }
}

export async function getLists(): Promise<MailchimpResult> {
  return callMailchimp("GET", "/lists?count=20");
}

export async function getList(listId: string): Promise<MailchimpResult> {
  return callMailchimp("GET", `/lists/${listId}`);
}

export async function getMembers(listId: string): Promise<MailchimpResult> {
  return callMailchimp("GET", `/lists/${listId}/members?count=100`);
}

export async function getMemberInfo(listId: string, email: string): Promise<MailchimpResult> {
  const hash = await md5Hex(email.toLowerCase());
  return callMailchimp("GET", `/lists/${listId}/members/${hash}`);
}

export async function addMember(listId: string, email: string, mergeFields?: Record<string, unknown>): Promise<MailchimpResult> {
  return callMailchimp("POST", `/lists/${listId}/members`, {
    email_address: email, status: "subscribed", merge_fields: mergeFields ?? {},
  });
}

export async function removeMember(listId: string, email: string): Promise<MailchimpResult> {
  const hash = await md5Hex(email.toLowerCase());
  return callMailchimp("DELETE", `/lists/${listId}/members/${hash}`);
}

export async function updateMember(listId: string, email: string, mergeFields: Record<string, unknown>): Promise<MailchimpResult> {
  const hash = await md5Hex(email.toLowerCase());
  return callMailchimp("PATCH", `/lists/${listId}/members/${hash}`, { merge_fields: mergeFields });
}

export async function addOrUpdateMember(listId: string, email: string, mergeFields: Record<string, unknown>): Promise<MailchimpResult> {
  const hash = await md5Hex(email.toLowerCase());
  return callMailchimp("PUT", `/lists/${listId}/members/${hash}`, {
    email_address: email, status_if_new: "subscribed", merge_fields: mergeFields,
  });
}

async function md5Hex(input: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("md5").update(input).digest("hex");
}
