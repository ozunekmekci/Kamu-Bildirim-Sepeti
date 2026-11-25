import React from 'react';
import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import KpssArchiveClient from '@/components/KpssArchiveClient';

export const metadata: Metadata = {
  title: 'KPSS Merkezi Yerleştirme ve Nitelik Kodu Arşivi',
  description:
    '2024-2026 KPSS B Grubu merkezi yerleştirme kadroları, lisans (KPSSP3), önlisans (KPSSP93) ve ortaöğretim (KPSSP94) taban puanları ve nitelik kodu arama aracı.',
  alternates: {
    canonical: '/kpss-arsivi',
  },
};

export default function KpssArsiviPage() {
  return (
    <AppShell>
      <KpssArchiveClient />
    </AppShell>
  );
}
