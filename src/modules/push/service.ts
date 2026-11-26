import type { DatabaseAdapter, PushSubscriptionRecord } from '@/modules/db/types';
import { generateId } from '@/modules/identity/crypto';

export class PushError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PushError';
  }
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface SubscribePushInput {
  endpoint: string;
  keys: PushSubscriptionKeys;
  userAgent?: string | null;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSendResult {
  delivered: boolean;
  provider: string;
  statusCode?: number;
}

export interface WebPushAdapter {
  readonly providerName: string;
  sendNotification(
    subscription: PushSubscriptionRecord,
    payload: PushNotificationPayload,
  ): Promise<PushSendResult>;
}

export class NoopWebPushAdapter implements WebPushAdapter {
  readonly providerName = 'noop';

  async sendNotification(
    _subscription: PushSubscriptionRecord,
    _payload: PushNotificationPayload,
  ): Promise<PushSendResult> {
    void _subscription;
    void _payload;
    return { delivered: false, provider: this.providerName };
  }
}

export class InMemoryWebPushAdapter implements WebPushAdapter {
  readonly providerName = 'memory';
  readonly sent: Array<{
    subscription: PushSubscriptionRecord;
    payload: PushNotificationPayload;
  }> = [];

  async sendNotification(
    subscription: PushSubscriptionRecord,
    payload: PushNotificationPayload,
  ): Promise<PushSendResult> {
    this.sent.push({ subscription, payload });
    return { delivered: true, provider: this.providerName, statusCode: 201 };
  }
}

export function getPublicVapidKey(
  env: Record<string, string | undefined> = process.env,
): { configured: boolean; publicKey: string | null } {
  const publicKey =
    env.VAPID_PUBLIC_KEY?.trim() || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || '';
  if (!publicKey) {
    return { configured: false, publicKey: null };
  }
  return { configured: true, publicKey };
}

function validateHttpsEndpoint(rawEndpoint: unknown): string {
  if (typeof rawEndpoint !== 'string') {
    throw new PushError(
      'INVALID_ENDPOINT',
      400,
      'Geçerli bir HTTPS push uç noktası (endpoint) gereklidir.',
    );
  }
  const trimmed = rawEndpoint.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new PushError(
      'INVALID_ENDPOINT',
      400,
      'Geçerli bir HTTPS push uç noktası (endpoint) gereklidir.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PushError(
      'INVALID_ENDPOINT',
      400,
      'Geçerli bir HTTPS push uç noktası (endpoint) gereklidir.',
    );
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new PushError(
      'INVALID_ENDPOINT',
      400,
      'Push uç noktası (endpoint) HTTPS protokolünü kullanmalıdır.',
    );
  }

  return parsed.toString();
}

function validatePushKeys(rawKeys: unknown): PushSubscriptionKeys {
  if (!rawKeys || typeof rawKeys !== 'object' || Array.isArray(rawKeys)) {
    throw new PushError(
      'INVALID_KEYS',
      400,
      'Geçerli push şifreleme anahtarları (p256dh ve auth) gereklidir.',
    );
  }

  const candidate = rawKeys as Record<string, unknown>;
  const p256dh = typeof candidate.p256dh === 'string' ? candidate.p256dh.trim() : '';
  const auth = typeof candidate.auth === 'string' ? candidate.auth.trim() : '';

  if (!p256dh || !auth) {
    throw new PushError(
      'INVALID_KEYS',
      400,
      'Push anahtarları (p256dh ve auth) boş bırakılamaz.',
    );
  }

  return { p256dh, auth };
}

export async function subscribeUserPush(
  db: DatabaseAdapter,
  userId: string,
  input: SubscribePushInput,
): Promise<PushSubscriptionRecord> {
  const endpoint = validateHttpsEndpoint(input?.endpoint);
  const keys = validatePushKeys(input?.keys);
  const rawAgent = typeof input?.userAgent === 'string' ? input.userAgent.trim() : '';
  const userAgent = rawAgent ? rawAgent.slice(0, 512) : null;

  const record: PushSubscriptionRecord = {
    id: generateId(),
    userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent,
    createdAt: new Date().toISOString(),
  };

  return db.upsertPushSubscription(record);
}

export async function unsubscribeUserPush(
  db: DatabaseAdapter,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const trimmed = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (!trimmed) {
    throw new PushError(
      'INVALID_ENDPOINT',
      400,
      'Silinecek push uç noktası (endpoint) gereklidir.',
    );
  }
  return db.deletePushSubscriptionByEndpoint(userId, trimmed);
}

export async function listUserPushSubscriptions(
  db: DatabaseAdapter,
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  return db.listPushSubscriptionsByUser(userId);
}

export async function dispatchPushNotification(
  db: DatabaseAdapter,
  userId: string,
  payload: PushNotificationPayload,
  adapter: WebPushAdapter = new NoopWebPushAdapter(),
): Promise<{ total: number; delivered: number }> {
  const subscriptions = await db.listPushSubscriptionsByUser(userId);
  let delivered = 0;

  for (const sub of subscriptions) {
    const res = await adapter.sendNotification(sub, payload);
    if (res.delivered) {
      delivered += 1;
    }
  }

  return { total: subscriptions.length, delivered };
}
