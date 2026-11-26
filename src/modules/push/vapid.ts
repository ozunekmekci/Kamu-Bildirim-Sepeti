const encoder = new TextEncoder();

export const DEFAULT_VAPID_TTL_SECONDS = 86_400;
const DEFAULT_VAPID_EXPIRATION_SECONDS = 12 * 3600;
const AES128GCM_RECORD_SIZE = 4096;
const MAX_SINGLE_RECORD_PAYLOAD_BYTES = AES128GCM_RECORD_SIZE - 16 - 1;

export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface CreateVapidAuthHeaderOptions {
  endpoint: string;
  subject: string;
  publicKey: string;
  privateKey: string;
  ttlSeconds?: number;
  expirationSec?: number;
}

export interface VapidAuthHeaders {
  Authorization: string;
  TTL: string;
}

export interface EncryptPushPayloadOptions {
  payload: string | Uint8Array;
  p256dh: string;
  auth: string;
}

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available in this runtime.');
  }
  return cryptoObj.subtle;
}

function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const out = new Uint8Array(buffer);
  out.set(bytes);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let totalLength = 0;
  for (const part of parts) {
    totalLength += part.byteLength;
  }
  const buffer = new ArrayBuffer(totalLength);
  const out = new Uint8Array(buffer);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function padLeft32(bytes: Uint8Array, label: string): Uint8Array<ArrayBuffer> {
  if (bytes.byteLength === 32) {
    return toArrayBufferBytes(bytes);
  }
  if (bytes.byteLength > 32) {
    throw new Error(`${label} en fazla 32 bayt olabilir.`);
  }
  const buffer = new ArrayBuffer(32);
  const out = new Uint8Array(buffer);
  out.set(bytes, 32 - bytes.byteLength);
  return out;
}

/**
 * Encodes raw bytes to unpadded base64url per RFC 7515 / RFC 8292.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Decodes padded or unpadded base64url strings into an ArrayBuffer-backed Uint8Array.
 */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const trimmed = value.trim();
  if (!trimmed) {
    return new Uint8Array(new ArrayBuffer(0));
  }
  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/g, '');
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]+$/.test(normalized)) {
    throw new Error('Geçersiz base64url kodlaması.');
  }
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function normalizeEcdsaSignature(signature: Uint8Array): Uint8Array<ArrayBuffer> {
  if (signature.byteLength === 64) {
    return toArrayBufferBytes(signature);
  }

  // Fallback for runtimes that return ASN.1 DER instead of IEEE P1363 raw r||s.
  if (signature.byteLength >= 8 && signature[0] === 0x30) {
    let offset = 2;
    if (signature[1] & 0x80) {
      const lengthBytes = signature[1] & 0x7f;
      offset = 2 + lengthBytes;
    }
    if (signature[offset] !== 0x02) {
      throw new Error('Geçersiz DER ECDSA imza biçimi (r).');
    }
    const rLen = signature[offset + 1];
    const rStart = offset + 2;
    const rRaw = signature.slice(rStart, rStart + rLen);
    const sTagOffset = rStart + rLen;
    if (signature[sTagOffset] !== 0x02) {
      throw new Error('Geçersiz DER ECDSA imza biçimi (s).');
    }
    const sLen = signature[sTagOffset + 1];
    const sStart = sTagOffset + 2;
    const sRaw = signature.slice(sStart, sStart + sLen);

    const trimSignZero = (coord: Uint8Array): Uint8Array =>
      coord.byteLength > 32 && coord[0] === 0x00 ? coord.slice(1) : coord;

    const r = padLeft32(trimSignZero(rRaw), 'ECDSA r bileşeni');
    const s = padLeft32(trimSignZero(sRaw), 'ECDSA s bileşeni');
    return concatBytes(r, s);
  }

  throw new Error(`Beklenmeyen ECDSA imza uzunluğu: ${signature.byteLength}`);
}

async function hmacSha256(
  keyBytes: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

/**
 * Generates an uncompressed P-256 VAPID key pair using standard Web Crypto.
 */
export async function generateVapidKeyPair(): Promise<VapidKeyPair> {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const rawPublic = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  if (rawPublic.byteLength !== 65 || rawPublic[0] !== 0x04) {
    throw new Error('Oluşturulan VAPID açık anahtarı 65 bayt sıkıştırılmamış biçimde olmalıdır.');
  }

  const privateJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  if (!privateJwk.d) {
    throw new Error('Oluşturulan VAPID özel anahtarı dışa aktarılamadı.');
  }
  const privateBytes = padLeft32(base64UrlToBytes(privateJwk.d), 'VAPID özel anahtarı');

  return {
    publicKey: bytesToBase64Url(rawPublic),
    privateKey: bytesToBase64Url(privateBytes),
  };
}

/**
 * Builds RFC 8292 VAPID Authorization and TTL headers signed with ES256.
 */
export async function createVapidAuthHeader(
  options: CreateVapidAuthHeaderOptions,
): Promise<VapidAuthHeaders> {
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(options.endpoint.trim());
  } catch {
    throw new Error('VAPID imzası için geçerli bir push endpoint URL gereklidir.');
  }

  if (parsedEndpoint.protocol !== 'https:' && parsedEndpoint.protocol !== 'http:') {
    throw new Error('Push endpoint HTTP/HTTPS protokolüne sahip olmalıdır.');
  }

  const subject = options.subject.trim();
  if (!subject || (!subject.startsWith('mailto:') && !subject.startsWith('https://'))) {
    throw new Error('VAPID subject değeri mailto: veya https:// ile başlamalıdır.');
  }

  const publicBytes = base64UrlToBytes(options.publicKey);
  if (publicBytes.byteLength !== 65 || publicBytes[0] !== 0x04) {
    throw new Error('VAPID publicKey 65 bayt (0x04||x||y) olmalıdır.');
  }

  const privateBytes = base64UrlToBytes(options.privateKey);
  if (privateBytes.byteLength !== 32) {
    throw new Error('VAPID privateKey 32 bayt olmalıdır.');
  }

  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const d = bytesToBase64Url(privateBytes);

  const subtle = getSubtle();
  const signingKey = await subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const exp =
    options.expirationSec !== undefined
      ? Math.floor(options.expirationSec)
      : nowSec + DEFAULT_VAPID_EXPIRATION_SECONDS;

  const jwtHeader = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const jwtPayload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: parsedEndpoint.origin,
        exp,
        sub: subject,
      }),
    ),
  );

  const signingInput = `${jwtHeader}.${jwtPayload}`;
  const signatureBuffer = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    toArrayBufferBytes(encoder.encode(signingInput)),
  );
  const rawSignature = normalizeEcdsaSignature(new Uint8Array(signatureBuffer));
  const jwt = `${signingInput}.${bytesToBase64Url(rawSignature)}`;
  const normalizedPublicKey = bytesToBase64Url(publicBytes);

  const ttl =
    options.ttlSeconds !== undefined
      ? Math.max(0, Math.floor(options.ttlSeconds))
      : DEFAULT_VAPID_TTL_SECONDS;

  return {
    Authorization: `vapid t=${jwt}, k=${normalizedPublicKey}`,
    TTL: String(ttl),
  };
}

/**
 * Encrypts a push message using RFC 8291 (aes128gcm) content encoding.
 */
export async function encryptPushPayload(
  options: EncryptPushPayloadOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPub = base64UrlToBytes(options.p256dh);
  if (uaPub.byteLength !== 65 || uaPub[0] !== 0x04) {
    throw new Error('Abone p256dh anahtarı 65 bayt sıkıştırılmamış P-256 anahtarı olmalıdır.');
  }

  const authSecret = base64UrlToBytes(options.auth);
  if (authSecret.byteLength !== 16) {
    throw new Error('Abone auth anahtarı 16 bayt olmalıdır.');
  }

  const payloadBytes =
    typeof options.payload === 'string'
      ? toArrayBufferBytes(encoder.encode(options.payload))
      : toArrayBufferBytes(options.payload);

  if (payloadBytes.byteLength > MAX_SINGLE_RECORD_PAYLOAD_BYTES) {
    throw new Error(
      `Push yükü tek aes128gcm kaydı sınırını (${MAX_SINGLE_RECORD_PAYLOAD_BYTES} bayt) aşıyor.`,
    );
  }

  const subtle = getSubtle();
  const ephemeralKeys = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );

  const asPub = new Uint8Array(await subtle.exportKey('raw', ephemeralKeys.publicKey));
  if (asPub.byteLength !== 65 || asPub[0] !== 0x04) {
    throw new Error('Geçici ECDH açık anahtar uzunluğu geçersiz.');
  }

  const uaCryptoKey = await subtle.importKey(
    'raw',
    uaPub,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const sharedBits = await subtle.deriveBits(
    { name: 'ECDH', public: uaCryptoKey },
    ephemeralKeys.privateKey,
    256,
  );
  const sharedSecret = new Uint8Array(sharedBits);

  const salt = new Uint8Array(new ArrayBuffer(16));
  globalThis.crypto.getRandomValues(salt);

  // RFC 8291 Section 3.3 / 3.4 key derivation via HKDF-SHA256
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const keyInfo = concatBytes(
    encoder.encode('WebPush: info\x00'),
    uaPub,
    asPub,
    new Uint8Array([0x01]),
  );
  const ikm = (await hmacSha256(prkKey, keyInfo)).slice(0, 32);

  const prk = await hmacSha256(salt, ikm);
  const cek = (
    await hmacSha256(prk, toArrayBufferBytes(encoder.encode('Content-Encoding: aes128gcm\x00\x01')))
  ).slice(0, 16);
  const nonce = (
    await hmacSha256(prk, toArrayBufferBytes(encoder.encode('Content-Encoding: nonce\x00\x01')))
  ).slice(0, 12);

  const paddedPlaintext = concatBytes(payloadBytes, new Uint8Array([0x02]));
  const cekKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        tagLength: 128,
      },
      cekKey,
      paddedPlaintext,
    ),
  );

  const header = new Uint8Array(new ArrayBuffer(16 + 4 + 1 + 65));
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, AES128GCM_RECORD_SIZE, false);
  header[20] = 65;
  header.set(asPub, 21);

  return concatBytes(header, ciphertext);
}
