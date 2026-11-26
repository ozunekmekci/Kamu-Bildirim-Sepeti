import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as cronSyncHandler } from '@/app/api/cron/sync/route';
import type { Announcement } from '@/modules/announcements/types';
import { changeUserPlan } from '@/modules/billing';
import { MemoryDbAdapter, resetMemoryDb } from '@/modules/db';
import { registerUser } from '@/modules/identity';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  createVapidAuthHeader,
  createWebPushAdapter,
  dispatchPushForNewAnnouncements,
  dispatchPushNotification,
  encryptPushPayload,
  generateVapidKeyPair,
  InMemoryWebPushAdapter,
  listUserPushSubscriptions,
  NoopWebPushAdapter,
  subscribeUserPush,
  VapidWebPushAdapter,
} from '@/modules/push';
import { updateNotificationPreferences } from '@/modules/tracking';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(bytes.byteLength);
  const out = new Uint8Array(buf);
  out.set(bytes);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const buf = new ArrayBuffer(total);
  const out = new Uint8Array(buf);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

async function hmacSha256(
  keyBytes: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

async function createClientSubscriptionKeys() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const uaPub = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey));
  const authSecret = new Uint8Array(new ArrayBuffer(16));
  globalThis.crypto.getRandomValues(authSecret);

  return {
    keyPair,
    uaPub,
    authSecret,
    p256dh: bytesToBase64Url(uaPub),
    auth: bytesToBase64Url(authSecret),
  };
}

async function decryptRfc8291Payload(
  encrypted: Uint8Array,
  clientKeys: Awaited<ReturnType<typeof createClientSubscriptionKeys>>,
): Promise<string> {
  expect(encrypted.byteLength).toBeGreaterThan(86);

  const salt = toArrayBufferBytes(encrypted.slice(0, 16));
  const recordSize = new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength).getUint32(
    16,
    false,
  );
  const idLen = encrypted[20];
  expect(recordSize).toBe(4096);
  expect(idLen).toBe(65);

  const asPub = toArrayBufferBytes(encrypted.slice(21, 21 + idLen));
  expect(asPub[0]).toBe(0x04);
  const ciphertext = toArrayBufferBytes(encrypted.slice(21 + idLen));

  const asCryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    asPub,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'ECDH', public: asCryptoKey },
      clientKeys.keyPair.privateKey,
      256,
    ),
  );

  const prkKey = await hmacSha256(clientKeys.authSecret, sharedSecret);
  const keyInfo = concatBytes(
    encoder.encode('WebPush: info\x00'),
    clientKeys.uaPub,
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

  const cekKey = await globalThis.crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const paddedPlaintext = new Uint8Array(
    await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      cekKey,
      ciphertext,
    ),
  );

  // Strip trailing padding zeros and expect final record delimiter 0x02.
  let end = paddedPlaintext.byteLength - 1;
  while (end >= 0 && paddedPlaintext[end] === 0) {
    end -= 1;
  }
  expect(paddedPlaintext[end]).toBe(0x02);
  return decoder.decode(paddedPlaintext.slice(0, end));
}

function makeTestAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'test-ann-phase4-1',
    externalId: 'ext-phase4-1',
    source: 'kariyer_kapisi',
    sourceName: 'Kariyer Kapısı',
    sourceUrl: 'https://isealimkariyerkapisi.cbiko.gov.tr/ilan/test-phase4-1',
    institution: 'Sağlık Bakanlığı',
    title: 'Büro Personeli Alım İlanı',
    category: 'personel_alimi',
    city: 'Ankara',
    status: 'acik',
    publishedAt: '2026-11-25T09:00:00.000Z',
    deadlineAt: '2099-12-31T23:59:59.000Z',
    quota: 25,
    summary: 'Ankara merkez teşkilatında KPSS P3 puanı ile lisans mezunu büro personeli alımı.',
    criteria: {
      educationLevels: ['lisans'],
      kpssScoreTypes: ['P3'],
      minKpssScore: 70,
      cities: ['Ankara'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: ['4001'],
      summaryLines: ['Lisans mezunu', 'KPSS P3 en az 70'],
    },
    ...overrides,
  };
}

describe('Phase 4 RFC 8291 / 8292 Web Push crypto', () => {
  it('encodes and decodes padded and unpadded base64url strings cleanly', () => {
    const sample = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(sample);
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(sample));

    const paddedEncoded = `${encoded}===`.slice(0, encoded.length + ((4 - (encoded.length % 4)) % 4));
    expect(Array.from(base64UrlToBytes(paddedEncoded))).toEqual(Array.from(sample));
  });

  it('generates P-256 VAPID keys and signs ES256 JWTs verifiable with Web Crypto', async () => {
    const keys = await generateVapidKeyPair();
    const pubBytes = base64UrlToBytes(keys.publicKey);
    const privBytes = base64UrlToBytes(keys.privateKey);
    expect(pubBytes.byteLength).toBe(65);
    expect(pubBytes[0]).toBe(0x04);
    expect(privBytes.byteLength).toBe(32);

    const headers = await createVapidAuthHeader({
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-token-123',
      subject: 'mailto:iletisim@kamubildirimsepeti.example',
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      ttlSeconds: 3600,
    });

    expect(headers.TTL).toBe('3600');
    expect(headers.Authorization).toMatch(/^vapid t=[^,]+, k=/);

    const match = headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(match).not.toBeNull();
    const jwt = match![1];
    const headerKey = match![2];
    expect(headerKey).toBe(keys.publicKey);

    const [headerB64, payloadB64, sigB64] = jwt.split('.');
    expect(headerB64).toBeTruthy();
    expect(payloadB64).toBeTruthy();
    expect(sigB64).toBeTruthy();

    const parsedHeader = JSON.parse(decoder.decode(base64UrlToBytes(headerB64))) as {
      typ: string;
      alg: string;
    };
    expect(parsedHeader).toEqual({ typ: 'JWT', alg: 'ES256' });

    const parsedPayload = JSON.parse(decoder.decode(base64UrlToBytes(payloadB64))) as {
      aud: string;
      exp: number;
      sub: string;
    };
    expect(parsedPayload.aud).toBe('https://fcm.googleapis.com');
    expect(parsedPayload.sub).toBe('mailto:iletisim@kamubildirimsepeti.example');
    expect(parsedPayload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const verifyKey = await globalThis.crypto.subtle.importKey(
      'raw',
      pubBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      base64UrlToBytes(sigB64),
      toArrayBufferBytes(encoder.encode(`${headerB64}.${payloadB64}`)),
    );
    expect(valid).toBe(true);
  });

  it('encrypts push payloads per RFC 8291 (aes128gcm) and round-trips through client decryption', async () => {
    const clientKeys = await createClientSubscriptionKeys();
    const payloadJson = JSON.stringify({
      title: 'Kamu Bildirim Sepeti: Yeni İlan',
      body: 'Sağlık Bakanlığı - Büro Personeli Alım İlanı (Şanlıurfa / Çankaya)',
      url: '/ilan/test-123',
    });

    const encrypted = await encryptPushPayload({
      payload: payloadJson,
      p256dh: clientKeys.p256dh,
      auth: clientKeys.auth,
    });

    const decrypted = await decryptRfc8291Payload(encrypted, clientKeys);
    expect(decrypted).toBe(payloadJson);
  });
});

describe('Phase 4 Web Push adapter, pruning, and cron dispatch', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
    vi.unstubAllEnvs();
  });

  it('creates VapidWebPushAdapter or NoopWebPushAdapter via createWebPushAdapter and delivers encrypted HTTP POSTs', async () => {
    expect(createWebPushAdapter({})).toBeInstanceOf(NoopWebPushAdapter);

    const vapidKeys = await generateVapidKeyPair();
    const clientKeys = await createClientSubscriptionKeys();
    const capturedRequests: Array<{ url: string; init: RequestInit }> = [];

    const mockFetch: typeof fetch = async (input, init) => {
      capturedRequests.push({ url: String(input), init: init ?? {} });
      return new Response(null, { status: 201 });
    };

    const adapter = createWebPushAdapter(
      {
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapidKeys.publicKey,
        VAPID_PRIVATE_KEY: vapidKeys.privateKey,
        VAPID_SUBJECT: 'https://kamubildirimsepeti.example/iletisim',
      },
      mockFetch,
    );
    expect(adapter).toBeInstanceOf(VapidWebPushAdapter);
    expect(adapter.providerName).toBe('vapid');

    const result = await adapter.sendNotification(
      {
        id: 'sub-1',
        userId: 'user-1',
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/sub-1',
        p256dh: clientKeys.p256dh,
        auth: clientKeys.auth,
        userAgent: 'TestAgent',
        createdAt: new Date().toISOString(),
      },
      {
        title: 'Kamu Bildirim Sepeti: Yeni İlan',
        body: 'Test Kurumu - Test İlanı',
        url: '/ilan/1',
      },
    );

    expect(result).toEqual({
      delivered: true,
      provider: 'vapid',
      statusCode: 201,
      gone: false,
    });

    expect(capturedRequests).toHaveLength(1);
    const req = capturedRequests[0];
    expect(req.url).toBe('https://updates.push.services.mozilla.com/wpush/v2/sub-1');
    expect(req.init.method).toBe('POST');

    const headers = new Headers(req.init.headers);
    expect(headers.get('Authorization')).toMatch(/^vapid t=[^,]+, k=/);
    expect(headers.get('TTL')).toBe('86400');
    expect(headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(headers.get('Content-Type')).toBe('application/octet-stream');
    expect(headers.get('Urgency')).toBe('normal');

    const bodyBytes = req.init.body as Uint8Array;
    const decrypted = await decryptRfc8291Payload(bodyBytes, clientKeys);
    expect(JSON.parse(decrypted)).toEqual({
      title: 'Kamu Bildirim Sepeti: Yeni İlan',
      body: 'Test Kurumu - Test İlanı',
      url: '/ilan/1',
    });
  });

  it('auto-prunes expired push subscriptions on HTTP 410 and 404 responses', async () => {
    const vapidKeys = await generateVapidKeyPair();
    const clientKeys = await createClientSubscriptionKeys();

    const { user } = await registerUser(db, {
      email: 'prune@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    await subscribeUserPush(db, user.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/active-sub',
      keys: { p256dh: clientKeys.p256dh, auth: clientKeys.auth },
    });
    await subscribeUserPush(db, user.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/gone-sub',
      keys: { p256dh: clientKeys.p256dh, auth: clientKeys.auth },
    });

    const adapter = new VapidWebPushAdapter({
      publicKey: vapidKeys.publicKey,
      privateKey: vapidKeys.privateKey,
      fetchFn: async (input) => {
        const url = String(input);
        if (url.endsWith('gone-sub')) {
          return new Response('Gone', { status: 410 });
        }
        return new Response(null, { status: 201 });
      },
    });

    const dispatchRes = await dispatchPushNotification(
      db,
      user.id,
      { title: 'Kamu Bildirim Sepeti', body: 'Test bildirimi', url: '/ilan/1' },
      adapter,
    );

    expect(dispatchRes).toEqual({ total: 2, delivered: 1, pruned: 1 });
    const remaining = await listUserPushSubscriptions(db, user.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/active-sub');
  });

  it('enforces Premium entitlement, profile matching, noop safety, and deduplication in dispatchPushForNewAnnouncements', async () => {
    const clientKeys = await createClientSubscriptionKeys();

    // 1. Free user with push subscription -> must NOT receive instant alert
    const freeReg = await registerUser(db, {
      email: 'free-push@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await updateNotificationPreferences(db, freeReg.user.id, {
      instantNewAnnouncements: true,
      onlyMatchingProfile: false,
    });
    await subscribeUserPush(db, freeReg.user.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/free-user',
      keys: { p256dh: clientKeys.p256dh, auth: clientKeys.auth },
    });

    // 2. Premium user with matching profile
    const premReg = await registerUser(db, {
      email: 'prem-push@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await changeUserPlan(db, premReg.user.id, 'premium');
    await db.upsertProfile({
      userId: premReg.user.id,
      educationLevel: 'lisans',
      departmentId: null,
      kpssScoreType: 'P3',
      kpssScore: 84,
      residenceCity: 'Ankara',
      militaryStatus: null,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: ['4001'],
      updatedAt: new Date().toISOString(),
    });
    await updateNotificationPreferences(db, premReg.user.id, {
      instantNewAnnouncements: true,
      onlyMatchingProfile: true,
    });
    await subscribeUserPush(db, premReg.user.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/prem-match',
      keys: { p256dh: clientKeys.p256dh, auth: clientKeys.auth },
    });

    // 3. Premium user with non-matching score (55 < 70)
    const nonMatchReg = await registerUser(db, {
      email: 'prem-nomatch@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await changeUserPlan(db, nonMatchReg.user.id, 'premium');
    await db.upsertProfile({
      userId: nonMatchReg.user.id,
      educationLevel: 'lisans',
      departmentId: null,
      kpssScoreType: 'P3',
      kpssScore: 55,
      residenceCity: 'Ankara',
      militaryStatus: null,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: ['4001'],
      updatedAt: new Date().toISOString(),
    });
    await updateNotificationPreferences(db, nonMatchReg.user.id, {
      instantNewAnnouncements: true,
      onlyMatchingProfile: true,
    });
    await subscribeUserPush(db, nonMatchReg.user.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/prem-nomatch',
      keys: { p256dh: clientKeys.p256dh, auth: clientKeys.auth },
    });

    const announcement = makeTestAnnouncement();

    // With NoopWebPushAdapter, nothing is delivered and no reminder_log is written
    const noopRun = await dispatchPushForNewAnnouncements(
      db,
      [announcement],
      new NoopWebPushAdapter(),
    );
    expect(noopRun).toEqual({ processedUsers: 3, sentCount: 0, prunedCount: 0 });
    expect(
      await db.hasReminderLog(premReg.user.id, announcement.id, 'push_new_announcement'),
    ).toBe(false);

    // With active adapter, only matching Premium user receives the push once
    const memAdapter = new InMemoryWebPushAdapter();
    const firstRun = await dispatchPushForNewAnnouncements(db, [announcement], memAdapter);
    expect(firstRun).toEqual({ processedUsers: 3, sentCount: 1, prunedCount: 0 });
    expect(memAdapter.sent).toHaveLength(1);
    expect(memAdapter.sent[0].subscription.userId).toBe(premReg.user.id);
    expect(memAdapter.sent[0].payload).toEqual({
      title: 'Kamu Bildirim Sepeti: Yeni İlan',
      body: 'Sağlık Bakanlığı - Büro Personeli Alım İlanı',
      url: `/ilan/${announcement.id}`,
    });

    // Second run deduplicates via push_new_announcement log
    const secondRun = await dispatchPushForNewAnnouncements(db, [announcement], memAdapter);
    expect(secondRun).toEqual({ processedUsers: 3, sentCount: 0, prunedCount: 0 });
    expect(memAdapter.sent).toHaveLength(1);
  });

  it('dispatches real encrypted Web Push alerts during POST /api/cron/sync and returns pushAlerts', async () => {
    const vapidKeys = await generateVapidKeyPair();
    const clientKeys = await createClientSubscriptionKeys();

    vi.stubEnv('VAPID_PUBLIC_KEY', vapidKeys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', vapidKeys.privateKey);
    vi.stubEnv('VAPID_SUBJECT', 'mailto:iletisim@kamubildirimsepeti.example');

    const reg = await registerUser(db, {
      email: 'cron-push@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await changeUserPlan(db, reg.user.id, 'premium');
    await updateNotificationPreferences(db, reg.user.id, {
      instantNewAnnouncements: true,
      onlyMatchingProfile: false,
    });
    const pushEndpoint = 'https://fcm.googleapis.com/fcm/send/cron-live-sub';
    await subscribeUserPush(db, reg.user.id, {
      endpoint: pushEndpoint,
      keys: { p256dh: clientKeys.p256dh, auth: clientKeys.auth },
    });

    const capturedPushBodies: Uint8Array[] = [];
    const kariyerHtml = `
      <html><body>
        <article class="ilan-card">
          <a href="/ilan/tarim-muhendis-2099">Tarım ve Orman Bakanlığı - Mühendis Alımı</a>
          <p>Lisans mezunu, KPSS P3 en az 75 puan ile Ankara merkez teşkilatına alım. Son başvuru: 20.12.2099</p>
        </article>
      </body></html>
    `;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === pushEndpoint) {
        capturedPushBodies.push(init?.body as Uint8Array);
        return new Response(null, { status: 201 });
      }
      if (url.includes('kariyerkapisi.gov.tr')) {
        return new Response(kariyerHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      throw new Error('Mocked external fetch skip');
    });

    try {
      const response = await cronSyncHandler(
        new Request('http://localhost/api/cron/sync', { method: 'POST' }),
      );
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.syncedCount).toBeGreaterThanOrEqual(1);
      expect(data.pushAlerts).toEqual({
        processedUsers: 1,
        sentCount: 1,
        prunedCount: 0,
      });

      expect(capturedPushBodies).toHaveLength(1);
      const decrypted = await decryptRfc8291Payload(capturedPushBodies[0], clientKeys);
      const parsed = JSON.parse(decrypted) as { title: string; body: string; url: string };
      expect(parsed.title).toBe('Kamu Bildirim Sepeti: Yeni İlan');
      expect(parsed.body).toContain('Mühendis Alımı');
      expect(parsed.url).toMatch(/^\/ilan\//);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
