const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const globalForCrypto = globalThis as typeof globalThis & {
  __kbsDevSessionSecret?: string;
};

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available in this runtime.');
  }
  return cryptoObj.subtle;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const buffer = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const buffer = new ArrayBuffer(binary.length);
    const out = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function generateId(): string {
  return globalThis.crypto.randomUUID();
}

export async function hashPassword(password: string): Promise<string> {
  const saltBuffer = new ArrayBuffer(SALT_BYTES);
  const salt = new Uint8Array(saltBuffer);
  globalThis.crypto.getRandomValues(salt);

  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derived = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BITS,
  );

  return `${bytesToHex(salt)}:${bytesToHex(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;

  const salt = hexToBytes(parts[0]);
  const expected = hexToBytes(parts[1]);
  if (!salt || !expected) return false;

  const subtle = getSubtle();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derived = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    expected.length * 8,
  );

  return constantTimeEqual(new Uint8Array(derived), expected);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await getSubtle().digest('SHA-256', encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable must be set in production.');
  }
  if (!globalForCrypto.__kbsDevSessionSecret) {
    const randomBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(randomBytes);
    globalForCrypto.__kbsDevSessionSecret = bytesToHex(randomBytes);
  }
  return globalForCrypto.__kbsDevSessionSecret;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export interface SessionTokenPayload {
  sid: string;
  uid: string;
  exp: number;
}

export async function signSessionToken(payload: SessionTokenPayload): Promise<string> {
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(getSessionSecret());
  const sig = await getSubtle().sign('HMAC', key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSig] = parts;
  const payloadBytes = fromBase64Url(encodedPayload);
  const sigBytes = fromBase64Url(encodedSig);
  if (!payloadBytes || !sigBytes) return null;

  try {
    const key = await importHmacKey(getSessionSecret());
    const valid = await getSubtle().verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;

    const parsed = JSON.parse(decoder.decode(payloadBytes)) as Partial<SessionTokenPayload>;
    if (
      typeof parsed.sid !== 'string' ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp <= Date.now()) {
      return null;
    }
    return {
      sid: parsed.sid,
      uid: parsed.uid,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
