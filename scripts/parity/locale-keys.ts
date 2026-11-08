/**
 * Locale key parity check.
 *
 * Usage: npx tsx scripts/parity/locale-keys.ts
 *
 * For every upstream `app/Language/<locale>/<File>.php`, asserts that
 * `src/messages/<mapped-locale>/<File>.json` exists and has exactly the same
 * key set and values. Exits non-zero on any missing file, missing key, extra
 * key, wrong value type, or value mismatch.
 *
 * The additive `bn` locale and legacy `common.json` files are ignored: this
 * check is driven entirely by the upstream locale/file list.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePhpLang, PhpLangParseError } from "../lib/php-lang";
import { targetLocaleName } from "../lib/locale-map";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const UPSTREAM_ROOT =
  process.env.OSPOS_LANGUAGE_ROOT ?? "/home/yash/ospos/app/Language";
const MESSAGES_ROOT = path.join(REPO_ROOT, "src", "messages");

const MAX_REPORTED_ERRORS = 100;

interface FileExpectation {
  upstreamLocale: string;
  targetLocale: string;
  namespace: string;
}

function readJsonObject(
  filePath: string,
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return { ok: false, error: `cannot read: ${(error as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${(error as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "JSON root is not an object" };
  }
  const record = parsed as Record<string, unknown>;
  const value: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "string") {
      return {
        ok: false,
        error: `key ${JSON.stringify(key)} has non-string value ${typeof entry}`,
      };
    }
    value[key] = entry;
  }
  return { ok: true, value };
}

function main(): void {
  if (!fs.existsSync(UPSTREAM_ROOT)) {
    console.error(`Upstream language directory not found: ${UPSTREAM_ROOT}`);
    process.exit(2);
  }
  if (!fs.existsSync(MESSAGES_ROOT)) {
    console.error(`Generated messages directory not found: ${MESSAGES_ROOT}`);
    process.exit(2);
  }

  const upstreamLocales = fs
    .readdirSync(UPSTREAM_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const expectations: FileExpectation[] = [];
  const parseFailures: string[] = [];

  for (const upstreamLocale of upstreamLocales) {
    const sourceDir = path.join(UPSTREAM_ROOT, upstreamLocale);
    const phpFiles = fs
      .readdirSync(sourceDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".php"))
      .map((entry) => entry.name)
      .sort();
    for (const fileName of phpFiles) {
      expectations.push({
        upstreamLocale,
        targetLocale: targetLocaleName(upstreamLocale),
        namespace: fileName.slice(0, -".php".length),
      });
    }
  }

  const errors: string[] = [];
  let missingFiles = 0;
  let missingKeys = 0;
  let extraKeys = 0;
  let valueMismatches = 0;
  let checkedKeys = 0;

  for (const expectation of expectations) {
    const relativePath = path.join(
      expectation.upstreamLocale,
      `${expectation.namespace}.php`,
    );
    let upstream: Record<string, string>;
    try {
      const source = fs.readFileSync(
        path.join(
          UPSTREAM_ROOT,
          expectation.upstreamLocale,
          `${expectation.namespace}.php`,
        ),
        "utf8",
      );
      upstream = parsePhpLang(source, relativePath).messages;
    } catch (error) {
      if (error instanceof PhpLangParseError) {
        parseFailures.push(error.message);
      } else {
        throw error;
      }
      continue;
    }

    const jsonPath = path.join(
      MESSAGES_ROOT,
      expectation.targetLocale,
      `${expectation.namespace}.json`,
    );
    const generated = readJsonObject(jsonPath);
    if (!generated.ok) {
      missingFiles++;
      errors.push(`${jsonPath}: ${generated.error}`);
      continue;
    }

    checkedKeys += Object.keys(upstream).length;

    for (const key of Object.keys(upstream)) {
      if (!Object.prototype.hasOwnProperty.call(generated.value, key)) {
        missingKeys++;
        errors.push(
          `${jsonPath}: missing key ${JSON.stringify(key)} (upstream ${relativePath})`,
        );
      } else if (generated.value[key] !== upstream[key]) {
        valueMismatches++;
        errors.push(
          `${jsonPath}: value mismatch for ${JSON.stringify(key)}\n` +
            `    upstream:  ${JSON.stringify(upstream[key])}\n` +
            `    generated: ${JSON.stringify(generated.value[key])}`,
        );
      }
    }
    for (const key of Object.keys(generated.value)) {
      if (!Object.prototype.hasOwnProperty.call(upstream, key)) {
        extraKeys++;
        errors.push(`${jsonPath}: extra key ${JSON.stringify(key)}`);
      }
    }
  }

  // Informational: additive locales/files that exist only in the target.
  const expectedTargetLocales = new Set(
    upstreamLocales.map((locale) => targetLocaleName(locale)),
  );
  const targetLocales = fs
    .readdirSync(MESSAGES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const additiveLocales = targetLocales.filter(
    (locale) => !expectedTargetLocales.has(locale),
  );

  const expectedNamespacesByLocale = new Map<string, Set<string>>();
  for (const expectation of expectations) {
    let set = expectedNamespacesByLocale.get(expectation.targetLocale);
    if (set === undefined) {
      set = new Set<string>();
      expectedNamespacesByLocale.set(expectation.targetLocale, set);
    }
    set.add(`${expectation.namespace}.json`);
  }
  let ignoredCommonJson = 0;
  const otherJsonFiles: string[] = [];
  for (const targetLocale of targetLocales) {
    const expected = expectedNamespacesByLocale.get(targetLocale);
    const jsonFiles = fs
      .readdirSync(path.join(MESSAGES_ROOT, targetLocale), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
    for (const fileName of jsonFiles) {
      if (expected?.has(fileName) === true) continue;
      if (fileName === "common.json") {
        ignoredCommonJson++;
        continue;
      }
      otherJsonFiles.push(path.join(targetLocale, fileName));
    }
  }

  console.log("Locale key parity check");
  console.log(`Upstream:  ${UPSTREAM_ROOT}`);
  console.log(`Generated: ${MESSAGES_ROOT}`);
  console.log(`Locales:               ${upstreamLocales.length}`);
  console.log(`Files:                 ${expectations.length}`);
  console.log(`Keys checked:          ${checkedKeys}`);
  console.log(`Upstream parse errors: ${parseFailures.length}`);
  console.log(`Missing files:         ${missingFiles}`);
  console.log(`Missing keys:          ${missingKeys}`);
  console.log(`Extra keys:            ${extraKeys}`);
  console.log(`Value mismatches:      ${valueMismatches}`);
  console.log(
    `Ignored additive locales: ${additiveLocales.length === 0 ? "none" : additiveLocales.join(", ")}`,
  );
  console.log(`Ignored common.json files: ${ignoredCommonJson}`);
  if (otherJsonFiles.length > 0) {
    console.log(
      `Other generated JSON files (not part of upstream): ${otherJsonFiles.join(", ")}`,
    );
  }

  for (const failure of parseFailures) console.error(`  PARSE ${failure}`);
  const reported = errors.slice(0, MAX_REPORTED_ERRORS);
  for (const error of reported) console.error(`  FAIL ${error}`);
  if (errors.length > reported.length) {
    console.error(`  ... ${errors.length - reported.length} more error(s)`);
  }

  if (
    parseFailures.length > 0 ||
    missingFiles > 0 ||
    missingKeys > 0 ||
    extraKeys > 0 ||
    valueMismatches > 0
  ) {
    console.error(
      `FAIL: locale parity check found ${parseFailures.length + errors.length} problem(s).`,
    );
    process.exit(1);
  }

  console.log(
    "PASS: every upstream locale/file has exactly the same keys and values.",
  );
}

main();
