import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';
import {
  listUserPushSubscriptions,
  PushError,
  subscribeUserPush,
  unsubscribeUserPush,
} from '@/modules/push';

export const dynamic = 'force-dynamic';

function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}

function handlePushError(err: unknown, fallbackMessage: string) {
  if (err instanceof PushError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  return NextResponse.json(
    { error: fallbackMessage, code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return unauthorizedResponse();
  }

  const subscriptions = await listUserPushSubscriptions(db, user.id);
  return NextResponse.json({ subscriptions }, { status: 200 });
}

export async function POST(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return unauthorizedResponse();
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
        { status: 400 },
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  try {
    const userAgent =
      typeof body.userAgent === 'string'
        ? body.userAgent
        : request.headers.get('user-agent');

    const subscription = await subscribeUserPush(db, user.id, {
      endpoint: body.endpoint as string,
      keys: body.keys as { p256dh: string; auth: string },
      userAgent,
    });

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (err) {
    return handlePushError(err, 'Bildirim aboneliği kaydedilirken hata oluştu.');
  }
}

export async function DELETE(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  let endpoint = url.searchParams.get('endpoint') ?? '';

  if (!endpoint) {
    try {
      const parsed: unknown = await request.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const body = parsed as Record<string, unknown>;
        if (typeof body.endpoint === 'string') {
          endpoint = body.endpoint;
        }
      }
    } catch {
      // Query param or empty body handled by validation below
    }
  }

  try {
    const deleted = await unsubscribeUserPush(db, user.id, endpoint);
    return NextResponse.json({ deleted }, { status: 200 });
  } catch (err) {
    return handlePushError(err, 'Bildirim aboneliği silinirken hata oluştu.');
  }
}
