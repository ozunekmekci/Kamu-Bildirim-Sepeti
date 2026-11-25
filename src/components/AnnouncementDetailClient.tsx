'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Building2,
  MapPin,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Lock,
} from 'lucide-react';
import type { Announcement } from '@/modules/announcements/types';
import { getDeadlineDaysLeft } from '@/modules/announcements/service';
import type { MatchEvaluation } from '@/modules/db/types';

export interface AnnouncementDetailClientProps {
  announcement: Announcement;
}

const EDUCATION_LABELS: Record<'lisans' | 'onlisans' | 'ortaogretim', string> = {
  lisans: 'Lisans',
  onlisans: 'Ön Lisans',
  ortaogretim: 'Ortaöğretim',
};

const CATEGORY_LABELS = {
  atama: 'Atama',
  personel_alimi: 'Personel Alımı',
  gorevlendirme: 'Görevlendirme',
} as const;

export function AnnouncementDetailClient({ announcement }: AnnouncementDetailClientProps) {
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [matchEval, setMatchEval] = useState<MatchEvaluation | null>(null);
  const [matchLocked, setMatchLocked] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/announcements/${encodeURIComponent(announcement.id)}`, { cache: 'no-store' }),
      fetch('/api/auth/me', { cache: 'no-store' }),
    ])
      .then(async ([detailRes, meRes]) => {
        if (!active) return;
        let authed = false;
        if (meRes.ok) {
          const meData = (await meRes.json()) as { authenticated?: boolean };
          authed = Boolean(meData.authenticated);
          setIsLoggedIn(authed);
        }
        if (detailRes.ok) {
          const data = (await detailRes.json()) as {
            saved?: boolean;
            match?: MatchEvaluation | null;
            canUseProfileMatch?: boolean;
          };
          if (typeof data.saved === 'boolean') setIsSaved(data.saved);
          if (data.match) setMatchEval(data.match);
          if (authed && data.canUseProfileMatch === false) {
            setMatchLocked(true);
          }
        }
      })
      .catch(() => {
        // SSR initial data remains visible
      });
    return () => {
      active = false;
    };
  }, [announcement.id]);

  const handleToggleSave = async () => {
    setSaveMessage(null);
    setSaving(true);
    try {
      const res = await fetch(
        isSaved
          ? `/api/saved?announcementId=${encodeURIComponent(announcement.id)}`
          : '/api/saved',
        {
          method: isSaved ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isSaved ? undefined : JSON.stringify({ announcementId: announcement.id }),
        }
      );
      if (res.status === 401) {
        setSaveMessage('İlanı kaydetmek için giriş yapınız veya ücretsiz hesap oluşturunuz.');
        return;
      }
      if (res.status === 403) {
        const d = (await res.json()) as { error?: string };
        setSaveMessage(d.error || 'Ücretsiz planda kayıt sınırına ulaştınız.');
        return;
      }
      if (!res.ok) {
        setSaveMessage('İşlem tamamlanamadı.');
        return;
      }
      setIsSaved((prev) => !prev);
      setSaveMessage(isSaved ? 'İlan kayıtlı listenizden çıkarıldı.' : 'İlan kayıtlı listenize eklendi.');
    } catch {
      setSaveMessage('Sunucuya bağlanılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const daysLeft = getDeadlineDaysLeft(announcement.deadlineAt);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-5">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>İlan Akışına Dön</span>
        </Link>
      </div>

      <article className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-7 space-y-6">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {announcement.sourceName}
            </span>
            <span className="px-2.5 py-1 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300">
              {CATEGORY_LABELS[announcement.category]}
            </span>
            <span className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 tabular-nums">
              {announcement.status === 'acik' ? 'Başvuruya Açık' : 'Başvuru Kapalı'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <Building2 className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <span>{announcement.institution}</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {announcement.title}
          </h1>

          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {announcement.summary}
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleToggleSave}
              disabled={saving}
              aria-pressed={isSaved}
              className={`min-h-[44px] px-4 py-2 border text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer ${
                isSaved
                  ? 'border-[#b91c1c] dark:border-[#ef4444] bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
                  <span>Kayıtlı İlanlardan Çıkar</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4" aria-hidden="true" />
                  <span>İlanı Kaydet</span>
                </>
              )}
            </button>

            <a
              href={announcement.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2"
            >
              <span>Resmî İlan Metnine Git</span>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>

          {saveMessage && (
            <p role="status" className="text-xs font-semibold text-amber-800 dark:text-amber-300 pt-1">
              {saveMessage}
            </p>
          )}
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Şehir
            </span>
            <strong className="text-sm text-slate-900 dark:text-slate-100">{announcement.city}</strong>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <Users className="w-3.5 h-3.5" aria-hidden="true" /> Kontenjan
            </span>
            <strong className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">
              {announcement.quota !== null ? `${announcement.quota} Kişi` : 'Belirtilmemiş'}
            </strong>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 block mb-1">Yayımlanma</span>
            <strong className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">
              {announcement.publishedAt}
            </strong>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Son Başvuru
            </span>
            <strong className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">
              {announcement.deadlineAt} (
              {announcement.status === 'kapali' || daysLeft < 0
                ? 'Kapalı'
                : daysLeft === 0
                  ? 'Son Gün'
                  : `${daysLeft} gün`}
              )
            </strong>
          </div>
        </div>

        {/* Criteria Summary */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Başvuru Şartları ve Kriter Özeti
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {announcement.criteria.summaryLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div className="border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Öğrenim Düzeyleri</span>
              <strong className="text-slate-900 dark:text-slate-100">
                {announcement.criteria.educationLevels.length > 0
                  ? announcement.criteria.educationLevels.map((l) => EDUCATION_LABELS[l]).join(', ')
                  : 'Genel'}
              </strong>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">KPSS Şartı</span>
              <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                {announcement.criteria.kpssScoreTypes.length > 0
                  ? `${announcement.criteria.kpssScoreTypes.join(', ')}${
                      announcement.criteria.minKpssScore !== null
                        ? ` (En az ${announcement.criteria.minKpssScore})`
                        : ''
                    }`
                  : 'KPSS Şartı Belirtilmemiş'}
              </strong>
            </div>
            {announcement.criteria.qualificationCodes.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-800 p-3 sm:col-span-2">
                <span className="text-slate-500 dark:text-slate-400 block mb-1.5">
                  Aranan Nitelik Kodları
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {announcement.criteria.qualificationCodes.map((code) => (
                    <span
                      key={code}
                      className="px-2 py-0.5 font-mono font-bold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 tabular-nums"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Profile Match Breakdown */}
        <section className="border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 space-y-2.5">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Profil Uygunluk Dökümü
          </h2>
          {matchEval ? (
            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                Uyum Skoru: %{matchEval.matchScore} (
                {matchEval.eligible ? 'Profilinizle Uyumlu' : 'Eksik veya Uyumsuz Kriter Var'})
              </div>
              {matchEval.matchedReasons.map((r, i) => (
                <div key={`m-${i}`} className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{r}</span>
                </div>
              ))}
              {matchEval.missingReasons.map((r, i) => (
                <div key={`x-${i}`} className="flex items-center gap-1.5 text-red-700 dark:text-red-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{r}</span>
                </div>
              ))}
              {matchEval.unknownReasons.map((r, i) => (
                <div key={`u-${i}`} className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          ) : matchLocked ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                Detaylı profil uygunluk dökümü Premium planda sunulmaktadır.
              </span>
              <Link href="/premium" className="font-bold text-[#b91c1c] dark:text-[#ef4444] underline">
                Planları İncele
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span>
                {isLoggedIn
                  ? 'Uygunluk değerlendirmesi için aday profil bilgilerinizi doldurun.'
                  : 'Bu ilanın profilinize uygunluğunu görmek için giriş yapın ve profilinizi tamamlayın.'}
              </span>
              <Link
                href={isLoggedIn ? '/profil' : '/giris'}
                className="font-bold text-[#b91c1c] dark:text-[#ef4444] underline"
              >
                {isLoggedIn ? 'Profili Tamamla' : 'Giriş Yap'}
              </Link>
            </div>
          )}
        </section>

        {/* Binding Source Disclaimer */}
        <section className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-950 dark:text-amber-100 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong>Resmî Kaynak Uyarısı:</strong> Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.
          </p>
        </section>
      </article>
    </div>
  );
}

export default AnnouncementDetailClient;
