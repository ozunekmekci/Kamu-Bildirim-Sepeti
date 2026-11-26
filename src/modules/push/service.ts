import type { Announcement } from '@/modules/announcements/types';
import { getUserBillingState } from '@/modules/billing';
import type { DatabaseAdapter, PushSubscriptionRecord } from '@/modules/db/types';
import { generateId } from '@/modules/identity/crypto';
import { evaluateAnnouncementMatch } from '@/modules/matching';
import {
  createVapidAuthHeader,
  DEFAULT_VAPID_TTL_SECONDS,
  encryptPushPayload,
} from './vapid';

const DEFAULT_VAPID_SUBJECT = 'mailto:iletisim@kamubildirimsepeti.example';

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
  gone?: boolean;
}

export interface WebPushAdapter {
  readonly providerName: string;
  sendNotification(
    subscription: PushSubscriptionRecord,
    payload: PushNotificationPayload,
  ): Promise<PushSendResult>;
}

export interface VapidWebPushAdapterOptions {
  publicKey: string;
  privateKey: string;
  subject?: string;
  ttlSeconds?: number;
  fetchFn?: typeof fetch;
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

function normalizeVapidSubject(rawSubject?: string): string {
  const trimmed = rawSubject?.trim() || '';
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return DEFAULT_VAPID_SUBJECT;
}

/**
 * Sends RFC 8291 encrypted Web Push notifications signed with RFC 8292 VAPID JWTs.
 */
export class VapidWebPushAdapter implements WebPushAdapter {
  readonly providerName = 'vapid';
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly subject: string;
  private readonly ttlSeconds: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: VapidWebPushAdapterOptions) {
    this.publicKey = options.publicKey.trim();
    this.privateKey = options.privateKey.trim();
    this.subject = normalizeVapidSubject(options.subject);
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_VAPID_TTL_SECONDS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendNotification(
    subscription: PushSubscriptionRecord,
    payload: PushNotificationPayload,
  ): Promise<PushSendResult> {
    if (!this.publicKey || !this.privateKey) {
      return { delivered: false, provider: this.providerName };
    }

    try {
      const encryptedBody = await encryptPushPayload({
        payload: JSON.stringify(payload),
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      });

      const vapidHeaders = await createVapidAuthHeader({
        endpoint: subscription.endpoint,
        subject: this.subject,
        publicKey: this.publicKey,
        privateKey: this.privateKey,
        ttlSeconds: this.ttlSeconds,
      });

      const response = await this.fetchFn(subscription.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidHeaders.Authorization,
          TTL: vapidHeaders.TTL,
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          Urgency: 'normal',
        },
        body: encryptedBody,
      });

      const gone = response.status === 404 || response.status === 410;
      return {
        delivered: response.ok,
        provider: this.providerName,
        statusCode: response.status,
        gone,
      };
    } catch {
      return { delivered: false, provider: this.providerName };
    }
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

/**
 * Creates a VapidWebPushAdapter when both public and private VAPID keys are configured.
 */
export function createWebPushAdapter(
  env: Record<string, string | undefined> = process.env,
  fetchFn?: typeof fetch,
): WebPushAdapter {
  const { configured, publicKey } = getPublicVapidKey(env);
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() || '';

  if (configured && publicKey && privateKey) {
    return new VapidWebPushAdapter({
      publicKey,
      privateKey,
      subject: normalizeVapidSubject(env.VAPID_SUBJECT),
      fetchFn,
    });
  }

  return new NoopWebPushAdapter();
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
): Promise<{ total: number; delivered: number; pruned?: number }> {
  const subscriptions = await db.listPushSubscriptionsByUser(userId);
  let delivered = 0;
  let pruned = 0;

  for (const sub of subscriptions) {
    const res = await adapter.sendNotification(sub, payload);
    if (res.delivered) {
      delivered += 1;
    }
    if (res.gone || res.statusCode === 404 || res.statusCode === 410) {
      const removed = await db.deletePushSubscriptionByEndpoint(userId, sub.endpoint);
      if (removed) {
        pruned += 1;
      }
    }
  }

  return pruned > 0
    ? { total: subscriptions.length, delivered, pruned }
    : { total: subscriptions.length, delivered };
}

/**
 * Dispatches instant Web Push notifications to eligible Premium subscribers for new open announcements.
 */
export async function dispatchPushForNewAnnouncements(
  db: DatabaseAdapter,
  newAnnouncements: Announcement[],
  adapter: WebPushAdapter = new NoopWebPushAdapter(),
  referenceDate = new Date(),
): Promise<{ processedUsers: number; sentCount: number; prunedCount: number }> {
  const usersWithPrefs = await db.listUsersWithNotificationPrefs();
  let processedUsers = 0;
  let sentCount = 0;
  let prunedCount = 0;

  if (newAnnouncements.length === 0) {
    return { processedUsers: usersWithPrefs.length, sentCount: 0, prunedCount: 0 };
  }

  for (const { user, prefs } of usersWithPrefs) {
    processedUsers += 1;
    if (!prefs.instantNewAnnouncements) {
      continue;
    }

    const { entitlements } = await getUserBillingState(db, user.id);
    if (!entitlements.canInstantAlert) {
      continue;
    }

    const subscriptions = await db.listPushSubscriptionsByUser(user.id);
    if (subscriptions.length === 0) {
      continue;
    }

    const profile = prefs.onlyMatchingProfile ? await db.getProfile(user.id) : null;

    for (const announcement of newAnnouncements) {
      if (announcement.status !== 'acik') continue;

      if (prefs.onlyMatchingProfile && profile) {
        const match = evaluateAnnouncementMatch(profile, announcement);
        if (!match.eligible) continue;
      }

      const reminderType = 'push_new_announcement';
      const alreadySent = await db.hasReminderLog(user.id, announcement.id, reminderType);
      if (alreadySent) continue;

      const dispatchRes = await dispatchPushNotification(
        db,
        user.id,
        {
          title: 'Kamu Bildirim Sepeti: Yeni İlan',
          body: `${announcement.institution} - ${announcement.title}`,
          url: `/ilan/${announcement.id}`,
        },
        adapter,
      );

      prunedCount += dispatchRes.pruned ?? 0;

      if (dispatchRes.delivered > 0) {
        await db.recordReminderLog({
          id: generateId(),
          userId: user.id,
          announcementId: announcement.id,
          reminderType,
          sentAt: referenceDate.toISOString(),
        });
        sentCount += dispatchRes.delivered;
      }
    }
  }

  return { processedUsers, sentCount, prunedCount };
}
