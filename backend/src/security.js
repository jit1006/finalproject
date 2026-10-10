// Password hashing (scrypt, from node:crypto — no external bcrypt dependency)
// and opaque session tokens stored only as SHA-256 digests.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const KEYLEN = 64;

export function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, salt, expected] = stored.split("$");
  const derived = scryptSync(plain, salt, KEYLEN);
  const expectedBuf = Buffer.from(expected, "hex");
  return derived.length === expectedBuf.length && timingSafeEqual(derived, expectedBuf);
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}
