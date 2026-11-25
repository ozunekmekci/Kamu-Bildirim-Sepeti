import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import {
  getAuthenticatedUser,
  getSessionTokenFromRequest,
  getUserProfile,
  IdentityError,
  type ProfileUpdateInput,
  updateUserProfile,
} from '@/modules/identity';

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

  const profile = await getUserProfile(db, user.id);
  return NextResponse.json({ user, profile }, { status: 200 });
}

export async function PUT(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return NextResponse.json(
      { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: ProfileUpdateInput;
  try {
    body = (await request.json()) as ProfileUpdateInput;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  try {
    const result = await updateUserProfile(db, user.id, body);
    return NextResponse.json(
      { user: result.user, profile: result.profile },
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
      { error: 'Profil güncellenirken hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
