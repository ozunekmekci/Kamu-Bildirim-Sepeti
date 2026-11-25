import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import { IdentityError, resetPasswordWithToken } from '@/modules/identity';

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
    const result = await resetPasswordWithToken(
      db,
      typeof body.token === 'string' ? body.token : '',
      typeof body.newPassword === 'string' ? body.newPassword : '',
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'Parola sıfırlama sırasında beklenmeyen bir hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
