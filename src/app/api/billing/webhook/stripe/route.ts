import { NextResponse } from 'next/server';
import {
  applyWebhookSubscriptionUpdate,
  verifyStripeWebhookSignature,
} from '@/modules/billing';
import { getDb, type PlanTier, type SubscriptionStatus } from '@/modules/db';

export const dynamic = 'force-dynamic';

function mapStripeStatus(rawStatus: unknown): SubscriptionStatus {
  if (rawStatus === 'trialing') return 'trialing';
  if (
    rawStatus === 'canceled' ||
    rawStatus === 'unpaid' ||
    rawStatus === 'incomplete_expired' ||
    rawStatus === 'past_due'
  ) {
    return 'canceled';
  }
  return 'active';
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      {
        error: 'Stripe webhook gizli anahtarı (STRIPE_WEBHOOK_SECRET) yapılandırılmamış.',
        code: 'STRIPE_WEBHOOK_SECRET_MISSING',
      },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('stripe-signature');
  const isValid = await verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    return NextResponse.json(
      { error: 'Geçersiz Stripe webhook imzası.', code: 'INVALID_STRIPE_SIGNATURE' },
      { status: 400 },
    );
  }

  let event: {
    type?: string;
    data?: {
      object?: Record<string, unknown>;
    };
  };
  try {
    event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz Stripe webhook JSON yükü.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const eventType = event.type ?? '';
  const obj = event.data?.object ?? {};
  const metadata = (obj.metadata ?? {}) as Record<string, unknown>;
  const userId =
    typeof obj.client_reference_id === 'string' && obj.client_reference_id
      ? obj.client_reference_id
      : typeof metadata.userId === 'string'
        ? metadata.userId
        : '';

  const db = await getDb();
  let updated = false;

  if (eventType === 'checkout.session.completed' && userId) {
    const plan: PlanTier = metadata.plan === 'free' ? 'free' : 'premium';
    const externalSubId =
      typeof obj.subscription === 'string'
        ? obj.subscription
        : typeof obj.id === 'string'
          ? obj.id
          : null;
    const periodEnd =
      plan === 'premium' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

    await applyWebhookSubscriptionUpdate(db, {
      userId,
      plan,
      status: 'active',
      provider: 'stripe',
      externalSubscriptionId: externalSubId,
      currentPeriodEnd: periodEnd,
    });
    updated = true;
  } else if (eventType === 'customer.subscription.updated' && userId) {
    const status = mapStripeStatus(obj.status);
    const plan: PlanTier =
      status === 'canceled' ? 'free' : metadata.plan === 'free' ? 'free' : 'premium';
    const externalSubId = typeof obj.id === 'string' ? obj.id : null;
    const periodEnd =
      typeof obj.current_period_end === 'number'
        ? new Date(obj.current_period_end * 1000).toISOString()
        : null;

    await applyWebhookSubscriptionUpdate(db, {
      userId,
      plan,
      status,
      provider: 'stripe',
      externalSubscriptionId: externalSubId,
      currentPeriodEnd: periodEnd,
    });
    updated = true;
  } else if (eventType === 'customer.subscription.deleted' && userId) {
    const externalSubId = typeof obj.id === 'string' ? obj.id : null;
    await applyWebhookSubscriptionUpdate(db, {
      userId,
      plan: 'free',
      status: 'canceled',
      provider: 'stripe',
      externalSubscriptionId: externalSubId,
      currentPeriodEnd: null,
    });
    updated = true;
  }

  return NextResponse.json({ received: true, updated, eventType }, { status: 200 });
}
