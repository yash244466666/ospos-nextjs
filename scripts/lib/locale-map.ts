/**
 * Upstream OSPOS language directory name -> target `src/messages` directory.
 * `hr` is the only renamed locale: the port uses the `hr-HR` tag.
 */
const LOCALE_DIRECTORY_MAP: Readonly<Record<string, string>> = {
  hr: "hr-HR",
};

export function targetLocaleName(upstreamLocale: string): string {
  return LOCALE_DIRECTORY_MAP[upstreamLocale] ?? upstreamLocale;
}
