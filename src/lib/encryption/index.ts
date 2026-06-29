import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;

function getEnvPath(): string {
  return path.resolve(process.cwd(), ".env");
}

function ensureKey(): string {
  let key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 64 || !/^[0-9a-f]+$/.test(key)) {
    key = randomBytes(32).toString("hex");
    const envPath = getEnvPath();
    const envContent = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf-8")
      : "";
    const backupPath = path.resolve(process.cwd(), ".env.backup");
    if (fs.existsSync(envPath)) fs.copyFileSync(envPath, backupPath);
    const replaced = envContent.replace(
      /^ENCRYPTION_KEY=.*$/m,
      `ENCRYPTION_KEY=${key}`
    );
    const next = envContent.includes("ENCRYPTION_KEY=")
      ? replaced
      : `${envContent}\nENCRYPTION_KEY=${key}\n`;
    fs.writeFileSync(envPath, next, { mode: 0o640 });
    process.env.ENCRYPTION_KEY = key;
  }
  return key;
}

function deriveKey(): Buffer {
  const hex = ensureKey();
  return scryptSync(hex, "ospos-salt", KEY_LEN);
}

export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid ciphertext");
  const key = deriveKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}

void ensureKey;