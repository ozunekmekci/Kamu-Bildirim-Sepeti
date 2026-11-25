import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { POST as checkoutHandler } from '@/app/api/billing/checkout/route';
import { GET as getBillingHandler } from '@/app/api/billing/route';
import { POST as iyzicoWebhookHandler } from '@/app/api/billing/webhook/iyzico/route';
import { POST as stripeWebhookHandler } from '@/app/api/billing/webhook/stripe/route';
import { POST as cronSyncHandler } from '@/app/api/cron/sync/route';
import type { Announcement } from '@/modules/announcements';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements';
import {
  applyWebhookSubscriptionUpdate,
  changeUserPlan,
  createPaymentAdapter,
  DemoPaymentAdapter,
  getPaymentProviderStatus,
  getUserBillingState,
  IyzicoPaymentAdapter,
  startCheckout,
  StripePaymentAdapter,
  verifyIyzicoWebhookSignature,
  verifyStripeWebhookSignature,
} from '@/modules/billing';
import { type MemoryDbAdapter, resetMemoryDb } from '@/modules/db';
import { registerUser, updateUserProfile } from '@/modules/identity';
import {
  createEmailAdapter,
  dispatchNewAnnouncementAlerts,
  InMemoryEmailAdapter,
  MailChannelsEmailAdapter,
  NoopEmailAdapter,
  ResendEmailAdapter,
  updateNotificationPreferences,
} from '@/modules/tracking';

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/kbs_session=([^;]+)/);
  return match ? `kbs_session=${match[1]}` : '';
}

function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
  cookie?: string,
  extraHeaders?: Record<string, string>,
): Request {
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
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

describe('Phase 2 email adapters and instant announcement alerts', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
  });

  it('selects Resend, MailChannels, or Noop adapter from environment variables', () => {
    expect(createEmailAdapter({})).toBeInstanceOf(NoopEmailAdapter);
    expect(createEmailAdapter({ RESEND_API_KEY: 're_test_123' })).toBeInstanceOf(
      ResendEmailAdapter,
    );
    expect(createEmailAdapter({ MAILCHANNELS_API_KEY: 'mc_test_123' })).toBeInstanceOf(
      MailChannelsEmailAdapter,
    );
  });

  it('sends email payload via ResendEmailAdapter and handles failures safely', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }));
    const resend = new ResendEmailAdapter({
      apiKey: 're_secret_abc',
      from: 'Kamu Bildirim Sepeti <bildirim@kamubildirimsepeti.com>',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const okResult = await resend.sendEmail({
      to: 'aday@example.com',
      subject: 'Test Konu',
      text: 'Test içerik',
    });
    expect(okResult).toEqual({ delivered: true, provider: 'resend' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_secret_abc');
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Kamu Bildirim Sepeti <bildirim@kamubildirimsepeti.com>',
      to: ['aday@example.com'],
      subject: 'Test Konu',
      text: 'Test içerik',
    });

    const failMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const failingResend = new ResendEmailAdapter({
      apiKey: 're_secret_abc',
      fetchFn: failMock as unknown as typeof fetch,
    });
    const failResult = await failingResend.sendEmail({
      to: 'aday@example.com',
      subject: 'Test',
      text: 'Test',
    });
    expect(failResult).toEqual({ delivered: false, provider: 'resend' });
  });

  it('sends MailChannels payload with optional X-Api-Key', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    const mc = new MailChannelsEmailAdapter({
      apiKey: 'mc_key_999',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await mc.sendEmail({
      to: 'aday@example.com',
      subject: 'Bilgilendirme',
      text: 'Yeni ilan eklendi.',
    });
    expect(result).toEqual({ delivered: true, provider: 'mailchannels' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mailchannels.net/tx/v1/send');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('mc_key_999');
    const parsed = JSON.parse(String(init.body)) as {
      personalizations: Array<{ to: Array<{ email: string }> }>;
      subject: string;
      content: Array<{ type: string; value: string }>;
    };
    expect(parsed.personalizations[0].to[0].email).toBe('aday@example.com');
    expect(parsed.content[0].value).toBe('Yeni ilan eklendi.');
  });

  it('dispatches instant new announcement alerts only to eligible premium users and deduplicates', async () => {
    const { user: freeUser } = await registerUser(db, {
      email: 'free@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await updateNotificationPreferences(db, freeUser.id, {
      emailEnabled: true,
      instantNewAnnouncements: true,
      onlyMatchingProfile: false,
    });

    const { user: premUser } = await registerUser(db, {
      email: 'prem@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await changeUserPlan(db, premUser.id, 'premium');
    await updateUserProfile(db, premUser.id, {
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      kpssScore: 80,
      residenceCity: 'Ankara',
      militaryStatus: 'muaf',
      driverLicenses: ['B'],
      certificates: [],
      qualificationCodes: ['4001'],
    });
    await updateNotificationPreferences(db, premUser.id, {
      emailEnabled: true,
      instantNewAnnouncements: true,
      onlyMatchingProfile: true,
    });

    const openBase = INITIAL_ANNOUNCEMENTS.find((a) => a.status === 'acik')!;
    const matchingAnnouncement: Announcement = {
      ...openBase,
      id: 'new-match-1',
      title: 'Yeni Uygun İlan',
      status: 'acik',
      criteria: {
        educationLevels: ['lisans'],
        kpssScoreTypes: ['P3'],
        minKpssScore: 70,
        cities: ['Ankara'],
        militaryRequired: false,
        driverLicenses: [],
        certificates: [],
        qualificationCodes: ['4001'],
        summaryLines: ['Lisans 4001'],
      },
    };
    const nonMatchingAnnouncement: Announcement = {
      ...matchingAnnouncement,
      id: 'new-mismatch-2',
      title: 'Yüksek Puanlı İlan',
      criteria: {
        ...matchingAnnouncement.criteria,
        minKpssScore: 98,
      },
    };

    const emailAdapter = new InMemoryEmailAdapter();
    const first = await dispatchNewAnnouncementAlerts(
      db,
      [matchingAnnouncement, nonMatchingAnnouncement],
      emailAdapter,
    );
    expect(first.sentCount).toBe(1);
    expect(emailAdapter.sent).toHaveLength(1);
    expect(emailAdapter.sent[0].to).toBe('prem@example.com');
    expect(emailAdapter.sent[0].subject).toContain('Yeni Uygun İlan');

    // Deduplicated on repeat run
    const second = await dispatchNewAnnouncementAlerts(
      db,
      [matchingAnnouncement, nonMatchingAnnouncement],
      emailAdapter,
    );
    expect(second.sentCount).toBe(0);
    expect(emailAdapter.sent).toHaveLength(1);
  });
});

describe('Phase 2 payment adapters, webhook verification, and billing/cron routes', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('selects payment adapter and provider status from env', () => {
    expect(getPaymentProviderStatus({})).toEqual({
      provider: 'demo',
      configuredProviders: ['demo'],
    });
    expect(createPaymentAdapter({})).toBeInstanceOf(DemoPaymentAdapter);

    const stripeStatus = getPaymentProviderStatus({
      STRIPE_SECRET_KEY: 'sk_test_123',
      PAYMENT_PROVIDER: 'stripe',
    });
    expect(stripeStatus).toEqual({
      provider: 'stripe',
      configuredProviders: ['demo', 'stripe'],
    });
    expect(createPaymentAdapter({ STRIPE_SECRET_KEY: 'sk_test_123' })).toBeInstanceOf(
      StripePaymentAdapter,
    );

    const iyzicoStatus = getPaymentProviderStatus({
      IYZICO_API_KEY: 'iyz_api',
      IYZICO_SECRET_KEY: 'iyz_sec',
      PAYMENT_PROVIDER: 'iyzico',
    });
    expect(iyzicoStatus).toEqual({
      provider: 'iyzico',
      configuredProviders: ['demo', 'iyzico'],
    });
    expect(
      createPaymentAdapter({
        IYZICO_API_KEY: 'iyz_api',
        IYZICO_SECRET_KEY: 'iyz_sec',
        PAYMENT_PROVIDER: 'iyzico',
      }),
    ).toBeInstanceOf(IyzicoPaymentAdapter);
  });

  it('verifies Stripe HMAC-SHA256 webhook signatures with 300s timestamp tolerance', async () => {
    const secret = 'whsec_test_secret_123';
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const nowSec = 1_750_000_000;
    const validSig = await hmacSha256Hex(secret, `${nowSec}.${rawBody}`);

    expect(
      await verifyStripeWebhookSignature(rawBody, `t=${nowSec},v1=${validSig}`, secret, nowSec + 60),
    ).toBe(true);

    // Expired timestamp (> 300s)
    expect(
      await verifyStripeWebhookSignature(rawBody, `t=${nowSec},v1=${validSig}`, secret, nowSec + 450),
    ).toBe(false);

    // Tampered body
    expect(
      await verifyStripeWebhookSignature(
        `${rawBody} `,
        `t=${nowSec},v1=${validSig}`,
        secret,
        nowSec + 10,
      ),
    ).toBe(false);

    // Missing header
    expect(await verifyStripeWebhookSignature(rawBody, null, secret, nowSec)).toBe(false);
  });

  it('verifies iyzico HMAC-SHA256 webhook signatures (raw and v3)', async () => {
    const secret = 'iyz_secret_key_xyz';
    const payload = JSON.stringify({
      iyziEventType: 'PAYMENT_API',
      iyziPaymentId: 'pay_99',
      paymentConversationId: 'user-1:123',
      status: 'SUCCESS',
    });

    const rawSig = await hmacSha256Hex(secret, payload);
    expect(await verifyIyzicoWebhookSignature(payload, rawSig, secret)).toBe(true);

    const v3Sig = await hmacSha256Hex(secret, `${secret}PAYMENT_APIpay_99user-1:123SUCCESS`);
    expect(await verifyIyzicoWebhookSignature(payload, v3Sig, secret)).toBe(true);

    expect(await verifyIyzicoWebhookSignature(payload, 'deadbeef', secret)).toBe(false);
    expect(await verifyIyzicoWebhookSignature(payload, null, secret)).toBe(false);
  });

  it('creates live Stripe and iyzico checkout sessions via startCheckout', async () => {
    const { user } = await registerUser(db, {
      email: 'checkout@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    const stripeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_1' }), {
          status: 200,
        }),
    );
    const stripeAdapter = new StripePaymentAdapter({
      secretKey: 'sk_test_1',
      fetchFn: stripeFetch as unknown as typeof fetch,
    });

    const stripeCheckout = await startCheckout(
      db,
      user,
      'premium',
      'https://kamubildirimsepeti.com',
      stripeAdapter,
    );
    expect(stripeCheckout).toEqual({
      mode: 'redirect',
      provider: 'stripe',
      checkoutUrl: 'https://checkout.stripe.com/pay/cs_1',
      externalSessionId: 'cs_test_1',
    });

    const iyzicoFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'success',
            paymentPageUrl: 'https://sandbox-api.iyzipay.com/checkout/abc',
            token: 'iyz_tok_1',
          }),
          { status: 200 },
        ),
    );
    const iyzicoAdapter = new IyzicoPaymentAdapter({
      apiKey: 'iyz_api_1',
      secretKey: 'iyz_sec_1',
      fetchFn: iyzicoFetch as unknown as typeof fetch,
    });

    const iyzicoCheckout = await startCheckout(
      db,
      user,
      'premium',
      'https://kamubildirimsepeti.com',
      iyzicoAdapter,
    );
    expect(iyzicoCheckout).toEqual({
      mode: 'redirect',
      provider: 'iyzico',
      checkoutUrl: 'https://sandbox-api.iyzipay.com/checkout/abc',
      externalSessionId: 'iyz_tok_1',
    });

    // Free plan downgrades directly in demo mode even with live adapter
    const downgrade = await startCheckout(
      db,
      user,
      'free',
      'https://kamubildirimsepeti.com',
      stripeAdapter,
    );
    expect(downgrade.mode).toBe('demo');
    if (downgrade.mode === 'demo') {
      expect(downgrade.entitlements.plan).toBe('free');
    }
  });

  it('handles GET /api/billing, POST /api/billing/checkout, and webhook fail-closed & update flows', async () => {
    const regRes = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'billing-route@example.com',
        password: 'GucluParola123!',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    );
    expect(regRes.status).toBe(201);
    const cookie = extractSessionCookie(regRes);
    const regJson = (await regRes.json()) as { user: { id: string } };
    const userId = regJson.user.id;

    // GET /api/billing returns provider metadata
    const billingRes = await getBillingHandler(
      jsonRequest('http://localhost/api/billing', 'GET', undefined, cookie),
    );
    expect(billingRes.status).toBe(200);
    const billingJson = await billingRes.json();
    expect(billingJson.provider).toBe('demo');
    expect(billingJson.configuredProviders).toContain('demo');

    // POST /api/billing/checkout in demo mode
    const checkoutRes = await checkoutHandler(
      jsonRequest('http://localhost/api/billing/checkout', 'POST', { plan: 'premium' }, cookie),
    );
    expect(checkoutRes.status).toBe(200);
    const checkoutJson = await checkoutRes.json();
    expect(checkoutJson.mode).toBe('demo');
    expect(checkoutJson.entitlements.plan).toBe('premium');

    // Reset back to free to test webhook activation
    await applyWebhookSubscriptionUpdate(db, {
      userId,
      plan: 'free',
      status: 'active',
      provider: 'demo',
    });

    // Stripe webhook fails closed 503 when STRIPE_WEBHOOK_SECRET unset
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const missingStripeSecretRes = await stripeWebhookHandler(
      new Request('http://localhost/api/billing/webhook/stripe', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(missingStripeSecretRes.status).toBe(503);

    // Stripe webhook rejects invalid signature with 400
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_route_secret');
    const badStripeRes = await stripeWebhookHandler(
      new Request('http://localhost/api/billing/webhook/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=123,v1=bad' },
        body: '{}',
      }),
    );
    expect(badStripeRes.status).toBe(400);

    // Valid Stripe checkout.session.completed upgrades user to premium
    const stripeCompletedBody = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_live_99',
          subscription: 'sub_stripe_99',
          client_reference_id: userId,
          metadata: { userId, plan: 'premium' },
        },
      },
    });
    const nowSec = Math.floor(Date.now() / 1000);
    const stripeSig = await hmacSha256Hex('whsec_route_secret', `${nowSec}.${stripeCompletedBody}`);
    const okStripeRes = await stripeWebhookHandler(
      new Request('http://localhost/api/billing/webhook/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': `t=${nowSec},v1=${stripeSig}`,
        },
        body: stripeCompletedBody,
      }),
    );
    expect(okStripeRes.status).toBe(200);
    const afterStripe = await getUserBillingState(db, userId);
    expect(afterStripe.subscription.plan).toBe('premium');
    expect(afterStripe.subscription.provider).toBe('stripe');
    expect(afterStripe.subscription.externalSubscriptionId).toBe('sub_stripe_99');

    // Stripe customer.subscription.deleted cancels to free
    const stripeDeletedBody = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_stripe_99',
          metadata: { userId },
        },
      },
    });
    const delSig = await hmacSha256Hex('whsec_route_secret', `${nowSec}.${stripeDeletedBody}`);
    const delStripeRes = await stripeWebhookHandler(
      new Request('http://localhost/api/billing/webhook/stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': `t=${nowSec},v1=${delSig}`,
        },
        body: stripeDeletedBody,
      }),
    );
    expect(delStripeRes.status).toBe(200);
    const afterDelete = await getUserBillingState(db, userId);
    expect(afterDelete.subscription.plan).toBe('free');
    expect(afterDelete.subscription.status).toBe('canceled');

    // iyzico webhook fails closed 503 when IYZICO_SECRET_KEY unset
    vi.stubEnv('IYZICO_SECRET_KEY', '');
    const missingIyzicoRes = await iyzicoWebhookHandler(
      new Request('http://localhost/api/billing/webhook/iyzico', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(missingIyzicoRes.status).toBe(503);

    // iyzico webhook rejects invalid signature with 401
    vi.stubEnv('IYZICO_SECRET_KEY', 'iyz_route_secret');
    const badIyzicoRes = await iyzicoWebhookHandler(
      new Request('http://localhost/api/billing/webhook/iyzico', {
        method: 'POST',
        headers: { 'x-iyz-signature-v3': 'invalid' },
        body: '{}',
      }),
    );
    expect(badIyzicoRes.status).toBe(401);

    // Valid iyzico webhook activates premium
    const iyzicoBody = JSON.stringify({
      iyziEventType: 'PAYMENT_API',
      iyziPaymentId: 'iyz_pay_77',
      paymentConversationId: `${userId}:1750000`,
      status: 'SUCCESS',
    });
    const iyzSig = await hmacSha256Hex('iyz_route_secret', iyzicoBody);
    const okIyzicoRes = await iyzicoWebhookHandler(
      new Request('http://localhost/api/billing/webhook/iyzico', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-iyz-signature-v3': iyzSig,
        },
        body: iyzicoBody,
      }),
    );
    expect(okIyzicoRes.status).toBe(200);
    const afterIyzico = await getUserBillingState(db, userId);
    expect(afterIyzico.subscription.plan).toBe('premium');
    expect(afterIyzico.subscription.provider).toBe('iyzico');
    expect(afterIyzico.subscription.externalSubscriptionId).toBe('iyz_pay_77');
  });

  it('records SyncRun and returns newAlerts on POST /api/cron/sync', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline in test'));

    const res = await cronSyncHandler(
      new Request('http://localhost/api/cron/sync', { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newAlerts).toEqual({ processedUsers: 0, sentCount: 0 });
    expect(data.syncRun).toBeDefined();
    expect(data.syncRun.status).toBe('error');

    const runs = await db.listSyncRuns(5);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(data.syncRun.id);
  });
});
