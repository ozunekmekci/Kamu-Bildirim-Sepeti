import { NextResponse } from 'next/server';
import { getPaymentProviderStatus } from '@/modules/billing';
import { D1Adapter, MemoryDbAdapter, getDb } from '@/modules/db';
import { getPublicVapidKey } from '@/modules/push';
import { createEmailAdapter } from '@/modules/tracking';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await getDb();
  const announcements = await db.listAnnouncements();
  const emailAdapter = createEmailAdapter();
  const paymentStatus = getPaymentProviderStatus();
  const vapid = getPublicVapidKey();

  const databaseMode =
    db instanceof D1Adapter || db.constructor?.name === 'D1Adapter'
      ? 'd1'
      : db instanceof MemoryDbAdapter || db.constructor?.name === 'MemoryDbAdapter'
        ? 'memory'
        : process.env.NODE_ENV === 'test'
          ? 'memory'
          : 'd1_or_memory';

  return NextResponse.json(
    {
      status: 'ok',
      app: 'Kamu Bildirim Sepeti',
      timestamp: new Date().toISOString(),
      database: {
        mode: databaseMode,
        announcementsCount: announcements.length,
      },
      providers: {
        email: emailAdapter.providerName,
        payment: paymentStatus.provider,
        configuredPayments: paymentStatus.configuredProviders,
        pushConfigured: Boolean(vapid.configured && process.env.VAPID_PRIVATE_KEY?.trim()),
        cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
        sessionSecretConfigured: Boolean(process.env.SESSION_SECRET?.trim()),
      },
    },
    { status: 200 },
  );
}
