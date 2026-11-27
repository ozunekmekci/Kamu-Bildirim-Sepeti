import React from 'react';
import AppShell from '@/components/AppShell';
import AnnouncementFeed from '@/components/AnnouncementFeed';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';
import type { Announcement } from '@/modules/announcements/types';
import { FREE_ENTITLEMENTS } from '@/modules/billing';
import { getDb } from '@/modules/db';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let initialAnnouncements: Announcement[] = INITIAL_ANNOUNCEMENTS;

  try {
    const db = await getDb();
    const liveItems = await db.listAnnouncements({ status: 'hepsi' });
    if (liveItems.length > 0) {
      const limit = FREE_ENTITLEMENTS.maxVisibleAnnouncements ?? 15;
      initialAnnouncements = liveItems.slice(0, limit).map((item) => ({
        ...item,
        positions: undefined,
      }));
    }
  } catch {
    // Fallback to seed announcements when DB binding is unavailable during build/test
  }

  return (
    <AppShell>
      <AnnouncementFeed initialAnnouncements={initialAnnouncements} />
    </AppShell>
  );
}
