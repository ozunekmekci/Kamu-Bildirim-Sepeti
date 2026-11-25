import type {
  DatabaseAdapter,
  Entitlements,
  PlanTier,
  Subscription,
  SubscriptionStatus,
} from '@/modules/db/types';
import { generateId } from '@/modules/identity/crypto';

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

export interface PaymentCheckoutResult {
  plan: PlanTier;
  status: SubscriptionStatus;
  provider: string;
  currentPeriodEnd: string | null;
}

export interface PaymentAdapter {
  readonly providerName: string;
  changePlan(userId: string, targetPlan: PlanTier): Promise<PaymentCheckoutResult>;
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
    currentPeriodEnd: checkout.currentPeriodEnd,
    updatedAt: now,
  });

  return {
    subscription: updated,
    entitlements: getEntitlementsForPlan(updated.plan),
  };
}
