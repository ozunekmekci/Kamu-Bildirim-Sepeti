import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import {
  deleteUserAccount,
  getAuthenticatedUser,
  getSessionCookieOptions,
  getSessionTokenFromRequest,
  IdentityError,
  SESSION_COOKIE_NAME,
} from '@/modules/identity';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
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

  try {
    const deleted = await deleteUserAccount(db, user.id, body.confirm);
    const response = NextResponse.json({ deleted }, { status: 200 });
    response.cookies.set(SESSION_COOKIE_NAME, '', getSessionCookieOptions(0));
    return response;
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'Hesap silinirken hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
