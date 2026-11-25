import type { PlanTier, SubscriptionStatus } from '@/modules/db/types';

export interface PaymentCheckoutResult {
  plan: PlanTier;
  status: SubscriptionStatus;
  provider: string;
  currentPeriodEnd: string | null;
  checkoutUrl?: string;
  externalSessionId?: string;
}

export interface CheckoutSessionInput {
  userId: string;
  userEmail: string;
  targetPlan: PlanTier;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  checkoutUrl: string;
  externalSessionId: string;
}

export interface PaymentAdapter {
  readonly providerName: string;
  changePlan(userId: string, targetPlan: PlanTier): Promise<PaymentCheckoutResult>;
  createCheckoutSession?(input: CheckoutSessionInput): Promise<CheckoutSessionResponse>;
}

const encoder = new TextEncoder();

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available.');
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function computeHmacSha256Bytes(secret: string, payload: string): Promise<Uint8Array> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', key, encoder.encode(payload));
  return new Uint8Array(sig);
}

export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!signatureHeader || !secret.trim()) return false;

  const segments = signatureHeader.split(',').map((part) => part.trim());
  let timestamp: number | null = null;
  const v1Signatures: string[] = [];

  for (const segment of segments) {
    const eqIdx = segment.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = segment.slice(0, eqIdx).trim();
    const value = segment.slice(eqIdx + 1).trim();
    if (key === 't') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && String(parsed) === value) {
        timestamp = parsed;
      }
    } else if (key === 'v1' && value) {
      v1Signatures.push(value.toLowerCase());
    }
  }

  if (timestamp === null || v1Signatures.length === 0) {
    return false;
  }

  if (Math.abs(nowSec - timestamp) > 300) {
    return false;
  }

  const expectedBytes = await computeHmacSha256Bytes(secret, `${timestamp}.${rawBody}`);
  const expectedHex = bytesToHex(expectedBytes);

  return v1Signatures.some((candidate) => constantTimeStringEqual(candidate, expectedHex));
}

export async function verifyIyzicoWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string,
): Promise<boolean> {
  const trimmedHeader = signatureHeader?.trim();
  const trimmedSecret = secretKey.trim();
  if (!trimmedHeader || !trimmedSecret) return false;

  const normalizedHeader = trimmedHeader.toLowerCase();

  // Check raw body HMAC (hex or base64)
  const rawDigest = await computeHmacSha256Bytes(trimmedSecret, rawBody);
  const rawHex = bytesToHex(rawDigest);
  const rawBase64 = bytesToBase64(rawDigest);
  if (
    constantTimeStringEqual(normalizedHeader, rawHex) ||
    constantTimeStringEqual(trimmedHeader, rawBase64)
  ) {
    return true;
  }

  // Check iyzico v3 concatenated field payload if JSON matches expected fields
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = typeof parsed.iyziEventType === 'string' ? parsed.iyziEventType : '';
    const paymentId =
      typeof parsed.iyziPaymentId === 'string'
        ? parsed.iyziPaymentId
        : typeof parsed.paymentId === 'string'
          ? parsed.paymentId
          : '';
    const conversationId =
      typeof parsed.paymentConversationId === 'string' ? parsed.paymentConversationId : '';
    const status = typeof parsed.status === 'string' ? parsed.status : '';

    if (eventType && status && (paymentId || conversationId)) {
      const v3Payload = `${trimmedSecret}${eventType}${paymentId}${conversationId}${status}`;
      const v3Digest = await computeHmacSha256Bytes(trimmedSecret, v3Payload);
      const v3Hex = bytesToHex(v3Digest);
      const v3Base64 = bytesToBase64(v3Digest);
      if (
        constantTimeStringEqual(normalizedHeader, v3Hex) ||
        constantTimeStringEqual(trimmedHeader, v3Base64)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

export class DemoPaymentAdapter implements PaymentAdapter {
  readonly providerName = 'demo';

  async changePlan(_userId: string, targetPlan: PlanTier): Promise<PaymentCheckoutResult> {
    if (targetPlan === 'premium') {
      const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      return {
        plan: 'premium',
        status: 'active',
        provider: this.providerName,
        currentPeriodEnd: nextMonth,
      };
    }
    return {
      plan: 'free',
      status: 'active',
      provider: this.providerName,
      currentPeriodEnd: null,
    };
  }
}

export interface StripePaymentAdapterOptions {
  secretKey: string;
  priceId?: string;
  webhookSecret?: string;
  fetchFn?: typeof fetch;
}

export class StripePaymentAdapter implements PaymentAdapter {
  readonly providerName = 'stripe';
  private readonly secretKey: string;
  private readonly priceId?: string;
  private readonly webhookSecret?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: StripePaymentAdapterOptions) {
    this.secretKey = options.secretKey.trim();
    this.priceId = options.priceId?.trim() || undefined;
    this.webhookSecret = options.webhookSecret?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  static verifyWebhookSignature = verifyStripeWebhookSignature;

  async verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | null,
    secret: string = this.webhookSecret ?? '',
    nowSec?: number,
  ): Promise<boolean> {
    return verifyStripeWebhookSignature(rawBody, signatureHeader, secret, nowSec);
  }

  async changePlan(_userId: string, targetPlan: PlanTier): Promise<PaymentCheckoutResult> {
    if (targetPlan === 'free') {
      return {
        plan: 'free',
        status: 'active',
        provider: this.providerName,
        currentPeriodEnd: null,
      };
    }
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
      plan: 'premium',
      status: 'active',
      provider: this.providerName,
      currentPeriodEnd: nextMonth,
    };
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResponse> {
    if (!this.secretKey) {
      throw new Error('Stripe gizli anahtarı yapılandırılmamış.');
    }

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('success_url', input.successUrl);
    params.set('cancel_url', input.cancelUrl);
    params.set('customer_email', input.userEmail);
    params.set('client_reference_id', input.userId);
    params.set('metadata[userId]', input.userId);
    params.set('metadata[plan]', input.targetPlan);
    params.set('line_items[0][quantity]', '1');

    if (this.priceId) {
      params.set('line_items[0][price]', this.priceId);
    } else {
      params.set('line_items[0][price_data][currency]', 'try');
      params.set('line_items[0][price_data][unit_amount]', '9900');
      params.set('line_items[0][price_data][recurring][interval]', 'month');
      params.set(
        'line_items[0][price_data][product_data][name]',
        'Kamu Bildirim Sepeti Premium',
      );
    }

    const response = await this.fetchFn('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error('Stripe ödeme oturumu oluşturulamadı.');
    }

    const data = (await response.json()) as { id?: string; url?: string };
    if (!data.url) {
      throw new Error('Stripe yönlendirme bağlantısı alınamadı.');
    }

    return {
      checkoutUrl: data.url,
      externalSessionId: data.id ?? '',
    };
  }
}

export interface IyzicoPaymentAdapterOptions {
  apiKey: string;
  secretKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class IyzicoPaymentAdapter implements PaymentAdapter {
  readonly providerName = 'iyzico';
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: IyzicoPaymentAdapterOptions) {
    this.apiKey = options.apiKey.trim();
    this.secretKey = options.secretKey.trim();
    this.baseUrl = (options.baseUrl?.trim() || 'https://api.iyzipay.com').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  static verifyWebhookSignature = verifyIyzicoWebhookSignature;

  async verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | null,
    secretKey: string = this.secretKey,
  ): Promise<boolean> {
    return verifyIyzicoWebhookSignature(rawBody, signatureHeader, secretKey);
  }

  async changePlan(_userId: string, targetPlan: PlanTier): Promise<PaymentCheckoutResult> {
    if (targetPlan === 'free') {
      return {
        plan: 'free',
        status: 'active',
        provider: this.providerName,
        currentPeriodEnd: null,
      };
    }
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
      plan: 'premium',
      status: 'active',
      provider: this.providerName,
      currentPeriodEnd: nextMonth,
    };
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResponse> {
    if (!this.apiKey || !this.secretKey) {
      throw new Error('iyzico API anahtarları yapılandırılmamış.');
    }

    const uriPath = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
    const randomKey = globalThis.crypto.randomUUID().replace(/-/g, '');
    const conversationId = `${input.userId}:${Date.now()}`;

    const payload = {
      locale: 'tr',
      conversationId,
      price: '99.00',
      paidPrice: '99.00',
      currency: 'TRY',
      basketId: input.userId,
      paymentGroup: 'SUBSCRIPTION',
      callbackUrl: input.successUrl,
      buyer: {
        id: input.userId,
        name: 'Kamu',
        surname: 'Adayi',
        email: input.userEmail,
        identityNumber: '11111111111',
        registrationAddress: 'Ankara, Turkiye',
        city: 'Ankara',
        country: 'Turkey',
      },
      shippingAddress: {
        contactName: 'Kamu Adayi',
        city: 'Ankara',
        country: 'Turkey',
        address: 'Ankara, Turkiye',
      },
      billingAddress: {
        contactName: 'Kamu Adayi',
        city: 'Ankara',
        country: 'Turkey',
        address: 'Ankara, Turkiye',
      },
      basketItems: [
        {
          id: 'kbs-premium-monthly',
          name: 'Kamu Bildirim Sepeti Premium Aylik Abonelik',
          category1: 'Abonelik',
          itemType: 'VIRTUAL',
          price: '99.00',
        },
      ],
    };

    const bodyText = JSON.stringify(payload);
    const sigBytes = await computeHmacSha256Bytes(
      this.secretKey,
      `${randomKey}${uriPath}${bodyText}`,
    );
    const sigHex = bytesToHex(sigBytes);
    const authPayload = `apiKey:${this.apiKey}&randomKey:${randomKey}&signature:${sigHex}`;
    const authHeader = `IYZWSv2 ${btoa(authPayload)}`;

    const response = await this.fetchFn(`${this.baseUrl}${uriPath}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'x-iyzi-rnd': randomKey,
        'Content-Type': 'application/json',
      },
      body: bodyText,
    });

    if (!response.ok) {
      throw new Error('iyzico ödeme oturumu başlatılamadı.');
    }

    const data = (await response.json()) as {
      status?: string;
      paymentPageUrl?: string;
      token?: string;
    };
    if (data.status !== 'success' || !data.paymentPageUrl) {
      throw new Error('iyzico ödeme sayfası bağlantısı alınamadı.');
    }

    return {
      checkoutUrl: data.paymentPageUrl,
      externalSessionId: data.token ?? conversationId,
    };
  }
}

export function getPaymentProviderStatus(
  env: Record<string, string | undefined> = process.env,
): { provider: string; configuredProviders: string[] } {
  const configuredProviders = ['demo'];
  const stripeKey = env.STRIPE_SECRET_KEY?.trim();
  const iyzicoKey = env.IYZICO_API_KEY?.trim();
  const iyzicoSecret = env.IYZICO_SECRET_KEY?.trim();

  if (stripeKey) configuredProviders.push('stripe');
  if (iyzicoKey && iyzicoSecret) configuredProviders.push('iyzico');

  const explicit = env.PAYMENT_PROVIDER?.trim().toLowerCase();
  let provider = 'demo';

  if (explicit === 'stripe' && stripeKey) {
    provider = 'stripe';
  } else if (explicit === 'iyzico' && iyzicoKey && iyzicoSecret) {
    provider = 'iyzico';
  } else if (explicit === 'demo') {
    provider = 'demo';
  } else if (!explicit) {
    if (stripeKey) provider = 'stripe';
    else if (iyzicoKey && iyzicoSecret) provider = 'iyzico';
  }

  return { provider, configuredProviders };
}

export function createPaymentAdapter(
  env: Record<string, string | undefined> = process.env,
  fetchFn?: typeof fetch,
): PaymentAdapter {
  const { provider } = getPaymentProviderStatus(env);

  if (provider === 'stripe' && env.STRIPE_SECRET_KEY?.trim()) {
    return new StripePaymentAdapter({
      secretKey: env.STRIPE_SECRET_KEY,
      priceId: env.STRIPE_PRICE_ID,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      fetchFn,
    });
  }

  if (provider === 'iyzico' && env.IYZICO_API_KEY?.trim() && env.IYZICO_SECRET_KEY?.trim()) {
    return new IyzicoPaymentAdapter({
      apiKey: env.IYZICO_API_KEY,
      secretKey: env.IYZICO_SECRET_KEY,
      baseUrl: env.IYZICO_BASE_URL,
      fetchFn,
    });
  }

  return new DemoPaymentAdapter();
}
