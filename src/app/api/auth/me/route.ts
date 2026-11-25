import { NextResponse } from 'next/server';
import { getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import {
  getAuthenticatedUser,
  getSessionTokenFromRequest,
  getUserProfile,
} from '@/modules/identity';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const db = await getDb();
  const token = getSessionTokenFromRequest(request);
  const user = await getAuthenticatedUser(db, token);

  if (!user) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
        profile: null,
        subscription: null,
        entitlements: null,
      },
      { status: 200 },
    );
  }

  const [profile, billing] = await Promise.all([
    getUserProfile(db, user.id),
    getUserBillingState(db, user.id),
  ]);

  return NextResponse.json(
    {
      authenticated: true,
      user: { ...user, plan: billing.entitlements.plan },
      profile,
      subscription: billing.subscription,
      entitlements: billing.entitlements,
    },
    { status: 200 },
  );
}
