import { NextResponse } from 'next/server';
import { syncOfficialSourcesV2 } from '@/modules/announcements/service';
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
  const existingAnnouncements = await db.listAnnouncements({
    status: 'hepsi',
    excludeDemo: false,
  });
  const existingIds = new Set(existingAnnouncements.map((item) => item.id));

  const syncResult = await syncOfficialSourcesV2(db);

  const newAlertCandidates = syncResult.items.filter(
    (item) => !existingIds.has(item.id) && item.noticeType !== 'iptal',
  );
  const emailAdapter = createEmailAdapter();
  const pushAdapter = createWebPushAdapter();

  const reminders = await dispatchPendingReminders(db, emailAdapter);
  const newAlerts = await dispatchNewAnnouncementAlerts(db, newAlertCandidates, emailAdapter);
  const pushAlerts = await dispatchPushForNewAnnouncements(db, newAlertCandidates, pushAdapter);

  const finishedAt = new Date().toISOString();
  const status =
    syncResult.errors.length === 0
      ? 'success'
      : syncResult.syncedCount > 0 || syncResult.dedupedCount > 0
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
      enrichedCount: syncResult.enrichedCount,
      dedupedCount: syncResult.dedupedCount,
      expiredCount: syncResult.expiredCount,
      prunedNoisyCount: syncResult.prunedNoisyCount,
      checkpoints: syncResult.checkpoints,
      errors: syncResult.errors,
      reminders,
      newAlerts,
      pushAlerts,
      syncRun,
    },
    { status: 200 },
  );
}
