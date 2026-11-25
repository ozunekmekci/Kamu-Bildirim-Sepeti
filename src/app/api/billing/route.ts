import { NextResponse } from 'next/server';
import { getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return NextResponse.json(
      { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  const billing = await getUserBillingState(db, user.id);
  return NextResponse.json(billing, { status: 200 });
}
