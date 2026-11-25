import type {
  DatabaseAdapter,
  Entitlements,
  PlanTier,
  Subscription,
  SubscriptionStatus,
  User,
} from '@/modules/db/types';
import { generateId } from '@/modules/identity/crypto';
import {
  DemoPaymentAdapter,
  type PaymentAdapter,
  createPaymentAdapter,
} from './payment-adapters';

export {
  type CheckoutSessionInput,
  type CheckoutSessionResponse,
  DemoPaymentAdapter,
  IyzicoPaymentAdapter,
  type IyzicoPaymentAdapterOptions,
  type PaymentAdapter,
  type PaymentCheckoutResult,
  StripePaymentAdapter,
  type StripePaymentAdapterOptions,
  createPaymentAdapter,
  getPaymentProviderStatus,
  verifyIyzicoWebhookSignature,
  verifyStripeWebhookSignature,
} from './payment-adapters';

export class BillingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export const FREE_ENTITLEMENTS: Entitlements = {
  plan: 'free',
  maxVisibleAnnouncements: 15,
  maxSaved: 10,
  canUseProfileMatch: false,
  canInstantAlert: false,
};

export const PREMIUM_ENTITLEMENTS: Entitlements = {
  plan: 'premium',
  maxVisibleAnnouncements: null,
  maxSaved: null,
  canUseProfileMatch: true,
  canInstantAlert: true,
};

export function getEntitlementsForPlan(plan: PlanTier): Entitlements {
  return plan === 'premium' ? { ...PREMIUM_ENTITLEMENTS } : { ...FREE_ENTITLEMENTS };
}

export function canSaveAnotherAnnouncement(
  entitlements: Entitlements,
  currentSavedCount: number,
): boolean {
  if (entitlements.maxSaved === null) return true;
  return currentSavedCount < entitlements.maxSaved;
}

export async function getUserBillingState(
  db: DatabaseAdapter,
  userId: string,
): Promise<{ subscription: Subscription; entitlements: Entitlements }> {
  const existing = await db.getSubscription(userId);
  const now = new Date().toISOString();
  const subscription: Subscription = existing ?? {
    id: generateId(),
    userId,
    plan: 'free',
    status: 'active',
    provider: 'demo',
    externalSubscriptionId: null,
    currentPeriodEnd: null,
    updatedAt: now,
  };
  const effectivePlan: PlanTier =
    subscription.plan === 'premium' && subscription.status === 'active' ? 'premium' : 'free';
  return {
    subscription,
    entitlements: getEntitlementsForPlan(effectivePlan),
  };
}

export async function changeUserPlan(
  db: DatabaseAdapter,
  userId: string,
  targetPlan: unknown,
  adapter: PaymentAdapter = new DemoPaymentAdapter(),
): Promise<{ subscription: Subscription; entitlements: Entitlements }> {
  if (targetPlan !== 'free' && targetPlan !== 'premium') {
    throw new BillingError('INVALID_PLAN', 400, 'Geçersiz abonelik planı seçimi.');
  }

  const existing = await db.getSubscription(userId);
  const checkout = await adapter.changePlan(userId, targetPlan);
  const now = new Date().toISOString();

  const updated = await db.upsertSubscription({
    id: existing?.id ?? generateId(),
    userId,
    plan: checkout.plan,
    status: checkout.status,
    provider: checkout.provider,
    externalSubscriptionId: existing?.externalSubscriptionId ?? null,
    currentPeriodEnd: checkout.currentPeriodEnd,
    updatedAt: now,
  });

  return {
    subscription: updated,
    entitlements: getEntitlementsForPlan(
      updated.plan === 'premium' && updated.status === 'active' ? 'premium' : 'free',
    ),
  };
}

export type StartCheckoutResult =
  | {
      mode: 'demo';
      provider: string;
      subscription: Subscription;
      entitlements: Entitlements;
    }
  | {
      mode: 'redirect';
      provider: string;
      checkoutUrl: string;
      externalSessionId: string;
    };

export async function startCheckout(
  db: DatabaseAdapter,
  user: Pick<User, 'id' | 'email'>,
  targetPlan: unknown,
  baseUrl: string,
  adapter: PaymentAdapter = createPaymentAdapter(),
): Promise<StartCheckoutResult> {
  if (targetPlan !== 'free' && targetPlan !== 'premium') {
    throw new BillingError('INVALID_PLAN', 400, 'Geçersiz abonelik planı seçimi.');
  }

  if (adapter.providerName === 'demo' || targetPlan === 'free') {
    const result = await changeUserPlan(db, user.id, targetPlan, adapter);
    return {
      mode: 'demo',
      provider: adapter.providerName,
      subscription: result.subscription,
      entitlements: result.entitlements,
    };
  }

  if (!adapter.createCheckoutSession) {
    throw new BillingError(
      'PROVIDER_UNSUPPORTED',
      500,
      'Seçili ödeme sağlayıcısı yönlendirmeli ödeme oturumu desteklemiyor.',
    );
  }

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const session = await adapter.createCheckoutSession({
    userId: user.id,
    userEmail: user.email,
    targetPlan: 'premium',
    successUrl: `${cleanBase}/premium?checkout=success`,
    cancelUrl: `${cleanBase}/premium?checkout=cancel`,
  });

  return {
    mode: 'redirect',
    provider: adapter.providerName,
    checkoutUrl: session.checkoutUrl,
    externalSessionId: session.externalSessionId,
  };
}

export interface WebhookSubscriptionEvent {
  userId: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  provider: string;
  externalSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
}

export async function applyWebhookSubscriptionUpdate(
  db: DatabaseAdapter,
  event: WebhookSubscriptionEvent,
): Promise<{ subscription: Subscription; entitlements: Entitlements }> {
  if (!event.userId || typeof event.userId !== 'string') {
    throw new BillingError(
      'INVALID_WEBHOOK_USER',
      400,
      'Abonelik güncellenecek kullanıcı kimliği bulunamadı.',
    );
  }

  const existing = await db.getSubscription(event.userId);
  const now = new Date().toISOString();

  const updated = await db.upsertSubscription({
    id: existing?.id ?? generateId(),
    userId: event.userId,
    plan: event.plan,
    status: event.status,
    provider: event.provider,
    externalSubscriptionId:
      event.externalSubscriptionId !== undefined
        ? event.externalSubscriptionId
        : (existing?.externalSubscriptionId ?? null),
    currentPeriodEnd:
      event.currentPeriodEnd !== undefined
        ? event.currentPeriodEnd
        : (existing?.currentPeriodEnd ?? null),
    updatedAt: now,
  });

  const effectivePlan: PlanTier =
    updated.plan === 'premium' && updated.status === 'active' ? 'premium' : 'free';

  return {
    subscription: updated,
    entitlements: getEntitlementsForPlan(effectivePlan),
  };
}
