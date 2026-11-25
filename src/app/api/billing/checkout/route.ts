import { NextResponse } from 'next/server';
import { BillingError, startCheckout } from '@/modules/billing';
import { getDb } from '@/modules/db';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return NextResponse.json(
      { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  let baseUrl = 'http://localhost:3000';
  try {
    baseUrl = new URL(request.url).origin;
  } catch {
    // Keep fallback localhost origin
  }

  try {
    const result = await startCheckout(db, user, body.plan, baseUrl);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Ödeme oturumu başlatılamadı.',
        code: 'CHECKOUT_FAILED',
      },
      { status: 502 },
    );
  }
}
