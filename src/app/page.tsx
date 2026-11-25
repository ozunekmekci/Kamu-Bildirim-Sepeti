import React from 'react';
import AppShell from '@/components/AppShell';
import AnnouncementFeed from '@/components/AnnouncementFeed';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';

export default function HomePage() {
  return (
    <AppShell>
      <AnnouncementFeed initialAnnouncements={INITIAL_ANNOUNCEMENTS} />
    </AppShell>
  );
}
