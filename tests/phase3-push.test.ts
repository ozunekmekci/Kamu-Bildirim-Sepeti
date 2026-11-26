import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import {
  DELETE as deletePushSubscriptionHandler,
  GET as getPushSubscriptionsHandler,
  POST as postPushSubscriptionHandler,
} from '@/app/api/push/subscriptions/route';
import { GET as getVapidKeyHandler } from '@/app/api/push/vapid-key/route';
import { D1Adapter, MemoryDbAdapter, resetMemoryDb } from '@/modules/db';
import type { D1DatabaseLike, D1PreparedStatementLike } from '@/modules/db/d1-adapter';
import { registerUser } from '@/modules/identity';
import {
  dispatchPushNotification,
  getPublicVapidKey,
  InMemoryWebPushAdapter,
  listUserPushSubscriptions,
  NoopWebPushAdapter,
  PushError,
  subscribeUserPush,
  unsubscribeUserPush,
} from '@/modules/push';

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/kbs_session=([^;]+)/);
  return match ? `kbs_session=${match[1]}` : '';
}

function jsonRequest(url: string, method: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (cookie) {
    headers.Cookie = cookie;
  }
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Phase 3 push service and adapters', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
    vi.unstubAllEnvs();
  });

  it('resolves VAPID public key configuration safely', () => {
    expect(getPublicVapidKey({})).toEqual({ configured: false, publicKey: null });
    expect(getPublicVapidKey({ VAPID_PUBLIC_KEY: '   ' })).toEqual({
      configured: false,
      publicKey: null,
    });
    expect(getPublicVapidKey({ VAPID_PUBLIC_KEY: '  vapid-pub-123  ' })).toEqual({
      configured: true,
      publicKey: 'vapid-pub-123',
    });
    expect(getPublicVapidKey({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'next-pub-456' })).toEqual({
      configured: true,
      publicKey: 'next-pub-456',
    });
  });

  it('validates HTTPS endpoint and keys, enforces user ownership, and cleans up on deleteUser', async () => {
    const userA = await registerUser(db, {
      email: 'push-a@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    const userB = await registerUser(db, {
      email: 'push-b@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    await expect(
      subscribeUserPush(db, userA.user.id, {
        endpoint: 'http://push.example.com/sub/1',
        keys: { p256dh: 'key-1', auth: 'auth-1' },
      }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_ENDPOINT' });

    await expect(
      subscribeUserPush(db, userA.user.id, {
        endpoint: 'not-a-url',
        keys: { p256dh: 'key-1', auth: 'auth-1' },
      }),
    ).rejects.toBeInstanceOf(PushError);

    await expect(
      subscribeUserPush(db, userA.user.id, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: '   ', auth: 'auth-1' },
      }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_KEYS' });

    const created = await subscribeUserPush(db, userA.user.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256dh-val', auth: 'auth-val' },
      userAgent: 'TestBrowser/1.0',
    });
    expect(created.userId).toBe(userA.user.id);
    expect(created.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(created.userAgent).toBe('TestBrowser/1.0');

    // Upsert with same endpoint preserves subscription id and updates keys
    const updated = await subscribeUserPush(db, userA.user.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256dh-val-2', auth: 'auth-val-2' },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.p256dh).toBe('p256dh-val-2');

    expect(await listUserPushSubscriptions(db, userA.user.id)).toHaveLength(1);
    expect(await db.listAllPushSubscriptions()).toHaveLength(1);

    // Other user cannot delete userA's subscription
    expect(
      await unsubscribeUserPush(
        db,
        userB.user.id,
        'https://fcm.googleapis.com/fcm/send/abc',
      ),
    ).toBe(false);
    expect(await listUserPushSubscriptions(db, userA.user.id)).toHaveLength(1);

    // Dispatch via noop vs memory adapter
    const noopResult = await dispatchPushNotification(
      db,
      userA.user.id,
      { title: 'Yeni İlan', body: 'Test ilanı', url: '/ilan/1' },
      new NoopWebPushAdapter(),
    );
    expect(noopResult).toEqual({ total: 1, delivered: 0 });

    const memAdapter = new InMemoryWebPushAdapter();
    const memResult = await dispatchPushNotification(
      db,
      userA.user.id,
      { title: 'Yeni İlan', body: 'Test ilanı', url: '/ilan/1' },
      memAdapter,
    );
    expect(memResult).toEqual({ total: 1, delivered: 1 });
    expect(memAdapter.sent).toHaveLength(1);
    expect(memAdapter.sent[0].payload.url).toBe('/ilan/1');

    // deleteUser cascades push_subscriptions in memory adapter
    await db.deleteUser(userA.user.id);
    expect(await listUserPushSubscriptions(db, userA.user.id)).toEqual([]);
    expect(await db.listAllPushSubscriptions()).toEqual([]);
  });

  it('executes D1Adapter push subscription CRUD queries cleanly', async () => {
    const queries: Array<{ query: string; params: unknown[] }> = [];
    const storedRow = {
      id: 'sub-1',
      user_id: 'u-1',
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test',
      p256dh: 'p256dh-1',
      auth: 'auth-1',
      user_agent: 'Firefox',
      created_at: '2026-11-26T00:00:00.000Z',
    };

    const makeStmt = (query: string, bound: unknown[] = []): D1PreparedStatementLike => ({
      bind(...values: unknown[]) {
        return makeStmt(query, values);
      },
      async first<T = Record<string, unknown>>() {
        queries.push({ query, params: bound });
        if (query.includes('FROM push_subscriptions WHERE endpoint = ?')) {
          return storedRow as T;
        }
        return null;
      },
      async all<T = Record<string, unknown>>() {
        queries.push({ query, params: bound });
        if (query.includes('FROM push_subscriptions')) {
          return { results: [storedRow] as T[] };
        }
        return { results: [] as T[] };
      },
      async run() {
        queries.push({ query, params: bound });
        return { success: true, meta: { changes: 1 } };
      },
    });

    const mockD1: D1DatabaseLike = {
      prepare(query: string) {
        return makeStmt(query);
      },
      async batch(statements: D1PreparedStatementLike[]) {
        for (const stmt of statements) {
          await stmt.run();
        }
        return [];
      },
    };

    const d1 = new D1Adapter(mockD1);
    const upserted = await d1.upsertPushSubscription({
      id: 'sub-1',
      userId: 'u-1',
      endpoint: storedRow.endpoint,
      p256dh: 'p256dh-1',
      auth: 'auth-1',
      userAgent: 'Firefox',
      createdAt: '2026-11-26T00:00:00.000Z',
    });
    expect(upserted.endpoint).toBe(storedRow.endpoint);
    expect(upserted.userAgent).toBe('Firefox');

    const byUser = await d1.listPushSubscriptionsByUser('u-1');
    expect(byUser).toHaveLength(1);
    expect(byUser[0].userId).toBe('u-1');

    const allSubs = await d1.listAllPushSubscriptions();
    expect(allSubs).toHaveLength(1);

    const deleted = await d1.deletePushSubscriptionByEndpoint('u-1', storedRow.endpoint);
    expect(deleted).toBe(true);
    expect(queries.some((q) => q.query.includes('INSERT INTO push_subscriptions'))).toBe(true);
    expect(
      queries.some((q) =>
        q.query.includes('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?'),
      ),
    ).toBe(true);
  });
});

describe('Phase 3 push API routes', () => {
  beforeEach(() => {
    resetMemoryDb();
    vi.unstubAllEnvs();
  });

  it('serves GET /api/push/vapid-key based on env configuration', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    const unconfiguredRes = await getVapidKeyHandler();
    expect(unconfiguredRes.status).toBe(200);
    expect(await unconfiguredRes.json()).toEqual({ configured: false, publicKey: null });

    vi.stubEnv('VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFg');
    const configuredRes = await getVapidKeyHandler();
    expect(configuredRes.status).toBe(200);
    expect(await configuredRes.json()).toEqual({
      configured: true,
      publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFg',
    });
  });

  it('enforces auth and handles GET, POST, DELETE on /api/push/subscriptions', async () => {
    expect(
      (
        await getPushSubscriptionsHandler(
          new Request('http://localhost/api/push/subscriptions'),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await postPushSubscriptionHandler(
          jsonRequest('http://localhost/api/push/subscriptions', 'POST', {}),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await deletePushSubscriptionHandler(
          new Request('http://localhost/api/push/subscriptions?endpoint=https://a.test/1', {
            method: 'DELETE',
          }),
        )
      ).status,
    ).toBe(401);

    const regRes = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'pushapi@example.com',
        password: 'GucluParola123!',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    );
    expect(regRes.status).toBe(201);
    const cookie = extractSessionCookie(regRes);

    const badJsonRes = await postPushSubscriptionHandler(
      new Request('http://localhost/api/push/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: '{invalid',
      }),
    );
    expect(badJsonRes.status).toBe(400);

    const badEndpointRes = await postPushSubscriptionHandler(
      jsonRequest(
        'http://localhost/api/push/subscriptions',
        'POST',
        {
          endpoint: 'http://insecure.example/sub',
          keys: { p256dh: 'key', auth: 'auth' },
        },
        cookie,
      ),
    );
    expect(badEndpointRes.status).toBe(400);

    const endpoint1 = 'https://fcm.googleapis.com/fcm/send/sub-1';
    const endpoint2 = 'https://fcm.googleapis.com/fcm/send/sub-2';

    const createRes1 = await postPushSubscriptionHandler(
      jsonRequest(
        'http://localhost/api/push/subscriptions',
        'POST',
        {
          endpoint: endpoint1,
          keys: { p256dh: 'p256dh-1', auth: 'auth-1' },
          userAgent: 'Chrome/130',
        },
        cookie,
      ),
    );
    expect(createRes1.status).toBe(201);
    const createJson1 = await createRes1.json();
    expect(createJson1.subscription.endpoint).toBe(endpoint1);

    const createRes2 = await postPushSubscriptionHandler(
      jsonRequest(
        'http://localhost/api/push/subscriptions',
        'POST',
        {
          endpoint: endpoint2,
          keys: { p256dh: 'p256dh-2', auth: 'auth-2' },
        },
        cookie,
      ),
    );
    expect(createRes2.status).toBe(201);

    const listRes = await getPushSubscriptionsHandler(
      jsonRequest('http://localhost/api/push/subscriptions', 'GET', undefined, cookie),
    );
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.subscriptions).toHaveLength(2);

    // Delete via query param
    const deleteQueryRes = await deletePushSubscriptionHandler(
      new Request(
        `http://localhost/api/push/subscriptions?endpoint=${encodeURIComponent(endpoint1)}`,
        {
          method: 'DELETE',
          headers: { Cookie: cookie },
        },
      ),
    );
    expect(deleteQueryRes.status).toBe(200);
    expect(await deleteQueryRes.json()).toEqual({ deleted: true });

    // Delete via JSON body
    const deleteBodyRes = await deletePushSubscriptionHandler(
      jsonRequest(
        'http://localhost/api/push/subscriptions',
        'DELETE',
        { endpoint: endpoint2 },
        cookie,
      ),
    );
    expect(deleteBodyRes.status).toBe(200);
    expect(await deleteBodyRes.json()).toEqual({ deleted: true });

    // Deleting missing endpoint returns deleted: false
    const deleteAgainRes = await deletePushSubscriptionHandler(
      jsonRequest(
        'http://localhost/api/push/subscriptions',
        'DELETE',
        { endpoint: endpoint2 },
        cookie,
      ),
    );
    expect(deleteAgainRes.status).toBe(200);
    expect(await deleteAgainRes.json()).toEqual({ deleted: false });

    // Deleting without endpoint returns 400
    const deleteMissingParamRes = await deletePushSubscriptionHandler(
      jsonRequest('http://localhost/api/push/subscriptions', 'DELETE', {}, cookie),
    );
    expect(deleteMissingParamRes.status).toBe(400);
  });

  it('ships lightweight public/sw.js with required PWA handlers and clean copy', () => {
    const swContent = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    expect(swContent).toContain("addEventListener('install'");
    expect(swContent).toContain("addEventListener('activate'");
    expect(swContent).toContain("addEventListener('push'");
    expect(swContent).toContain("addEventListener('notificationclick'");
    expect(swContent).toContain('Kamu Bildirim Sepeti');
    expect(swContent).toContain('Yeni kamu ilanı bildirimi');
    expect(swContent).not.toContain('\u2014');
  });
});
