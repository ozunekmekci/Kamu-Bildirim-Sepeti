import { NextResponse } from 'next/server';
import { getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import {
  getSessionCookieOptions,
  IdentityError,
  loginUser,
  SESSION_COOKIE_NAME,
} from '@/modules/identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();
    const result = await loginUser(db, {
      email: typeof body.email === 'string' ? body.email : '',
      password: typeof body.password === 'string' ? body.password : '',
    });
    const billing = await getUserBillingState(db, result.user.id);

    const response = NextResponse.json(
      { user: { ...result.user, plan: billing.entitlements.plan } },
      { status: 200 },
    );
    response.cookies.set(SESSION_COOKIE_NAME, result.token, getSessionCookieOptions());
    return response;
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'Giriş işlemi sırasında beklenmeyen bir hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
