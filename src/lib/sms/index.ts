import { getConfig, getConfigDecrypted } from "@/lib/config";

export interface SendSmsResult {
  ok: boolean;
  message: string;
}

/**
 * Upstream `Sms_lib::sendSMS` is a configuration-presence stub: it returns
 * true when username, password, phone, message and originator are all
 * non-empty, without performing any network call. A real gateway is an
 * explicit optional extension (DEV-03), not part of parity.
 */
export async function sendSMS(phone: string, message: string): Promise<SendSmsResult> {
  const username = getConfig("msg_uid", "");
  const password = getConfigDecrypted("msg_pwd", "");
  const originator = getConfig("msg_src", "");
  const configured = Boolean(username && password && phone && message && originator);
  return {
    ok: configured,
    message: configured ? "OK" : "SMS parameters are incomplete",
  };
}
