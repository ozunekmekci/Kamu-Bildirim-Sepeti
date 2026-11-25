'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Trash2,
  ExternalLink,
  Clock,
  MapPin,
  AlertCircle,
  Lock,
  RefreshCw,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import type { Announcement } from '@/modules/announcements/types';
import { getDeadlineDaysLeft } from '@/modules/announcements/service';

interface SavedEntry {
  savedAt: string;
  announcement: Announcement;
}

export default function KayitliPage() {
  const [items, setItems] = useState<SavedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [maxSaved, setMaxSaved] = useState<number | null>(10);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthRequired(false);
    try {
      const [savedRes, billingRes] = await Promise.all([
        fetch('/api/saved', { cache: 'no-store' }),
        fetch('/api/billing', { cache: 'no-store' }),
      ]);

      if (savedRes.status === 401) {
        setAuthRequired(true);
        setItems([]);
        return;
      }

      if (!savedRes.ok) {
        setError('Kayıtlı ilanlar yüklenirken bir hata oluştu.');
        return;
      }

      const data = (await savedRes.json()) as { items?: SavedEntry[] };
      setItems(data.items ?? []);

      if (billingRes.ok) {
        const bData = (await billingRes.json()) as {
          entitlements?: { plan: 'free' | 'premium'; maxSaved: number | null };
        };
        if (bData.entitlements) {
          setPlan(bData.entitlements.plan);
          setMaxSaved(bData.entitlements.maxSaved);
        }
      }
    } catch {
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/saved', { cache: 'no-store' }),
      fetch('/api/billing', { cache: 'no-store' }),
    ])
      .then(async ([savedRes, billingRes]) => {
        if (!active) return;
        if (savedRes.status === 401) {
          setAuthRequired(true);
          setItems([]);
          return;
        }
        if (!savedRes.ok) {
          setError('Kayıtlı ilanlar yüklenirken bir hata oluştu.');
          return;
        }
        const data = (await savedRes.json()) as { items?: SavedEntry[] };
        setItems(data.items ?? []);
        if (billingRes.ok) {
          const bData = (await billingRes.json()) as {
            entitlements?: { plan: 'free' | 'premium'; maxSaved: number | null };
          };
          if (bData.entitlements) {
            setPlan(bData.entitlements.plan);
            setMaxSaved(bData.entitlements.maxSaved);
          }
        }
      })
      .catch(() => {
        if (active) setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRemove = async (announcementId: string) => {
    setRemovingId(announcementId);
    setError(null);
    try {
      const res = await fetch(
        `/api/saved?announcementId=${encodeURIComponent(announcementId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        setError('İlan kayıttan çıkarılamadı.');
        return;
      }
      setItems((prev) => prev.filter((entry) => entry.announcement.id !== announcementId));
    } catch {
      setError('Bağlantı hatası nedeniyle silme işlemi tamamlanamadı.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-1">
              <Bookmark className="w-4 h-4" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-wider">Takip Listesi</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              Kayıtlı İlanlarım
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Başvurmayı planladığınız kamu ilanlarını tek listede takip edin.
            </p>
          </div>

          {!authRequired && !loading && (
            <div className="text-xs border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 tabular-nums">
              <span className="text-slate-600 dark:text-slate-400 block">Plan Kotası</span>
              <strong className="text-slate-900 dark:text-slate-100">
                {plan === 'premium'
                  ? `${items.length} Kayıtlı (Sınırsız)`
                  : `${items.length} / ${maxSaved ?? 10} Kayıtlı İlan`}
              </strong>
            </div>
          )}
        </div>

        {loading && (
          <div
            role="status"
            className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center text-sm text-slate-600 dark:text-slate-400"
          >
            Kayıtlı ilanlarınız yükleniyor...
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-red-900 dark:text-red-200"
          >
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {error}
            </span>
            <button
              type="button"
              onClick={loadSaved}
              className="min-h-[44px] px-3 py-2 border border-red-400 bg-white dark:bg-slate-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tekrar Dene</span>
            </button>
          </div>
        )}

        {!loading && authRequired && (
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center space-y-3">
            <Lock className="w-7 h-7 text-[#b91c1c] dark:text-[#ef4444] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Kayıtlı İlanlarınızı Görmek İçin Giriş Yapın
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              İlanları sepetinize eklemek ve son başvuru tarihi yaklaşanlar için hatırlatma almak üzere ücretsiz hesap oluşturabilirsiniz.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5 pt-2">
              <Link
                href="/giris"
                className="min-h-[44px] px-4 py-2 bg-[#b91c1c] dark:bg-[#dc2626] text-white text-xs font-bold inline-flex items-center"
              >
                Giriş Yap
              </Link>
              <Link
                href="/kayit"
                className="min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center"
              >
                Ücretsiz Hesap Oluştur
              </Link>
            </div>
          </div>
        )}

        {!loading && !authRequired && !error && items.length === 0 && (
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Henüz kayıtlı ilanınız bulunmuyor.
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              İlan akışındaki &quot;Kaydet&quot; düğmesiyle ilgilendiğiniz ilanları buraya ekleyebilirsiniz.
            </p>
            <Link
              href="/"
              className="min-h-[44px] px-4 py-2 bg-[#b91c1c] dark:bg-[#dc2626] text-white text-xs font-bold inline-flex items-center"
            >
              İlan Akışına Git
            </Link>
          </div>
        )}

        {!loading && !authRequired && items.length > 0 && (
          <div className="space-y-3">
            {items.map(({ announcement }) => {
              const daysLeft = getDeadlineDaysLeft(announcement.deadlineAt);
              return (
                <article
                  key={announcement.id}
                  className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                        {announcement.sourceName}
                      </span>
                      <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 tabular-nums">
                        {announcement.status === 'acik' ? 'Açık' : 'Kapalı'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {announcement.institution}
                    </p>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      <Link
                        href={`/ilan/${announcement.id}`}
                        className="hover:text-[#b91c1c] dark:hover:text-[#ef4444]"
                      >
                        {announcement.title}
                      </Link>
                    </h2>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                        {announcement.city}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        Son Başvuru: {announcement.deadlineAt} (
                        {daysLeft < 0 ? 'Süresi Doldu' : daysLeft === 0 ? 'Son Gün' : `${daysLeft} gün`})
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                      href={`/ilan/${announcement.id}`}
                      className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      İlan Detayı
                    </Link>
                    <a
                      href={announcement.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span>Resmî Kaynak</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemove(announcement.id)}
                      disabled={removingId === announcement.id}
                      className="min-h-[44px] px-3 py-2 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs font-bold text-[#b91c1c] dark:text-red-300 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Kayıttan Çıkar</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
