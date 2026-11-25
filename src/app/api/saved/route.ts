import { NextResponse } from 'next/server';
import { getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';
import {
  listSavedForUser,
  removeSavedForUser,
  saveAnnouncementForUser,
  TrackingError,
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

  const [items, billing] = await Promise.all([
    listSavedForUser(db, user.id),
    getUserBillingState(db, user.id),
  ]);

  return NextResponse.json(
    {
      items,
      savedIds: items.map((entry) => entry.announcement.id),
      count: items.length,
      limit: billing.entitlements.maxSaved,
      plan: billing.entitlements.plan,
    },
    { status: 200 },
  );
}

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

  try {
    const announcementId = typeof body.announcementId === 'string' ? body.announcementId : '';
    const saved = await saveAnnouncementForUser(db, user.id, announcementId);
    return NextResponse.json({ saved }, { status: 201 });
  } catch (err) {
    if (err instanceof TrackingError) {
      return NextResponse.json(
        { error: err.message, code: err.code, ...(err.meta ?? {}) },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'İlan kaydedilirken hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return NextResponse.json(
      { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  let announcementId = url.searchParams.get('announcementId') ?? '';

  if (!announcementId) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.announcementId === 'string') {
        announcementId = body.announcementId;
      }
    } catch {
      // Query param or empty body handled below
    }
  }

  try {
    const removed = await removeSavedForUser(db, user.id, announcementId);
    return NextResponse.json({ removed }, { status: 200 });
  } catch (err) {
    if (err instanceof TrackingError) {
      return NextResponse.json(
        { error: err.message, code: err.code, ...(err.meta ?? {}) },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: 'Kayıtlı ilan kaldırılırken hata oluştu.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
