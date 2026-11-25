import { NextResponse } from 'next/server';
import { getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';
import {
  getNotificationPreferences,
  TrackingError,
  type UpdateNotificationPrefsInput,
  updateNotificationPreferences,
} from '@/modules/tracking';

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

  const [preferences, billing] = await Promise.all([
    getNotificationPreferences(db, user.id),
    getUserBillingState(db, user.id),
  ]);

  return NextResponse.json(
    { preferences, entitlements: billing.entitlements },
    { status: 200 },
  );
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

  let body: UpdateNotificationPrefsInput;
  try {
    body = (await request.json()) as UpdateNotificationPrefsInput;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  try {
    const [preferences, billing] = await Promise.all([
      updateNotificationPreferences(db, user.id, body),
      getUserBillingState(db, user.id),
    ]);
    return NextResponse.json(
      { preferences, entitlements: billing.entitlements },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof TrackingError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'Bildirim tercihleri güncellenirken hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
