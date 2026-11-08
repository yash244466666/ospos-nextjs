/**
 * Parser for OSPOS PHP language files.
 *
 * Upstream files in `app/Language/<locale>/<File>.php` are PHP scripts of the
 * shape `<?php return ['key' => 'value', ...];`. Some OSPOS-derived trees use
 * the legacy `$lang['key'] = 'value';` assignment form instead; both are
 * accepted here so callers do not need to care which shape a file uses.
 *
 * Values are decoded with PHP string-literal semantics so the emitted JSON
 * matches what PHP would return at runtime:
 *   - single quotes honour only `\\` and `\'`; all other backslashes are literal
 *   - double quotes honour \n \r \t \v \e \f \\ \$ \" \xHH \NNN and \u{...}
 * Comments (`//`, `#`, and block comments) are skipped, which also drops
 * commented-out assignments.
 */

export interface PhpLangParseResult {
  messages: Record<string, string>;
  warnings: string[];
}

export class PhpLangParseError extends Error {
  readonly file?: string;
  readonly line: number;
  readonly column: number;

  constructor(message: string, file: string | undefined, source: string, position: number) {
    const { line, column } = locate(source, position);
    super(`${file === undefined ? "<source>" : file}:${line}:${column}: ${message}`);
    this.name = "PhpLangParseError";
    this.file = file;
    this.line = line;
    this.column = column;
  }
}

function locate(source: string, position: number): { line: number; column: number } {
  const end = Math.max(0, Math.min(position, source.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < end; i++) {
    if (source[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function describeChar(char: string | undefined): string {
  return char === undefined ? "end of file" : JSON.stringify(char);
}

class Scanner {
  readonly source: string;
  pos: number;

  constructor(source: string, pos = 0) {
    this.source = source;
    this.pos = pos;
  }

  get eof(): boolean {
    return this.pos >= this.source.length || this.source.startsWith("?>", this.pos);
  }

  peek(offset = 0): string | undefined {
    return this.source[this.pos + offset];
  }

  advance(count = 1): void {
    this.pos += count;
  }

  /** Consume whitespace and PHP comments. */
  skipTrivia(): void {
    for (;;) {
      const char = this.peek();
      if (char === undefined) return;
      if (this.source.startsWith("?>", this.pos)) return;
      if (/\s/.test(char)) {
        this.pos++;
        continue;
      }
      if (char === "/" && this.peek(1) === "/") {
        this.skipLineComment();
        continue;
      }
      if (char === "#") {
        this.skipLineComment();
        continue;
      }
      if (char === "/" && this.peek(1) === "*") {
        this.skipBlockComment();
        continue;
      }
      return;
    }
  }

  /** True when the next token is `word` and not merely a prefix of a longer word. */
  matches(word: string): boolean {
    if (!this.source.startsWith(word, this.pos)) return false;
    const after = this.source[this.pos + word.length];
    return after === undefined || !/[A-Za-z0-9_$\u0080-￿]/.test(after);
  }

  private skipLineComment(): void {
    while (this.pos < this.source.length) {
      const char = this.source[this.pos];
      this.pos++;
      if (char === "\n") return;
      if (char === "?" && this.source[this.pos] === ">") return;
    }
  }

  private skipBlockComment(): void {
    this.pos += 2;
    while (this.pos < this.source.length) {
      if (this.source.startsWith("*/", this.pos)) {
        this.pos += 2;
        return;
      }
      this.pos++;
    }
  }
}

function readQuotedString(
  scanner: Scanner,
  file: string | undefined,
  warnings: string[],
): string {
  const char = scanner.peek();
  if (char === "'") return readSingleQuoted(scanner, file);
  if (char === '"') return readDoubleQuoted(scanner, file, warnings);
  throw new PhpLangParseError(
    `expected a quoted string, found ${describeChar(char)}`,
    file,
    scanner.source,
    scanner.pos,
  );
}

/** PHP single-quoted semantics: only `\\` and `\'` are escapes. */
function readSingleQuoted(scanner: Scanner, file: string | undefined): string {
  const start = scanner.pos;
  scanner.advance();
  let value = "";
  for (;;) {
    const char = scanner.peek();
    if (char === undefined) {
      throw new PhpLangParseError("unterminated single-quoted string", file, scanner.source, start);
    }
    if (char === "'") {
      scanner.advance();
      return value;
    }
    if (char === "\\") {
      const next = scanner.peek(1);
      if (next === "\\" || next === "'") {
        value += next;
        scanner.advance(2);
      } else {
        value += "\\";
        scanner.advance();
      }
      continue;
    }
    value += char;
    scanner.advance();
  }
}

/** PHP double-quoted semantics, including `\u{...}` code point escapes. */
function readDoubleQuoted(
  scanner: Scanner,
  file: string | undefined,
  warnings: string[],
): string {
  const start = scanner.pos;
  scanner.advance();
  let value = "";
  for (;;) {
    const char = scanner.peek();
    if (char === undefined) {
      throw new PhpLangParseError("unterminated double-quoted string", file, scanner.source, start);
    }
    if (char === '"') {
      scanner.advance();
      return value;
    }
    if (char !== "\\") {
      if (char === "$") {
        const next = scanner.peek(1);
        if (next !== undefined && /[A-Za-z_{\u0080-￿]/.test(next)) {
          warnings.push(
            `${formatLocation(scanner.source, scanner.pos)}: unescaped "$" in a double-quoted string would interpolate in PHP; kept literally`,
          );
        }
      }
      value += char;
      scanner.advance();
      continue;
    }

    const escapeStart = scanner.pos;
    const escape = scanner.peek(1);
    if (escape === undefined) {
      throw new PhpLangParseError("unterminated escape sequence", file, scanner.source, escapeStart);
    }
    switch (escape) {
      case "n":
        value += "\n";
        scanner.advance(2);
        break;
      case "r":
        value += "\r";
        scanner.advance(2);
        break;
      case "t":
        value += "\t";
        scanner.advance(2);
        break;
      case "v":
        value += "\v";
        scanner.advance(2);
        break;
      case "e":
        value += "\x1b";
        scanner.advance(2);
        break;
      case "f":
        value += "\f";
        scanner.advance(2);
        break;
      case "\\":
        value += "\\";
        scanner.advance(2);
        break;
      case "$":
        value += "$";
        scanner.advance(2);
        break;
      case '"':
        value += '"';
        scanner.advance(2);
        break;
      case "x": {
        let digits = "";
        let span = 2;
        while (digits.length < 2) {
          const hex = scanner.peek(span);
          if (hex === undefined || !/[0-9A-Fa-f]/.test(hex)) break;
          digits += hex;
          span++;
        }
        if (digits.length === 0) {
          warnings.push(
            `${formatLocation(scanner.source, escapeStart)}: unsupported escape "\\x"; kept literally`,
          );
          value += "\\x";
          scanner.advance(2);
        } else {
          value += String.fromCharCode(parseInt(digits, 16));
          scanner.advance(span);
        }
        break;
      }
      case "u": {
        if (scanner.peek(2) === "{") {
          let index = 3;
          let digits = "";
          for (;;) {
            const hex = scanner.peek(index);
            if (hex === undefined) {
              throw new PhpLangParseError(
                "unterminated \\u{...} escape",
                file,
                scanner.source,
                escapeStart,
              );
            }
            if (hex === "}") break;
            if (!/[0-9A-Fa-f]/.test(hex)) {
              throw new PhpLangParseError(
                `invalid \\u{...} escape digit ${JSON.stringify(hex)}`,
                file,
                scanner.source,
                escapeStart,
              );
            }
            digits += hex;
            index++;
          }
          if (digits.length === 0) {
            throw new PhpLangParseError("empty \\u{...} escape", file, scanner.source, escapeStart);
          }
          const codePoint = parseInt(digits, 16);
          if (codePoint > 0x10ffff) {
            throw new PhpLangParseError(
              `\\u{${digits}} is outside the Unicode range`,
              file,
              scanner.source,
              escapeStart,
            );
          }
          value += String.fromCodePoint(codePoint);
          scanner.advance(index + 1);
        } else {
          warnings.push(
            `${formatLocation(scanner.source, escapeStart)}: unsupported escape "\\u"; kept literally`,
          );
          value += "\\u";
          scanner.advance(2);
        }
        break;
      }
      default: {
        if (escape >= "0" && escape <= "7") {
          let digits = "";
          let span = 1;
          while (digits.length < 3) {
            const octal = scanner.peek(span);
            if (octal === undefined || octal < "0" || octal > "7") break;
            digits += octal;
            span++;
          }
          value += String.fromCharCode(parseInt(digits, 8) & 0xff);
          scanner.advance(span);
        } else {
          // Unknown escapes keep the backslash, matching PHP.
          value += "\\" + escape;
          scanner.advance(2);
        }
        break;
      }
    }
  }
}

function formatLocation(source: string, position: number): string {
  const { line, column } = locate(source, position);
  return `${line}:${column}`;
}

function readArrayKey(
  scanner: Scanner,
  file: string | undefined,
  warnings: string[],
): string {
  const char = scanner.peek();
  if (char === "'" || char === '"') return readQuotedString(scanner, file, warnings);
  if (char !== undefined && /[A-Za-z_\u0080-￿]/.test(char)) {
    const start = scanner.pos;
    while (!scanner.eof) {
      const current = scanner.peek();
      if (current === undefined || !/[A-Za-z0-9_\u0080-￿]/.test(current)) break;
      scanner.advance();
    }
    const key = scanner.source.slice(start, scanner.pos);
    warnings.push(
      `${formatLocation(scanner.source, start)}: unquoted array key ${JSON.stringify(key)}; PHP would treat it as a constant`,
    );
    return key;
  }
  if (char !== undefined && /[0-9-]/.test(char)) {
    const start = scanner.pos;
    while (!scanner.eof) {
      const current = scanner.peek();
      if (current === undefined || !/[0-9]/.test(current)) break;
      scanner.advance();
    }
    return scanner.source.slice(start, scanner.pos);
  }
  throw new PhpLangParseError(
    `expected an array key, found ${describeChar(char)}`,
    file,
    scanner.source,
    scanner.pos,
  );
}

function expectToken(scanner: Scanner, token: string, file: string | undefined): void {
  scanner.skipTrivia();
  if (!scanner.source.startsWith(token, scanner.pos)) {
    throw new PhpLangParseError(
      `expected ${JSON.stringify(token)}`,
      file,
      scanner.source,
      scanner.pos,
    );
  }
  scanner.advance(token.length);
}

/**
 * One or more quoted literals joined with the PHP `.` concatenation operator.
 */
function readStringExpression(
  scanner: Scanner,
  file: string | undefined,
  warnings: string[],
): string {
  let value = readQuotedString(scanner, file, warnings);
  for (;;) {
    const checkpoint = scanner.pos;
    scanner.skipTrivia();
    if (scanner.peek() !== ".") {
      scanner.pos = checkpoint;
      return value;
    }
    scanner.advance();
    scanner.skipTrivia();
    value += readQuotedString(scanner, file, warnings);
  }
}

function recordMessage(
  messages: Record<string, string>,
  key: string,
  value: string,
  source: string,
  keyPosition: number,
  warnings: string[],
): void {
  if (Object.prototype.hasOwnProperty.call(messages, key)) {
    warnings.push(
      `${formatLocation(source, keyPosition)}: duplicate key ${JSON.stringify(key)}; the later value wins (PHP behaviour)`,
    );
  }
  messages[key] = value;
}

function parseReturnArray(
  scanner: Scanner,
  file: string | undefined,
  warnings: string[],
): Record<string, string> {
  scanner.advance(); // '['
  const messages: Record<string, string> = {};
  for (;;) {
    scanner.skipTrivia();
    if (scanner.eof) {
      throw new PhpLangParseError(
        "unterminated array literal",
        file,
        scanner.source,
        scanner.pos,
      );
    }
    if (scanner.peek() === "]") {
      scanner.advance();
      return messages;
    }
    const keyPosition = scanner.pos;
    const key = readArrayKey(scanner, file, warnings);
    expectToken(scanner, "=>", file);
    scanner.skipTrivia();
    const value = readStringExpression(scanner, file, warnings);
    recordMessage(messages, key, value, scanner.source, keyPosition, warnings);
    scanner.skipTrivia();
    if (scanner.peek() === ",") {
      scanner.advance();
      continue;
    }
    if (scanner.peek() === "]") {
      scanner.advance();
      return messages;
    }
    throw new PhpLangParseError(
      `expected "," or "]" after array element, found ${describeChar(scanner.peek())}`,
      file,
      scanner.source,
      scanner.pos,
    );
  }
}

/**
 * Locate a top-level `return [...]` without being fooled by strings/comments.
 * Returns the position of the opening bracket, or null when absent.
 */
function findReturnArrayStart(scanner: Scanner): number | null {
  const throwawayWarnings: string[] = [];
  while (!scanner.eof) {
    scanner.skipTrivia();
    if (scanner.eof) return null;
    const char = scanner.peek();
    if (char === "'" || char === '"') {
      readQuotedString(scanner, undefined, throwawayWarnings);
      continue;
    }
    if (scanner.matches("return")) {
      scanner.advance("return".length);
      scanner.skipTrivia();
      if (scanner.peek() === "[") return scanner.pos;
      continue;
    }
    if (char !== undefined && /[A-Za-z_$\u0080-￿]/.test(char)) {
      while (!scanner.eof) {
        const current = scanner.peek();
        if (current === undefined || !/[A-Za-z0-9_$\u0080-￿]/.test(current)) break;
        scanner.advance();
      }
      continue;
    }
    scanner.advance();
  }
  return null;
}

/** Legacy `$lang['key'] = 'value';` assignments. */
function parseLangAssignments(
  scanner: Scanner,
  file: string | undefined,
  warnings: string[],
): Record<string, string> {
  const messages: Record<string, string> = {};
  while (!scanner.eof) {
    scanner.skipTrivia();
    if (scanner.eof) break;
    const char = scanner.peek();
    if (char === "'" || char === '"') {
      readQuotedString(scanner, file, warnings);
      continue;
    }
    if (scanner.matches("$lang")) {
      const statementStart = scanner.pos;
      scanner.advance("$lang".length);
      scanner.skipTrivia();
      if (scanner.peek() !== "[") {
        scanner.pos = statementStart;
        scanner.advance();
        continue;
      }
      scanner.advance();
      scanner.skipTrivia();
      const keyPosition = scanner.pos;
      const key = readArrayKey(scanner, file, warnings);
      scanner.skipTrivia();
      if (scanner.peek() !== "]") {
        throw new PhpLangParseError(
          `expected "]" after language key, found ${describeChar(scanner.peek())}`,
          file,
          scanner.source,
          scanner.pos,
        );
      }
      scanner.advance();
      scanner.skipTrivia();
      if (scanner.peek() !== "=" || scanner.peek(1) === "=") {
        throw new PhpLangParseError(
          `expected "=" after $lang[...], found ${describeChar(scanner.peek())}`,
          file,
          scanner.source,
          scanner.pos,
        );
      }
      scanner.advance();
      scanner.skipTrivia();
      const value = readStringExpression(scanner, file, warnings);
      recordMessage(messages, key, value, scanner.source, keyPosition, warnings);
      scanner.skipTrivia();
      if (scanner.peek() === ";") scanner.advance();
      continue;
    }
    scanner.advance();
  }
  return messages;
}

/**
 * Parse a single OSPOS language file.
 *
 * @param source PHP source text.
 * @param file Optional file label used in error messages.
 * @returns decoded key/value pairs plus non-fatal anomalies.
 * @throws {PhpLangParseError} when the file has no recognisable structure.
 */
export function parsePhpLang(source: string, file?: string): PhpLangParseResult {
  const warnings: string[] = [];
  let start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const openTag = /^<\?php(?:\s|$)/.exec(source.slice(start));
  if (openTag !== null) start += openTag[0].length;

  const scanner = new Scanner(source, start);
  const arrayStart = findReturnArrayStart(scanner);
  if (arrayStart !== null) {
    scanner.pos = arrayStart;
    return { messages: parseReturnArray(scanner, file, warnings), warnings };
  }

  scanner.pos = start;
  const messages = parseLangAssignments(scanner, file, warnings);
  if (Object.keys(messages).length === 0) {
    throw new PhpLangParseError(
      "no `return [...]` array or `$lang[...] = ...` assignments found",
      file,
      source,
      start,
    );
  }
  return { messages, warnings };
}
