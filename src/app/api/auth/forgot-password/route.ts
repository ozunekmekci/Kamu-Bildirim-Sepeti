import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import { IdentityError, requestPasswordReset } from '@/modules/identity';
import { createEmailAdapter } from '@/modules/tracking';

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
    const baseUrl = new URL(request.url).origin;
    const result = await requestPasswordReset(
      db,
      typeof body.email === 'string' ? body.email : '',
      createEmailAdapter(),
      baseUrl,
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
      { error: 'Parola sıfırlama talebi sırasında hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
