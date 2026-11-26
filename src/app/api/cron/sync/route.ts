import { NextResponse } from 'next/server';
import { syncOfficialSources } from '@/modules/announcements';
import { getDb } from '@/modules/db';
import { generateId } from '@/modules/identity/crypto';
import { createWebPushAdapter, dispatchPushForNewAnnouncements } from '@/modules/push';
import {
  createEmailAdapter,
  dispatchNewAnnouncementAlerts,
  dispatchPendingReminders,
} from '@/modules/tracking';

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

  const startedAt = new Date().toISOString();
  const triggeredBy =
    request.headers.get('x-cron-trigger') ??
    (request.headers.get('cf-cron') ? 'cloudflare_cron' : 'api');

  const db = await getDb();
  const existingAnnouncements = await db.listAnnouncements({ status: 'hepsi' });
  const existingIds = new Set(existingAnnouncements.map((item) => item.id));

  const syncResult = await syncOfficialSources(async (items) => {
    const res = await db.upsertAnnouncements(items);
    return res.inserted + res.updated;
  });

  const newAnnouncements = syncResult.items.filter((item) => !existingIds.has(item.id));
  const emailAdapter = createEmailAdapter();
  const pushAdapter = createWebPushAdapter();

  const reminders = await dispatchPendingReminders(db, emailAdapter);
  const newAlerts = await dispatchNewAnnouncementAlerts(db, newAnnouncements, emailAdapter);
  const pushAlerts = await dispatchPushForNewAnnouncements(db, newAnnouncements, pushAdapter);

  const finishedAt = new Date().toISOString();
  const status =
    syncResult.errors.length === 0
      ? 'success'
      : syncResult.syncedCount > 0
        ? 'partial'
        : 'error';

  const syncRun = await db.recordSyncRun({
    id: generateId(),
    triggeredBy,
    startedAt,
    finishedAt,
    status,
    syncedCount: syncResult.syncedCount,
    remindersSent: reminders.sentCount,
    newAlertsSent: newAlerts.sentCount,
    errorsJson: JSON.stringify(syncResult.errors),
  });

  return NextResponse.json(
    {
      syncedCount: syncResult.syncedCount,
      errors: syncResult.errors,
      reminders,
      newAlerts,
      pushAlerts,
      syncRun,
    },
    { status: 200 },
  );
}
