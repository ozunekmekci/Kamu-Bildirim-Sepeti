import React from 'react';
import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import PublicInsightsClient from '@/components/PublicInsightsClient';
import { getCitySeoCatalog, getPublicInsightsSummary } from '@/modules/analytics';

export const metadata: Metadata = {
  title: 'Kamu İlan Analizi, Kurum ve Şehir İstatistikleri',
  description:
    'Kariyer Kapısı, İŞKUR ve Resmî Gazete kamu ilanları ile 2024-2026 KPSS merkezi yerleştirme verilerine dayalı kurum, şehir, nitelik kodu ve dönem analizleri.',
  alternates: {
    canonical: '/analiz',
  },
};

export default function AnalizPage() {
  const summary = getPublicInsightsSummary();
  const cityCatalog = getCitySeoCatalog();

  return (
    <AppShell>
      <PublicInsightsClient summary={summary} cityCatalog={cityCatalog} />
    </AppShell>
  );
}
