import { getRequestConfig } from "next-intl/server";
import { getConfig } from "@/lib/config";

export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const lang = getConfig("language_code", "en") as Locale;
  const safe = locales.includes(lang) ? lang : "en";
  return {
    locale: safe,
    messages: (await import(`@/messages/${safe}/common.json`)).default,
  };
});