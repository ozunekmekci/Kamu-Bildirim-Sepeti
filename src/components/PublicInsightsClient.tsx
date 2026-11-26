'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Building2,
  MapPin,
  FileCode2,
  Calendar,
  Layers,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { SourceCheckpoint } from '@/modules/announcements/types';
import {
  getPublicInsightsSummary,
  getCitySeoCatalog,
  type PublicInsightsSummary,
  type CitySeoCatalogEntry,
} from '@/modules/analytics';

export interface PublicInsightsClientProps {
  summary?: PublicInsightsSummary;
  cityCatalog?: CitySeoCatalogEntry[];
}

const SOURCE_CARDS = [
  {
    slug: 'kariyer-kapisi',
    name: 'Kariyer Kapısı',
    subtitle: 'Cumhurbaşkanlığı İnsan Kaynakları Ofisi Kamu İşe Alım Platformu',
    href: '/kaynak/kariyer-kapisi',
  },
  {
    slug: 'kamuilan-sbb',
    name: 'SBB Kamu İlan',
    subtitle: 'Cumhurbaşkanlığı Strateji ve Bütçe Başkanlığı Kamu Personeli Alım İlanları',
    href: '/kaynak/kamuilan-sbb',
  },
  {
    slug: 'iskur',
    name: 'İŞKUR',
    subtitle: 'Türkiye İş Kurumu Kamu İşçi ve Memur Alım İlanları',
    href: '/kaynak/iskur',
  },
  {
    slug: 'resmi-gazete',
    name: 'Resmî Gazete',
    subtitle: 'T.C. Resmî Gazete Çeşitli İlanlar ve Akademik/Kamu Duyuruları',
    href: '/kaynak/resmi-gazete',
  },
];

const SYNC_SOURCE_LABELS: Record<string, string> = {
  kariyer_kapisi: 'Kariyer Kapısı',
  sbb: 'SBB Kamu İlan',
  iskur: 'İŞKUR',
  resmi_gazete: 'Resmî Gazete',
};

const STALE_THRESHOLD_MS = 60 * 60 * 1000;

function formatSyncTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'Bilinmiyor';
  return new Date(ms).toLocaleString('tr-TR');
}

function getCheckpointHealth(cp: SourceCheckpoint, nowMs: number): {
  isWarning: boolean;
  reason: string | null;
} {
  const err = typeof cp.lastError === 'string' ? cp.lastError.trim() : '';
  if (err.length > 0) {
    return { isWarning: true, reason: err };
  }
  const checkedMs = Date.parse(cp.lastCheckedAt);
  if (Number.isNaN(checkedMs)) {
    return { isWarning: true, reason: 'Kontrol zamanı doğrulanamadı' };
  }
  if (nowMs - checkedMs > STALE_THRESHOLD_MS) {
    return { isWarning: true, reason: 'Son kontrol 60 dakikadan eski' };
  }
  return { isWarning: false, reason: null };
}

function computeBarPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((value / max) * 100)));
}

export function PublicInsightsClient({
  summary: propSummary,
  cityCatalog: propCityCatalog,
}: PublicInsightsClientProps) {
  const summary = propSummary ?? getPublicInsightsSummary();
  const cityCatalog = propCityCatalog ?? getCitySeoCatalog();

  const [checkpoints, setCheckpoints] = useState<SourceCheckpoint[]>([]);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncFetchedAtMs, setSyncFetchedAtMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let active = true;

    fetch('/api/sync/status', { cache: 'no-store' })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          setSyncError('Canlı kaynak sağlık verileri alınamadı.');
          return;
        }
        const data = (await res.json()) as {
          checkpoints?: SourceCheckpoint[];
        };
        if (!active) return;
        setSyncFetchedAtMs(Date.now());
        setCheckpoints(Array.isArray(data.checkpoints) ? data.checkpoints : []);
      })
      .catch(() => {
        if (active) {
          setSyncError('Canlı kaynak sağlık servisine bağlanılamadı.');
        }
      })
      .finally(() => {
        if (active) {
          setSyncLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const maxInstQuota = summary.topInstitutions.reduce(
    (acc, item) => Math.max(acc, item.quota),
    0
  );
  const maxCityScore = summary.topCities.reduce(
    (acc, item) => Math.max(acc, item.archiveQuota + item.openAnnouncementsCount * 50),
    0
  );
  const maxQualCount = summary.topQualificationCodes.reduce(
    (acc, item) => Math.max(acc, item.count),
    0
  );
  const maxPeriodQuota = summary.periodBreakdown.reduce(
    (acc, item) => Math.max(acc, item.totalQuota),
    0
  );
  const maxCategoryTotal = summary.categoryBreakdown.reduce(
    (acc, item) => Math.max(acc, item.totalCount),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Page Header */}
      <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-2">
        <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444]">
          <BarChart3 className="w-4 h-4" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Kamu Bildirim Sepeti Veri Analizi
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          Kamu İlanları, Şehir Dağılımı ve KPSS Arşiv Analizi
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
          Bu sayfadaki tüm göstergeler Kamu Bildirim Sepeti ilan akışı ile KPSS merkezi yerleştirme arşivindeki gerçek kayıtlardan anlık olarak hesaplanır.
        </p>
      </section>

      {/* 4-Column Metric Row */}
      <section aria-label="Temel Göstergeler" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Aktif Açık İlan
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {summary.totalOpenAnnouncements.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Toplam {summary.totalAllAnnouncements.toLocaleString('tr-TR')} kayıtlı ilan içinde
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Toplam Arşiv Kadrosu
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {summary.totalArchivePosts.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            KPSS merkezi yerleştirme kalemi
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Toplam Arşiv Kontenjanı
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {summary.totalArchiveQuota.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Arşiv dönemleri toplam kişi sayısı
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 space-y-1">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            İzlenen İl Sayısı
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {cityCatalog.length.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            İl bazlı SEO ve ilan sayfası
          </div>
        </div>
      </section>

      {/* Official Source Cards */}
      <section aria-label="Resmî Kaynak Kanalları" className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Resmî Kaynak Arşivleri
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {SOURCE_CARDS.map((card) => (
            <Link
              key={card.slug}
              href={card.href}
              className="min-h-[44px] bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 hover:border-[#b91c1c] dark:hover:border-[#ef4444] p-4 flex flex-col justify-between gap-2 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {card.name}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {card.subtitle}
                </p>
              </div>
              <span className="text-xs font-bold text-[#b91c1c] dark:text-[#ef4444]">
                Kaynak İlanlarını İncele
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Live Source Health & Parser Status */}
      <section
        aria-label="Canlı Kaynak Sağlığı ve Ayrıştırıcı Durumu"
        className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 sm:p-5 space-y-3"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <RefreshCw className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Canlı Kaynak Sağlığı ve Ayrıştırıcı Durumu
          </h2>
        </div>

        {syncLoading ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Kaynak sağlığı kontrol ediliyor...
          </p>
        ) : syncError ? (
          <div
            role="alert"
            className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 flex items-center gap-2 text-xs text-red-900 dark:text-red-200"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{syncError}</span>
          </div>
        ) : checkpoints.length === 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Henüz kayıtlı kaynak senkronizasyon kontrolü bulunmuyor.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {checkpoints.map((cp) => {
              const health = getCheckpointHealth(cp, syncFetchedAtMs);
              const sourceLabel = SYNC_SOURCE_LABELS[cp.source] ?? cp.source;
              return (
                <div
                  key={cp.source}
                  className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {sourceLabel}
                    </span>
                    {health.isWarning ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-[11px] font-semibold shrink-0">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                        Uyarı
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-[11px] font-semibold shrink-0">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        Sağlıklı
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {cp.activeCount.toLocaleString('tr-TR')} aktif ilan
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                    Son kontrol: {formatSyncTimestamp(cp.lastCheckedAt)}
                  </div>
                  {health.isWarning && health.reason && (
                    <div className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug break-words">
                      {health.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Two Column Breakdown: Top Institutions & Top Cities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top Institutions */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Building2 className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              En Çok Kontenjan Açan Kurumlar
            </h2>
          </div>
          <div className="space-y-3">
            {summary.topInstitutions.map((inst) => {
              const pct = computeBarPercent(inst.quota, maxInstQuota);
              return (
                <div key={inst.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {inst.name}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 shrink-0 tabular-nums">
                      {inst.quota.toLocaleString('tr-TR')} kontenjan ({inst.count} kadro)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-800 w-full">
                    <div
                      className="h-full bg-[#b91c1c] dark:bg-[#dc2626]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top Cities */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Öne Çıkan İller
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              İl detayına gitmek için tıklayın
            </span>
          </div>
          <div className="space-y-2.5">
            {summary.topCities.map((c) => {
              const score = c.archiveQuota + c.openAnnouncementsCount * 50;
              const pct = computeBarPercent(score, maxCityScore);
              return (
                <Link
                  key={c.slug}
                  href={`/sehir/${c.slug}`}
                  className="block min-h-[44px] p-2 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {c.city}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                      {c.openAnnouncementsCount} açık ilan, {c.archiveQuota.toLocaleString('tr-TR')} arşiv kontenjanı
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-800 w-full">
                    <div
                      className="h-full bg-[#b91c1c] dark:bg-[#dc2626]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* Qualification Codes, Period Breakdown & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Top Qualification Codes */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <FileCode2 className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Sık Aranan Nitelik Kodları
            </h2>
          </div>
          <div className="space-y-3">
            {summary.topQualificationCodes.map((q) => {
              const pct = computeBarPercent(q.count, maxQualCount);
              return (
                <div key={q.code} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      <span className="font-mono font-bold text-[#b91c1c] dark:text-red-300 mr-1.5 tabular-nums">
                        {q.code}
                      </span>
                      {q.label}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 shrink-0 tabular-nums">
                      {q.count}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-800 w-full">
                    <div
                      className="h-full bg-slate-700 dark:bg-slate-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Period Breakdown */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Calendar className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              KPSS Dönem Dağılımı
            </h2>
          </div>
          <div className="space-y-3">
            {summary.periodBreakdown.map((p) => {
              const pct = computeBarPercent(p.totalQuota, maxPeriodQuota);
              return (
                <div key={p.period} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {p.period}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                      {p.totalQuota.toLocaleString('tr-TR')} kişi / {p.postsCount} kadro
                      {p.avgMinScore !== null ? ` (Ort: ${p.avgMinScore.toFixed(2)})` : ''}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-800 w-full">
                    <div
                      className="h-full bg-[#b91c1c] dark:bg-[#dc2626]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Category Breakdown */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Layers className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              İlan Türü Dağılımı
            </h2>
          </div>
          <div className="space-y-3">
            {summary.categoryBreakdown.map((cat) => {
              const pct = computeBarPercent(cat.totalCount, maxCategoryTotal);
              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {cat.label}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                      {cat.openCount} açık / {cat.totalCount} toplam
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-800 w-full">
                    <div
                      className="h-full bg-slate-700 dark:bg-slate-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Binding Source Disclaimer */}
      <section className="border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
        <ShieldCheck className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong className="text-slate-900 dark:text-slate-100">Resmî Bağlayıcılık Uyarısı:</strong>{' '}
          Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.
        </p>
      </section>
    </div>
  );
}

export default PublicInsightsClient;
