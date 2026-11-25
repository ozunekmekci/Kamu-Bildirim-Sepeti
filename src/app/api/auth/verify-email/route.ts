import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import { IdentityError, verifyEmailWithToken } from '@/modules/identity';

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
    const result = await verifyEmailWithToken(
      db,
      typeof body.token === 'string' ? body.token : '',
    );
    return NextResponse.json(
      {
        verified: result.verified,
        emailVerifiedAt: result.emailVerifiedAt,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'E-posta doğrulama sırasında beklenmeyen bir hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
