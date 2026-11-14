import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/** Two-step sign-in for staff: six-digit codes from an authenticator app (RFC 6238, 30 s, SHA-1). */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(key: Buffer, counter: number): string {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(b).digest();
  const o = h[h.length - 1] & 0xf;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

/** True when the code matches now, or 30 seconds either side (phone clocks drift). */
export function verifyTotp(secret: string, token: string): boolean {
  const key = base32Decode(secret);
  const clean = token.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const t = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((w) => hotp(key, t + w) === clean);
}

export function otpauthUrl(label: string, secret: string): string {
  const issuer = "Special Minds Community";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
