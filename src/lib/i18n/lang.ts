import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";

/**
 * OSPOS language keys are `<File>.<key>` (e.g. `Items.category`). Locale files
 * live in `src/messages/<locale>/<File>.json`; the English base is the
 * fallback, matching CI4's `lang()` lookup.
 */

const cache = new Map<string, Record<string, string> | null>();

function loadNamespace(locale: string, namespace: string): Record<string, string> | null {
  const cacheKey = `${locale}:${namespace}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
  const file = path.resolve(process.cwd(), "src", "messages", locale, `${namespace}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
    cache.set(cacheKey, parsed);
    return parsed;
  } catch {
    cache.set(cacheKey, null);
    return null;
  }
}

function interpolate(template: string, args?: Record<string, string | number>): string {
  if (!args) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    args[key] !== undefined ? String(args[key]) : match,
  );
}

export function lang(key: string, args?: Record<string, string | number>): string {
  const dot = key.indexOf(".");
  if (dot < 0) return key;
  const namespace = key.slice(0, dot);
  const name = key.slice(dot + 1);
  const locale = getConfig("language_code", "en");
  const message =
    loadNamespace(locale, namespace)?.[name] ??
    loadNamespace("en", namespace)?.[name];
  return message !== undefined ? interpolate(message, args) : key;
}

export function languageIsRtl(locale: string): boolean {
  return ["ar", "ar-EG", "ar-LB", "ckb", "fa", "he", "ur"].includes(locale);
}
