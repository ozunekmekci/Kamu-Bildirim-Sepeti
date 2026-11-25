import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import {
  getAuthenticatedUser,
  getSessionTokenFromRequest,
  IdentityError,
  requestEmailVerification,
} from '@/modules/identity';
import { createEmailAdapter } from '@/modules/tracking';

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

  try {
    const baseUrl = new URL(request.url).origin;
    const result = await requestEmailVerification(db, user.id, createEmailAdapter(), baseUrl);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'Doğrulama e-postası gönderilirken hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
