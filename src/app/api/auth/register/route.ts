import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import {
  getSessionCookieOptions,
  IdentityError,
  registerUser,
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
    const result = await registerUser(db, {
      email: typeof body.email === 'string' ? body.email : '',
      password: typeof body.password === 'string' ? body.password : '',
      fullName: typeof body.fullName === 'string' ? body.fullName : null,
      phone: typeof body.phone === 'string' ? body.phone : null,
      acceptedTerms: body.acceptedTerms === true,
      acceptedPrivacy: body.acceptedPrivacy === true,
    });

    const response = NextResponse.json(
      { user: { ...result.user, plan: 'free' as const } },
      { status: 201 },
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
      { error: 'Kayıt işlemi sırasında beklenmeyen bir hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
