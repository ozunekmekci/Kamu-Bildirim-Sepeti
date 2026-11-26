import { NextResponse } from 'next/server';
import type {
  Announcement,
  AnnouncementPosition,
  SourceCheckpoint,
} from '@/modules/announcements/types';
import { getDb } from '@/modules/db';
import { generateId } from '@/modules/identity/crypto';
import { createWebPushAdapter, dispatchPushForNewAnnouncements } from '@/modules/push';
import {
  createEmailAdapter,
  dispatchNewAnnouncementAlerts,
  dispatchPendingReminders,
} from '@/modules/tracking';

export const dynamic = 'force-dynamic';

interface IngestRequestPayload {
  items?: unknown;
  positionsByAnnouncementId?: unknown;
  checkpoints?: unknown;
  triggeredBy?: unknown;
}

function authorizeCronRequest(request: Request): NextResponse | null {
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
        { error: 'Yetkisiz veri aktarım isteği.', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }
  }
  return null;
}

export async function GET(request: Request) {
  const authError = authorizeCronRequest(request);
  if (authError) {
    return authError;
  }

  const db = await getDb();
  const announcements = await db.listAnnouncements({
    status: 'hepsi',
    excludeDemo: true,
  });
  const enrichedIds = announcements
    .filter((item) => item.enrichmentStatus === 'enriched')
    .map((item) => item.id);

  return NextResponse.json(
    {
      enrichedIds,
      total: enrichedIds.length,
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const authError = authorizeCronRequest(request);
  if (authError) {
    return authError;
  }

  let body: IngestRequestPayload;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
        { status: 400 },
      );
    }
    body = parsed as IngestRequestPayload;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json(
      { error: 'items alanı bir dizi olmalıdır.', code: 'INVALID_ITEMS' },
      { status: 400 },
    );
  }

  const startedAt = new Date().toISOString();
  const triggeredBy =
    typeof body.triggeredBy === 'string' && body.triggeredBy.trim()
      ? body.triggeredBy.trim().slice(0, 64)
      : 'remote_ingest';

  const db = await getDb();
  const existingAnnouncements = await db.listAnnouncements({
    status: 'hepsi',
    excludeDemo: false,
  });
  const existingIds = new Set(existingAnnouncements.map((item) => item.id));

  const incomingItems = body.items
    .filter((item): item is Announcement => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      ...item,
      isDemo: false,
    }));

  const upsertRes = await db.upsertAnnouncements(incomingItems);

  let positionsSaved = 0;
  if (
    body.positionsByAnnouncementId &&
    typeof body.positionsByAnnouncementId === 'object' &&
    !Array.isArray(body.positionsByAnnouncementId)
  ) {
    const entries = Object.entries(
      body.positionsByAnnouncementId as Record<string, unknown>,
    );
    for (const [announcementId, rawPositions] of entries) {
      if (!announcementId || !Array.isArray(rawPositions)) continue;
      const positions = rawPositions as AnnouncementPosition[];
      await db.replaceAnnouncementPositions(announcementId, positions);
      positionsSaved += positions.length;
    }
  }

  if (Array.isArray(body.checkpoints)) {
    for (const rawCp of body.checkpoints) {
      if (rawCp && typeof rawCp === 'object' && typeof (rawCp as SourceCheckpoint).source === 'string') {
        await db.upsertSourceCheckpoint(rawCp as SourceCheckpoint);
      }
    }
  }

  const pruneRes = await db.pruneNoisyAndDemoProductionRows();
  const expiredCount = await db.markExpiredAnnouncements();

  const alertCandidates = incomingItems.filter(
    (item) => !existingIds.has(item.id) && (item.noticeType ?? 'ilan') === 'ilan',
  );

  const emailAdapter = createEmailAdapter();
  const pushAdapter = createWebPushAdapter();

  const reminders = await dispatchPendingReminders(db, emailAdapter);
  const newAlerts = await dispatchNewAnnouncementAlerts(db, alertCandidates, emailAdapter);
  const pushAlerts = await dispatchPushForNewAnnouncements(db, alertCandidates, pushAdapter);

  const finishedAt = new Date().toISOString();
  const syncedCount = upsertRes.inserted + upsertRes.updated;
  const syncRun = await db.recordSyncRun({
    id: generateId(),
    triggeredBy,
    startedAt,
    finishedAt,
    status: 'success',
    syncedCount,
    remindersSent: reminders.sentCount,
    newAlertsSent: newAlerts.sentCount,
    errorsJson: '[]',
  });

  return NextResponse.json(
    {
      syncedCount,
      inserted: upsertRes.inserted,
      updated: upsertRes.updated,
      positionsSaved,
      prunedNoisyCount: pruneRes.prunedNoisy,
      expiredCount,
      reminders,
      newAlerts,
      pushAlerts,
      syncRun,
    },
    { status: 200 },
  );
}
