import React from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import AnnouncementDetailClient from '@/components/AnnouncementDetailClient';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';
import { getDb } from '@/modules/db';

export const dynamic = 'force-dynamic';

interface IlanPageProps {
  params: Promise<{ id: string }>;
}

async function resolveAnnouncement(id: string) {
  try {
    const db = await getDb();
    const fromDb = await db.getAnnouncementById(id);
    if (fromDb) return fromDb;
  } catch {
    // Fallback to static seed
  }
  return INITIAL_ANNOUNCEMENTS.find((a) => a.id === id) ?? null;
}

export async function generateMetadata({ params }: IlanPageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await resolveAnnouncement(id);
  if (!item) {
    return {
      title: 'İlan Bulunamadı',
    };
  }
  return {
    title: `${item.title} | ${item.institution}`,
    description: item.summary,
  };
}

export default async function IlanDetailPage({ params }: IlanPageProps) {
  const { id } = await params;
  const announcement = await resolveAnnouncement(id);

  if (!announcement) {
    notFound();
  }

  return (
    <AppShell>
      <AnnouncementDetailClient announcement={announcement} />
    </AppShell>
  );
}
