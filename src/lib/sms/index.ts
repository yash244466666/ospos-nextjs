import { getConfig, getConfigDecrypted } from "@/lib/config";

export interface SendSmsResult { ok: boolean; message: string; }

export async function sendSMS(to: string, body: string): Promise<SendSmsResult> {
  const sid = getConfig("msg_uid", "");
  const token = getConfigDecrypted("msg_pwd", "");
  const src = getConfig("msg_src", "");
  if (!sid || !token || !src) {
    return { ok: false, message: "SMS not configured" };
  }
  try {
    const accountSid = sid;
    const authToken = token;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append("To", to);
    params.append("From", src);
    params.append("Body", body);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, message: `Twilio error: ${res.status} ${err.slice(0, 120)}` };
    }
    return { ok: true, message: "SMS sent" };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "SMS send failed" };
  }
}
