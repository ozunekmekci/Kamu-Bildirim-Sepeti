import { NextResponse } from 'next/server';
import { getPublicVapidKey } from '@/modules/push';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { configured, publicKey } = getPublicVapidKey();
  return NextResponse.json({ configured, publicKey }, { status: 200 });
}
