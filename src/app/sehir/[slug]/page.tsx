import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  MapPin,
  ExternalLink,
  Building2,
  Clock,
  Users,
  ShieldCheck,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { resolveOfficialLink } from '@/modules/announcements/official-link';
import { getCityLandingData, getCitySeoCatalog } from '@/modules/analytics';

interface SehirPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getCitySeoCatalog()
    .slice(0, 30)
    .map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: SehirPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getCityLandingData(slug);
  if (!data) {
    return {
      title: 'Şehir Bulunamadı',
    };
  }
  return {
    title: `${data.city} Kamu İlanları ve KPSS Atama İstatistikleri`,
    description: `${data.city} ili için güncel kamu personel alımı, atama ve görevlendirme ilanları ile ${data.archivePostsCount} KPSS merkezi yerleştirme kadro verisi.`,
    alternates: {
      canonical: `/sehir/${data.slug}`,
    },
  };
}

export default async function SehirLandingPage({ params }: SehirPageProps) {
  const { slug } = await params;
  const data = getCityLandingData(slug);

  if (!data) {
    notFound();
  }

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

        {/* City Header */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-2">
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444]">
            <MapPin className="w-4 h-4" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">İl Bazlı İlan ve Arşiv</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {data.city} Kamu İlanları ve KPSS Arşivi
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {data.city} ilindeki kamu ilanları ile KPSS merkezi yerleştirme geçmişine ait resmi kadro ve kontenjan verileri aşağıda özetlenmiştir.
          </p>
        </section>

        {/* KPSS Archive & City Metrics */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">Listelenen İlan</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {data.announcements.length.toLocaleString('tr-TR')}
            </div>
          </div>
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">KPSS Arşiv Kadrosu</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {data.archivePostsCount.toLocaleString('tr-TR')}
            </div>
          </div>
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">Arşiv Kontenjanı</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {data.archiveQuota.toLocaleString('tr-TR')}
            </div>
          </div>
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4">
            <div className="text-xs text-slate-600 dark:text-slate-400">Ort. Taban Puan</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {data.avgMinScore !== null ? data.avgMinScore.toFixed(2) : 'Belirtilmemiş'}
            </div>
          </div>
        </section>

        {/* Top Institutions in City */}
        {data.topInstitutions.length > 0 && (
          <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <Building2 className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {data.city} İlindeki Başlıca Kurumlar (KPSS Arşivi)
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {data.topInstitutions.map((inst) => (
                <div
                  key={inst.name}
                  className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 flex items-center justify-between gap-2"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {inst.name}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 shrink-0 tabular-nums">
                    {inst.quota.toLocaleString('tr-TR')} kişi
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Announcements List */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {data.city} İlanları
          </h2>

          {data.announcements.length === 0 ? (
            <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 text-sm text-slate-600 dark:text-slate-400">
              Bu il için şu anda doğrudan il bazlı açık veya arşiv ilanı bulunmuyor. Aşağıdaki Türkiye geneli ilanları veya ana akışı inceleyebilirsiniz.
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
                      href={resolveOfficialLink(item).href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3.5 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span>Resmî Kaynak</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* National Announcements also open to residents */}
        {data.nationalAnnouncements.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {data.city} Adaylarının Başvurabileceği Türkiye Geneli İlanlar ({data.nationalAnnouncements.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.nationalAnnouncements.slice(0, 6).map((item) => (
                <article
                  key={item.id}
                  className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      {item.sourceName} | {item.institution}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      <Link
                        href={`/ilan/${item.id}`}
                        className="hover:text-[#b91c1c] dark:hover:text-[#ef4444]"
                      >
                        {item.title}
                      </Link>
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      Son Başvuru: {item.deadlineAt}
                    </div>
                  </div>
                  <Link
                    href={`/ilan/${item.id}`}
                    className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    İlan Detayını Gör
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}

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
