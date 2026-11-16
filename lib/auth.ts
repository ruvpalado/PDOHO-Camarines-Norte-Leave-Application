// Uses the standard Web Crypto API (globalThis.crypto.subtle) instead of Node's
// `crypto` module so this file works unmodified in both the Edge runtime
// (middleware.ts) and the Node.js runtime (API routes).

export const SESSION_COOKIE_NAME = 'lm_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET environment variable is not set. Add it in the Vercel project settings.'
    );
  }
  return secret;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = '';
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const str = atob(padded);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function hmacSignB64(payloadB64: string): Promise<string> {
  const key = await hmacKey();
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return toBase64Url(sigBuf);
}

export async function createSessionCookieValue(username: string): Promise<string> {
  const payload = JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const sig = await hmacSignB64(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionCookieValue(
  value: string | undefined | null
): Promise<{ u: string } | null> {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let expectedSig: string;
  try {
    expectedSig = await hmacSignB64(payloadB64);
  } catch {
    return null;
  }

  if (sig.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const payloadJson = new TextDecoder().decode(fromBase64Url(payloadB64));
    const payload = JSON.parse(payloadJson);
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    if (typeof payload.u !== 'string') return null;
    return { u: payload.u };
  } catch {
    return null;
  }
}

// Admin credential checking, seeding, and password-reset logic now live in
// lib/adminUsers.ts (DB-backed, Node-runtime only) since they need @vercel/postgres.
// This file stays free of that import so middleware.ts (which runs on the Edge
// runtime and only needs verifySessionCookieValue) never pulls in a Postgres client.
