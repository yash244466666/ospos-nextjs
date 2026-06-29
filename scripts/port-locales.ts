// Port OSPOS PHP language files to next-intl JSON.
// Usage: npx tsx scripts/port-locales.ts <locale> [output-dir]
// Reads app/Language/<locale>/*.php and emits src/messages/<locale>/common.json
// merging all PHP $lang['key'] = 'value' lines into one namespace per file.

import fs from "node:fs";
import path from "node:path";

const PHP_ROOT = "/home/yash/ospos/app/Language";
const OUT_ROOT = "/home/yash/ospos-nextjs/src/messages";

const PHP_LINE = /^\s*\$lang\['([^']+)'\]\s*=\s*'(.*)';\s*$/;

function parsePhpFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const m = line.match(PHP_LINE);
    if (m) {
      const key = m[1];
      let value = m[2];
      // Unescape single quotes
      value = value.replace(/\\'/g, "'");
      out[key] = value;
    }
  }
  return out;
}

function portLocale(locale: string) {
  const srcDir = path.join(PHP_ROOT, locale);
  if (!fs.existsSync(srcDir)) {
    console.error(`Locale ${locale} not found at ${srcDir}`);
    process.exit(1);
  }
  const outDir = path.join(OUT_ROOT, locale);
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".php"));
  const merged: Record<string, Record<string, string>> = {};
  for (const file of files) {
    const ns = file.replace(/\.php$/, "").toLowerCase();
    const data = parsePhpFile(path.join(srcDir, file));
    if (Object.keys(data).length > 0) merged[ns] = data;
  }
  // Write as a single common.json (next-intl allows one file per locale)
  fs.writeFileSync(
    path.join(outDir, "common.json"),
    JSON.stringify(merged, null, 2) + "\n"
  );
  console.log(`Ported ${locale}: ${files.length} files → ${outDir}/common.json`);
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: port-locales.ts <locale|all>");
  process.exit(1);
}
if (target === "all") {
  for (const locale of fs.readdirSync(PHP_ROOT).filter((d) => !d.includes(" "))) {
    try { portLocale(locale); } catch (e) { console.warn(`Skip ${locale}: ${(e as Error).message}`); }
  }
} else {
  portLocale(target);
}