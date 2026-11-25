import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import {
  getSessionCookieOptions,
  getSessionTokenFromRequest,
  logoutSession,
  SESSION_COOKIE_NAME,
} from '@/modules/identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await getDb();
  const token = getSessionTokenFromRequest(request);
  await logoutSession(db, token);

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, '', getSessionCookieOptions(0));
  return response;
}
