#!/usr/bin/env node
/**
 * Encrypts data/schedule.json → data/schedule.enc.json
 * Usage: node scripts/encrypt-data.mjs "your-password"
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/encrypt-data.mjs "your-password"');
  process.exit(1);
}

const ITERATIONS = 210_000;

function b64(buf) {
  return Buffer.from(buf).toString("base64");
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

const plaintext = readFileSync(join(root, "data/schedule.json"), "utf8");
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const key = await deriveKey(password, salt);
const ciphertext = await subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  new TextEncoder().encode(plaintext)
);

const payload = {
  v: 1,
  kdf: "PBKDF2-SHA256",
  iter: ITERATIONS,
  salt: b64(salt),
  iv: b64(iv),
  data: b64(ciphertext),
};

writeFileSync(
  join(root, "data/schedule.enc.json"),
  JSON.stringify(payload) + "\n"
);
console.log("Encrypted → data/schedule.enc.json");
console.log("Password:", password);
