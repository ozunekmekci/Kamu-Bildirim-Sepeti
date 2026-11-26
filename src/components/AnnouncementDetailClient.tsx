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
  Layers,
  ShieldCheck,
} from 'lucide-react';
import type {
  Announcement,
  AnnouncementPosition,
  EmploymentType,
  ExamType,
  NoticeType,
} from '@/modules/announcements/types';
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

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  memur_a: 'A Grubu Memur',
  memur_b: 'B Grubu Memur',
  sozlesmeli_4b: '4/B Sözleşmeli',
  akademik: 'Akademik',
  isci: 'Kamu İşçi',
  askeri_guvenlik: 'Askerî & Kolluk',
  gorevde_yukselme: 'Görevde Yükselme',
  diger: 'Diğer',
};

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  kpss_only: 'Mülakatsız KPSS',
  oral_exam: 'Sözlü Sınav',
  written_and_oral: 'Yazılı & Sözlü',
  practice_exam: 'Uygulamalı Sınav',
  unspecified: 'Belirtilmemiş',
};

const NOTICE_BANNER_COPY: Record<
  Exclude<NoticeType, 'ilan'>,
  { title: string; body: string; toneClass: string }
> = {
  iptal: {
    title: 'İptal İlanı Duyurusu',
    body: 'Bu duyuru ilgili kamu kurumu tarafından yayımlanan bir iptal ilanıdır. Başvuru veya değerlendirme durumu için resmî ilan metnini kontrol ediniz.',
    toneClass:
      'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-950 dark:text-red-100',
  },
  duzeltme: {
    title: 'Düzeltme / Zeyilname Duyurusu',
    body: 'Bu ilanda başvuru tarihleri, kontenjan veya özel şartlara ilişkin düzeltme yayımlanmıştır. Güncel koşullar için resmî metni inceleyiniz.',
    toneClass:
      'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100',
  },
  sonuc: {
    title: 'Sonuç / Yerleştirme Duyurusu',
    body: 'Bu kayıt ilgili alım sürecine ait sonuç veya nihai yerleştirme duyurusudur.',
    toneClass:
      'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100',
  },
};

export function AnnouncementDetailClient({ announcement }: AnnouncementDetailClientProps) {
  const [fetchedDetail, setFetchedDetail] = useState<{
    id: string;
    announcement: Announcement;
    positions: AnnouncementPosition[];
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [matchEval, setMatchEval] = useState<MatchEvaluation | null>(null);
  const [matchLocked, setMatchLocked] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  const detail =
    fetchedDetail && fetchedDetail.id === announcement.id
      ? fetchedDetail.announcement
      : announcement;
  const positions =
    fetchedDetail && fetchedDetail.id === announcement.id
      ? fetchedDetail.positions
      : (announcement.positions ?? []);

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
            announcement?: Announcement;
            positions?: AnnouncementPosition[];
            saved?: boolean;
            match?: MatchEvaluation | null;
            canUseProfileMatch?: boolean;
          };
          const nextAnnouncement = data.announcement ?? announcement;
          const nextPositions = Array.isArray(data.positions)
            ? data.positions
            : Array.isArray(data.announcement?.positions)
              ? data.announcement.positions
              : (announcement.positions ?? []);
          if (data.announcement || Array.isArray(data.positions)) {
            setFetchedDetail({
              id: announcement.id,
              announcement: nextAnnouncement,
              positions: nextPositions,
            });
          }
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
  }, [announcement]);

  const handleToggleSave = async () => {
    setSaveMessage(null);
    setSaving(true);
    try {
      const res = await fetch(
        isSaved
          ? `/api/saved?announcementId=${encodeURIComponent(detail.id)}`
          : '/api/saved',
        {
          method: isSaved ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isSaved ? undefined : JSON.stringify({ announcementId: detail.id }),
        }
      );
      if (res.status === 401) {
        setSaveMessage('İlanı kaydetmek için giriş yapmanız veya ücretsiz hesap oluşturmanız gerekir.');
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

  const daysLeft = getDeadlineDaysLeft(detail.deadlineAt);
  const noticeInfo =
    detail.noticeType && detail.noticeType !== 'ilan'
      ? NOTICE_BANNER_COPY[detail.noticeType]
      : null;
  const verifiedSources = detail.verifiedSources ?? [];
  const hasApplyUrl = Boolean(detail.applyUrl && detail.applyUrl.trim().length > 0);

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-5">
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
        {noticeInfo && (
          <div role="note" className={`border p-4 text-xs flex items-start gap-2.5 ${noticeInfo.toneClass}`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-0.5">
              <div className="font-bold">{noticeInfo.title}</div>
              <p className="leading-relaxed">{noticeInfo.body}</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {detail.sourceName}
            </span>
            <span className="px-2.5 py-1 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300">
              {CATEGORY_LABELS[detail.category]}
            </span>
            {detail.employmentType && detail.employmentType !== 'diger' && (
              <span className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                {EMPLOYMENT_TYPE_LABELS[detail.employmentType]}
              </span>
            )}
            {detail.examType && detail.examType !== 'unspecified' && (
              <span
                className={`px-2.5 py-1 border ${
                  detail.examType === 'kpss_only'
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                {EXAM_TYPE_LABELS[detail.examType]}
              </span>
            )}
            <span className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 tabular-nums">
              {detail.status === 'acik' ? 'Başvuruya Açık' : 'Başvuru Kapalı'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <Building2 className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
            <span>{detail.institution}</span>
            {detail.organizationUnit && (
              <span className="text-xs font-normal text-slate-600 dark:text-slate-400">
                ({detail.organizationUnit})
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {detail.title}
          </h1>

          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {detail.summary}
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

            {hasApplyUrl && (
              <a
                href={detail.applyUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2"
              >
                <span>Resmî Başvuru / e-Devlet</span>
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
            )}

            <a
              href={detail.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={
                hasApplyUrl
                  ? 'min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-bold inline-flex items-center gap-2'
                  : 'min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2'
              }
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

        {/* Verified Sources when multi-source */}
        {verifiedSources.length > 1 && (
          <section className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span>Çoklu Resmî Kaynak Doğrulaması ({verifiedSources.length} Kaynak)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {verifiedSources.map((ref) => (
                <a
                  key={`${ref.source}-${ref.url}`}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827] hover:border-[#b91c1c] dark:hover:border-[#ef4444] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5"
                >
                  <span>{ref.sourceName}</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Şehir
            </span>
            <strong className="text-sm text-slate-900 dark:text-slate-100">{detail.city}</strong>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <Users className="w-3.5 h-3.5" aria-hidden="true" /> Kontenjan
            </span>
            <strong className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">
              {detail.quota !== null ? `${detail.quota} Kişi` : 'Belirtilmemiş'}
            </strong>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 block mb-1">Yayımlanma</span>
            <strong className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">
              {detail.publishedAt}
            </strong>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Son Başvuru
            </span>
            <strong className="text-sm text-slate-900 dark:text-slate-100 tabular-nums">
              {detail.deadlineAt} (
              {detail.status === 'kapali' || daysLeft < 0
                ? 'Kapalı'
                : daysLeft === 0
                  ? 'Son Gün'
                  : `${daysLeft} gün`}
              )
            </strong>
          </div>
        </div>

        {/* Sub-Positions Table */}
        {positions.length > 0 && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                <span>Alt Kadrolar ve Pozisyon Dağılımı ({positions.length})</span>
              </h2>
            </div>

            <div className="overflow-x-auto border border-slate-300 dark:border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-800">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-bold">Pozisyon</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">İl / İlçe</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Kontenjan</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Öğrenim</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">KPSS / Puan</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Sınav Türü</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {positions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-slate-900/60"
                    >
                      <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                        <div>{pos.title}</div>
                        {pos.unvan && pos.unvan !== pos.title && (
                          <div className="text-[11px] font-normal text-slate-600 dark:text-slate-400">
                            {pos.unvan}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {pos.city}
                        {pos.district ? ` / ${pos.district}` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 tabular-nums">
                        {pos.quota !== null ? `${pos.quota} Kişi` : 'Belirtilmemiş'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {pos.educationLevel ? EDUCATION_LABELS[pos.educationLevel] : 'Genel'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200 tabular-nums">
                        {pos.kpssScoreType
                          ? `${pos.kpssScoreType}${pos.minKpssScore !== null ? ` (${pos.minKpssScore})` : ''}`
                          : pos.minKpssScore !== null
                            ? `En az ${pos.minKpssScore}`
                            : 'KPSS Şartı Yok'}
                      </td>
                      <td className="px-3 py-2.5">
                        {pos.isInterviewFree ? (
                          <span className="inline-block px-2 py-0.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold">
                            Mülakatsız
                          </span>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">
                            {pos.evaluationMethod || 'Belirtilmemiş'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Criteria Summary */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Başvuru Şartları ve Kriter Özeti
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            {detail.criteria.summaryLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div className="border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Öğrenim Düzeyleri</span>
              <strong className="text-slate-900 dark:text-slate-100">
                {detail.criteria.educationLevels.length > 0
                  ? detail.criteria.educationLevels.map((l) => EDUCATION_LABELS[l]).join(', ')
                  : 'Genel'}
              </strong>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 p-3">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">KPSS Şartı</span>
              <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                {detail.criteria.kpssScoreTypes.length > 0
                  ? `${detail.criteria.kpssScoreTypes.join(', ')}${
                      detail.criteria.minKpssScore !== null
                        ? ` (En az ${detail.criteria.minKpssScore})`
                        : ''
                    }`
                  : 'KPSS Şartı Belirtilmemiş'}
              </strong>
            </div>
            {detail.criteria.qualificationCodes.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-800 p-3 sm:col-span-2">
                <span className="text-slate-500 dark:text-slate-400 block mb-1.5">
                  Aranan Nitelik Kodları
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {detail.criteria.qualificationCodes.map((code) => (
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
              <div className="flex flex-wrap items-center gap-3 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                <span>
                  Uyum Skoru: %{matchEval.matchScore} (
                  {matchEval.eligible ? 'Profilinizle Uyumlu' : 'Eksik veya Uyumsuz Kriter Var'})
                </span>
                {typeof matchEval.matchedPositionCount === 'number' &&
                  typeof matchEval.totalPositionCount === 'number' &&
                  matchEval.totalPositionCount > 0 && (
                    <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827]">
                      {matchEval.matchedPositionCount} / {matchEval.totalPositionCount} Alt Kadro Uygun
                    </span>
                  )}
                {typeof matchEval.scoreMargin === 'number' && (
                  <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827]">
                    Puan Farkı: {matchEval.scoreMargin >= 0 ? `+${matchEval.scoreMargin}` : matchEval.scoreMargin}
                  </span>
                )}
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
              {matchEval.matchedPositions && matchEval.matchedPositions.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    Kadro Bazlı Değerlendirme
                  </div>
                  <div className="space-y-1.5">
                    {matchEval.matchedPositions.map((mp) => (
                      <div
                        key={mp.id}
                        className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {mp.title}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400 ml-2">
                            ({mp.city})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 tabular-nums">
                          {typeof mp.scoreMargin === 'number' && (
                            <span className="text-slate-700 dark:text-slate-300">
                              Fark: {mp.scoreMargin >= 0 ? `+${mp.scoreMargin}` : mp.scoreMargin}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 border font-bold ${
                              mp.eligible
                                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                                : 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                            }`}
                          >
                            {mp.eligible ? 'Uygun' : 'Uyumsuz'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
