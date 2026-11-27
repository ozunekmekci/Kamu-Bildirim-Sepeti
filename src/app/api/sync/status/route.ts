import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await getDb();
  const [runs, checkpoints, allItems] = await Promise.all([
    db.listSyncRuns(10),
    db.listSourceCheckpoints(),
    db.listAnnouncements({ status: 'hepsi' }),
  ]);

  const liveOpenBySource: Record<string, number> = {};
  let openCount = 0;
  for (const item of allItems) {
    if (item.status === 'acik') {
      openCount += 1;
      liveOpenBySource[item.source] = (liveOpenBySource[item.source] ?? 0) + 1;
    }
  }

  const alignedCheckpoints = checkpoints.map((cp) => {
    const liveOpen = liveOpenBySource[cp.source] ?? 0;
    return liveOpen > 0 ? { ...cp, activeCount: liveOpen } : cp;
  });

  return NextResponse.json(
    {
      lastRun: runs[0] ?? null,
      runs,
      checkpoints: alignedCheckpoints,
      liveSummary: {
        openCount,
        totalCount: allItems.length,
      },
    },
    { status: 200 },
  );
}
