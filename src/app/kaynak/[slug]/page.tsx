import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  Globe,
  ExternalLink,
  MapPin,
  Clock,
  Users,
  ShieldCheck,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { getSourceLandingData } from '@/modules/analytics';
import { getDb } from '@/modules/db';

interface KaynakPageProps {
  params: Promise<{ slug: string }>;
}

const VALID_SOURCE_SLUGS = ['kariyer-kapisi', 'iskur', 'resmi-gazete'] as const;

export async function generateStaticParams() {
  return VALID_SOURCE_SLUGS.map((slug) => ({ slug }));
}

async function resolveSourceData(slug: string) {
  try {
    const db = await getDb();
    const items = await db.listAnnouncements({ status: 'hepsi' });
    if (items.length > 0) {
      return getSourceLandingData(slug, items);
    }
  } catch {
    // Fallback to default seed dataset
  }
  return getSourceLandingData(slug);
}

export async function generateMetadata({ params }: KaynakPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await resolveSourceData(slug);
  if (!data) {
    return {
      title: 'Resmî Kaynak Bulunamadı',
    };
  }
  return {
    title: `${data.sourceName} Kamu İlanları`,
    description: data.description,
    alternates: {
      canonical: `/kaynak/${data.slug}`,
    },
  };
}

export default async function KaynakLandingPage({ params }: KaynakPageProps) {
  const { slug } = await params;
  const data = await resolveSourceData(slug);

  if (!data) {
    notFound();
  }

  const openCount = data.announcements.filter((item) => item.status === 'acik').length;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/analiz"
            className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Analiz Sayfasına Dön</span>
          </Link>
          <Link
            href="/"
            className="min-h-[44px] inline-flex items-center text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444]"
          >
            Tüm İlan Akışı
          </Link>
        </div>

        {/* Source Header */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444]">
              <Globe className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs font-semibold">Resmî İlan Kaynağı</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {data.sourceName} İlanları
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
              {data.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap gap-4 text-xs tabular-nums">
              <span className="text-slate-700 dark:text-slate-300">
                Toplam İlan: <strong className="text-slate-900 dark:text-slate-100">{data.announcements.length}</strong>
              </span>
              <span className="text-slate-700 dark:text-slate-300">
                Başvuruya Açık: <strong className="text-slate-900 dark:text-slate-100">{openCount}</strong>
              </span>
            </div>

            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center gap-2"
            >
              <span>Resmî Kaynak Sitesine Git</span>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* Source Announcements */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {data.sourceName} Kapsamındaki İlanlar
          </h2>

          {data.announcements.length === 0 ? (
            <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 text-sm text-slate-600 dark:text-slate-400">
              Bu kaynak için şu anda listelenen ilan bulunmuyor.
            </div>
          ) : (
            <div className="space-y-3">
              {data.announcements.map((item) => (
                <article
                  key={item.id}
                  className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                        {item.sourceName}
                      </span>
                      <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 tabular-nums">
                        {item.status === 'acik' ? 'Başvuruya Açık' : 'Kapalı'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {item.institution}
                    </p>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      <Link
                        href={`/ilan/${item.id}`}
                        className="hover:text-[#b91c1c] dark:hover:text-[#ef4444]"
                      >
                        {item.title}
                      </Link>
                    </h3>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                        {item.city}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        Son Başvuru: {item.deadlineAt}
                      </span>
                      {item.quota !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" aria-hidden="true" />
                          {item.quota} Kişi
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                      href={`/ilan/${item.id}`}
                      className="min-h-[44px] px-3.5 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center"
                    >
                      İlan Detayı
                    </Link>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3.5 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span>Resmî İlan</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Binding Disclaimer */}
        <section className="border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong className="text-slate-900 dark:text-slate-100">Resmî Bağlayıcılık Uyarısı:</strong>{' '}
            Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
