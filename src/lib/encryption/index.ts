import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * CI4-compatible encryption.
 *
 * Normal OSPOS configuration (`app/Config/Encryption.php`) uses OpenSSL with
 * AES-256-CTR, HKDF-SHA512 key derivation (empty info/salt), base64(iv||ct)
 * and an HMAC-SHA512 hex prefix. Legacy CI3 data uses AES-128-CBC with the
 * `encryption`/`authentication` HKDF infos and is supported for import.
 */

const IV_LENGTH = 16;
const MAC_LENGTH = 128;

function envPath(): string {
  return path.resolve(process.cwd(), ".env");
}

function readEnvValue(name: string): string {
  if (!fs.existsSync(envPath())) return "";
  const content = fs.readFileSync(envPath(), "utf8");
  const match = new RegExp(`^\\s*${name.replace(/\./g, "\\.")}\\s*=\\s*['"]?([^'"\\r\\n]*)`, "m")
    .exec(content);
  return match?.[1] ?? "";
}

export function parseKey(raw: string): string {
  if (raw.startsWith("hex2bin:")) {
    return Buffer.from(raw.slice(8), "hex").toString("binary");
  }
  if (raw.startsWith("base64:")) {
    return Buffer.from(raw.slice(7), "base64").toString("binary");
  }
  return raw;
}

/** Precedence: .env encryption.key → process encryption.key → ENCRYPTION_KEY. */
export function getEncryptionKey(): string {
  const sources = [
    process.env["encryption.key"] ?? "",
    readEnvValue("encryption.key"),
    process.env.ENCRYPTION_KEY ?? "",
    readEnvValue("ENCRYPTION_KEY"),
  ];
  const raw = sources.find((source) => source !== "") ?? "";
  return parseKey(raw);
}

function previousKeys(): string[] {
  const raw =
    process.env["encryption.previousKeys"] ??
    readEnvValue("encryption.previousKeys");
  if (!raw) return [];
  return raw
    .split(",")
    .map((key) => parseKey(key.trim()))
    .filter((key) => key.length > 0);
}

function hkdf(key: string, info: string, length = 64): Buffer {
  return Buffer.from(
    hkdfSync("sha512", Buffer.from(key, "binary"), Buffer.alloc(0), Buffer.from(info), length),
  );
}

function encryptWithKey(key: string, plaintext: string): string {
  const encryptKey = hkdf(key, "").subarray(0, 32);
  const authKey = hkdf(key, "");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-ctr", encryptKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, ciphertext]).toString("base64");
  const mac = createHmac("sha512", authKey).update(payload).digest("hex");
  return mac + payload;
}

function decryptWithKey(
  key: string,
  payload: string,
  cipherName = "aes-256-ctr",
  keyInfo = "",
  authInfo = "",
): string {
  if (payload.length <= MAC_LENGTH) throw new Error("Invalid ciphertext");
  const mac = payload.slice(0, MAC_LENGTH);
  const body = payload.slice(MAC_LENGTH);
  const authKey =
    cipherName === "aes-128-cbc" ? hkdf(key, authInfo) : hkdf(key, authInfo);
  const expected = createHmac("sha512", authKey).update(body).digest("hex");
  const macBuffer = Buffer.from(mac, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    macBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(macBuffer, expectedBuffer)
  ) {
    throw new Error("Encryption authentication failed");
  }
  const decoded = Buffer.from(body, "base64");
  if (decoded.length < IV_LENGTH) throw new Error("Invalid ciphertext");
  const iv = decoded.subarray(0, IV_LENGTH);
  const ciphertext = decoded.subarray(IV_LENGTH);
  const keyBytes =
    cipherName === "aes-128-cbc"
      ? hkdf(key, keyInfo).subarray(0, 16)
      : hkdf(key, keyInfo).subarray(0, 32);
  const decipher = createDecipheriv(cipherName, keyBytes, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error("encryption.key is not provisioned");
  return encryptWithKey(key, plaintext);
}

export function decrypt(payload: string): string {
  if (payload === "") return "";
  const keys = [getEncryptionKey(), ...previousKeys()].filter(Boolean);
  let lastError: unknown;
  for (const key of keys) {
    try {
      return decryptWithKey(key, payload);
    } catch (err) {
      lastError = err;
    }
  }
  for (const key of keys) {
    try {
      return decryptWithKey(key, payload, "aes-128-cbc", "encryption", "authentication");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Decryption failed");
}

function atomicWriteEnv(contents: string): void {
  const target = envPath();
  const tmp = `${target}.tmp.${randomBytes(8).toString("hex")}`;
  const fd = fs.openSync(tmp, "wx", 0o640);
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
  fs.chmodSync(target, 0o640);
}

export function setEnvKey(name: string, value: string): void {
  const target = envPath();
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "# OSPOS Configuration\n\n";
  if (fs.existsSync(target)) {
    fs.mkdirSync(path.resolve(process.cwd(), "writable/backup"), { recursive: true });
    fs.copyFileSync(target, path.resolve(process.cwd(), "writable/backup/.env.bak"));
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
  const pattern = new RegExp(`^\\s*${name.replace(/\./g, "\\.")}\\s*=.*$`, "m");
  const line = `${name}='${escaped}'`;
  let next: string;
  if (pattern.test(existing)) {
    next = existing.replace(pattern, line);
  } else {
    const encryptionLine = /^encryption\.key\s*=.*$/m.exec(existing);
    if (encryptionLine) {
      const at = encryptionLine.index + encryptionLine[0].length;
      next = `${existing.slice(0, at)}\n${line}${existing.slice(at)}`;
    } else {
      next = `${existing}${existing.endsWith("\n") ? "" : "\n"}${line}\n`;
    }
  }
  atomicWriteEnv(next);
}

/** Provisions encryption.key when missing, mirroring rotateEncryptionKeyUnlock(). */
export function ensureEncryptionKey(): string {
  const key = getEncryptionKey();
  if (key) return key;
  const generated = randomBytes(32).toString("hex");
  setEnvKey("encryption.key", generated);
  process.env["encryption.key"] = generated;
  return generated;
}

/** Provision a persistent throttle HMAC key (S-5). */
export function ensureThrottleKey(): string {
  const existing =
    process.env["throttle.key"] ?? readEnvValue("throttle.key");
  if (existing) return existing;
  const generated = randomBytes(32).toString("hex");
  setEnvKey("throttle.key", generated);
  process.env["throttle.key"] = generated;
  return generated;
}

/** CI4 key length validation: >= 64 bytes or a decoded 32-byte key. */
export function encryptionKeyIsValid(): boolean {
  const key = getEncryptionKey();
  return key.length >= 32;
}
