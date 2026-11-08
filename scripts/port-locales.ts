/**
 * Port OSPOS PHP language files to next-intl JSON.
 *
 * Usage: npx tsx scripts/port-locales.ts
 *
 * For every `app/Language/<locale>/<File>.php` this writes
 * `src/messages/<locale>/<File>.json` containing the same keys and values.
 * The upstream tree is only read; existing files (including the older
 * `common.json` namespaces) are never deleted.
 *
 * Set OSPOS_LANGUAGE_ROOT to override the upstream location.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePhpLang, PhpLangParseError } from "./lib/php-lang";
import { targetLocaleName } from "./lib/locale-map";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const UPSTREAM_ROOT =
  process.env.OSPOS_LANGUAGE_ROOT ?? "/home/yash/ospos/app/Language";
const OUTPUT_ROOT = path.join(REPO_ROOT, "src", "messages");

interface ConvertedFile {
  upstreamLocale: string;
  targetLocale: string;
  namespace: string;
  messages: Record<string, string>;
}

interface LocaleSummary {
  upstreamLocale: string;
  targetLocale: string;
  files: number;
  keys: number;
}

function main(): void {
  if (!fs.existsSync(UPSTREAM_ROOT)) {
    console.error(`Upstream language directory not found: ${UPSTREAM_ROOT}`);
    process.exit(2);
  }

  const localeEntries = fs
    .readdirSync(UPSTREAM_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (localeEntries.length === 0) {
    console.error(`No locale directories found in ${UPSTREAM_ROOT}`);
    process.exit(2);
  }

  const converted: ConvertedFile[] = [];
  const summaries: LocaleSummary[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  let ignoredNonPhpFiles = 0;

  console.log(`Upstream language root: ${UPSTREAM_ROOT}`);
  console.log(`Output root:            ${OUTPUT_ROOT}`);
  console.log("");

  for (const upstreamLocale of localeEntries) {
    const sourceDir = path.join(UPSTREAM_ROOT, upstreamLocale);
    const targetLocale = targetLocaleName(upstreamLocale);
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

    ignoredNonPhpFiles += entries.filter(
      (entry) => !entry.isFile() || !entry.name.endsWith(".php"),
    ).length;

    const phpFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".php"))
      .map((entry) => entry.name)
      .sort();

    let localeKeys = 0;
    for (const fileName of phpFiles) {
      const relativePath = path.join(upstreamLocale, fileName);
      const absolutePath = path.join(sourceDir, fileName);
      let source: string;
      try {
        source = fs.readFileSync(absolutePath, "utf8");
      } catch (error) {
        failures.push(`${relativePath}: ${(error as Error).message}`);
        continue;
      }

      try {
        const parsed = parsePhpLang(source, relativePath);
        for (const warning of parsed.warnings) {
          warnings.push(`${relativePath}: ${warning}`);
        }
        const namespace = fileName.slice(0, -".php".length);
        converted.push({
          upstreamLocale,
          targetLocale,
          namespace,
          messages: parsed.messages,
        });
        localeKeys += Object.keys(parsed.messages).length;
      } catch (error) {
        if (error instanceof PhpLangParseError) {
          failures.push(error.message);
        } else {
          throw error;
        }
      }
    }

    summaries.push({
      upstreamLocale,
      targetLocale,
      files: phpFiles.length,
      keys: localeKeys,
    });
    const rename =
      upstreamLocale === targetLocale ? "" : ` -> ${targetLocale}`;
    console.log(
      `${upstreamLocale}${rename}: ${phpFiles.length} files, ${localeKeys} keys`,
    );
  }

  const totalFiles = summaries.reduce((sum, summary) => sum + summary.files, 0);
  const totalKeys = summaries.reduce((sum, summary) => sum + summary.keys, 0);

  console.log("");
  console.log(
    `Converted ${summaries.length} locales, ${totalFiles} PHP files, ${totalKeys} keys.`,
  );
  console.log(`Non-PHP files ignored: ${ignoredNonPhpFiles}`);
  console.log(`Parse warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`  WARN ${warning}`);
  console.log(`Parse failures: ${failures.length}`);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  FAIL ${failure}`);
    console.error("Conversion aborted: no JSON was written.");
    process.exit(2);
  }

  for (const file of converted) {
    const outputDir = path.join(OUTPUT_ROOT, file.targetLocale);
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${file.namespace}.json`);
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(file.messages, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(
    `Wrote ${converted.length} JSON files across ${summaries.length} locales.`,
  );
  console.log("Existing files (for example common.json) were left untouched.");
}

main();
