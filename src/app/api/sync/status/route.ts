import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await getDb();
  const [runs, checkpoints] = await Promise.all([
    db.listSyncRuns(10),
    db.listSourceCheckpoints(),
  ]);
  return NextResponse.json(
    {
      lastRun: runs[0] ?? null,
      runs,
      checkpoints,
    },
    { status: 200 },
  );
}
