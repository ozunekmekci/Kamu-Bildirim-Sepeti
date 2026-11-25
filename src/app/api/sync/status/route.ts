import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await getDb();
  const runs = await db.listSyncRuns(10);
  return NextResponse.json(
    {
      lastRun: runs[0] ?? null,
      runs,
    },
    { status: 200 },
  );
}
