import { NextResponse } from 'next/server';
import { syncOfficialSources } from '@/modules/announcements';
import { getDb } from '@/modules/db';
import { dispatchPendingReminders } from '@/modules/tracking';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: 'Senkronizasyon gizli anahtarı (CRON_SECRET) yapılandırılmamış.',
        code: 'CRON_SECRET_MISSING',
      },
      { status: 503 },
    );
  }
  if (expectedSecret) {
    const authHeader = request.headers.get('authorization') ?? '';
    const cronHeader = request.headers.get('x-cron-secret') ?? '';
    if (authHeader !== `Bearer ${expectedSecret}` && cronHeader !== expectedSecret) {
      return NextResponse.json(
        { error: 'Yetkisiz senkronizasyon isteği.', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
  }

  const db = await getDb();
  const syncResult = await syncOfficialSources(async (items) => {
    const res = await db.upsertAnnouncements(items);
    return res.inserted + res.updated;
  });

  const reminders = await dispatchPendingReminders(db);

  return NextResponse.json(
    {
      syncedCount: syncResult.syncedCount,
      errors: syncResult.errors,
      reminders,
    },
    { status: 200 },
  );
}
