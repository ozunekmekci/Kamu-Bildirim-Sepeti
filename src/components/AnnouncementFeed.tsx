'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Clock,
  Building2,
  MapPin,
  Users,
  X,
  Lock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementSource,
} from '@/modules/announcements/types';
import {
  filterAnnouncements,
  getAnnouncementFacets,
  getDeadlineDaysLeft,
} from '@/modules/announcements/service';

interface AuthUserSummary {
  id: string;
  email: string;
  fullName?: string | null;
  plan?: 'free' | 'premium';
}

interface MatchItemPayload {
  announcement: Announcement;
  evaluation: {
    announcementId: string;
    eligible: boolean;
    matchScore: number;
    matchedReasons: string[];
    missingReasons: string[];
    unknownReasons: string[];
  };
}

export interface AnnouncementFeedProps {
  initialAnnouncements?: Announcement[];
  initialUser?: AuthUserSummary | null;
}

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  atama: 'Atama',
  personel_alimi: 'Personel Alımı',
  gorevlendirme: 'Görevlendirme',
};

const SOURCE_LABELS: Record<AnnouncementSource, string> = {
  kariyer_kapisi: 'Kariyer Kapısı',
  iskur: 'İŞKUR',
  resmi_gazete: 'Resmî Gazete',
  osym_kpss: 'ÖSYM KPSS',
};

const EDUCATION_LABELS: Record<'lisans' | 'onlisans' | 'ortaogretim', string> = {
  lisans: 'Lisans',
  onlisans: 'Ön Lisans',
  ortaogretim: 'Ortaöğretim',
};

export function AnnouncementFeed({
  initialAnnouncements = [],
  initialUser = null,
}: AnnouncementFeedProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [loadingFeed, setLoadingFeed] = useState<boolean>(initialAnnouncements.length === 0);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [limitApplied, setLimitApplied] = useState<number | null>(null);
  const [totalAvailable, setTotalAvailable] = useState<number>(initialAnnouncements.length);

  const [user, setUser] = useState<AuthUserSummary | null>(initialUser);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'error' | 'auth' | 'limit' | 'success';
    message: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'acik' | 'kapali' | 'matched'>('acik');
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<AnnouncementCategory | 'hepsi'>('hepsi');
  const [source, setSource] = useState<AnnouncementSource | 'hepsi'>('hepsi');
  const [city, setCity] = useState<string>('hepsi');

  // Matched tab state
  const [matchedLoading, setMatchedLoading] = useState<boolean>(false);
  const [matchedError, setMatchedError] = useState<string | null>(null);
  const [matchedAuthRequired, setMatchedAuthRequired] = useState<boolean>(false);
  const [matchedLocked, setMatchedLocked] = useState<boolean>(false);
  const [matchedTotalCount, setMatchedTotalCount] = useState<number>(0);
  const [matchedItems, setMatchedItems] = useState<MatchItemPayload[]>([]);

  // Criteria Drawer state
  const [drawerItem, setDrawerItem] = useState<Announcement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const applyFeedResults = useCallback(
    (
      annData: {
        items?: Announcement[];
        announcements?: Announcement[];
        total?: number;
        limited?: boolean;
        limit?: number | null;
        limitApplied?: number | null;
      } | null,
      meData: { user?: AuthUserSummary | null } | null,
      savedData: {
        items?: Array<{ announcement: Announcement }>;
        savedIds?: string[];
        ids?: string[];
      } | null
    ) => {
      if (annData) {
        const list = annData.items ?? annData.announcements ?? [];
        if (list.length > 0 || initialAnnouncements.length === 0) {
          setAnnouncements(list);
          setTotalAvailable(annData.total ?? list.length);
          const effectiveLimit =
            annData.limitApplied ?? (annData.limited ? annData.limit ?? null : null);
          setLimitApplied(effectiveLimit);
        }
      }
      if (meData) {
        setUser(meData.user ?? null);
      }
      if (savedData) {
        const resolvedIds = savedData.savedIds ?? savedData.ids;
        if (Array.isArray(resolvedIds)) {
          setSavedIds(new Set(resolvedIds));
        } else if (Array.isArray(savedData.items)) {
          setSavedIds(new Set(savedData.items.map((entry) => entry.announcement.id)));
        }
      }
    },
    [initialAnnouncements.length]
  );

  const fetchFeedAndUser = useCallback(async () => {
    setFeedError(null);
    if (announcements.length === 0) setLoadingFeed(true);
    try {
      const [annRes, meRes, savedRes] = await Promise.all([
        fetch('/api/announcements?status=hepsi', { cache: 'no-store' }),
        fetch('/api/auth/me', { cache: 'no-store' }),
        fetch('/api/saved', { cache: 'no-store' }),
      ]);

      const annData = annRes.ok
        ? ((await annRes.json()) as Parameters<typeof applyFeedResults>[0])
        : null;
      if (!annRes.ok && initialAnnouncements.length === 0) {
        setFeedError('İlan listesi yüklenirken bir sorun oluştu.');
      }
      const meData = meRes.ok
        ? ((await meRes.json()) as Parameters<typeof applyFeedResults>[1])
        : null;
      const savedData = savedRes.ok
        ? ((await savedRes.json()) as Parameters<typeof applyFeedResults>[2])
        : null;

      applyFeedResults(annData, meData, savedData);
    } catch {
      if (initialAnnouncements.length === 0) {
        setFeedError('Sunucuya erişilemedi. Lütfen tekrar deneyiniz.');
      }
    } finally {
      setLoadingFeed(false);
    }
  }, [announcements.length, applyFeedResults, initialAnnouncements.length]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/announcements?status=hepsi', { cache: 'no-store' }),
      fetch('/api/auth/me', { cache: 'no-store' }),
      fetch('/api/saved', { cache: 'no-store' }),
    ])
      .then(async ([annRes, meRes, savedRes]) => {
        if (!active) return;
        const annData = annRes.ok
          ? ((await annRes.json()) as Parameters<typeof applyFeedResults>[0])
          : null;
        if (!annRes.ok && initialAnnouncements.length === 0) {
          setFeedError('İlan listesi yüklenirken bir sorun oluştu.');
        }
        const meData = meRes.ok
          ? ((await meRes.json()) as Parameters<typeof applyFeedResults>[1])
          : null;
        const savedData = savedRes.ok
          ? ((await savedRes.json()) as Parameters<typeof applyFeedResults>[2])
          : null;
        applyFeedResults(annData, meData, savedData);
      })
      .catch(() => {
        if (active && initialAnnouncements.length === 0) {
          setFeedError('Sunucuya erişilemedi. Lütfen tekrar deneyiniz.');
        }
      })
      .finally(() => {
        if (active) setLoadingFeed(false);
      });
    return () => {
      active = false;
    };
  }, [applyFeedResults, initialAnnouncements.length]);

  const applyMatchedPayload = useCallback(
    (data: {
      locked?: boolean;
      totalMatches?: number;
      items?: Array<MatchItemPayload | (Announcement & { evaluation?: MatchItemPayload['evaluation'] })>;
    }) => {
      setMatchedLocked(Boolean(data.locked));
      setMatchedTotalCount(data.totalMatches ?? (data.items?.length || 0));
      const normalized: MatchItemPayload[] = (data.items || []).map((entry) => {
        if ('announcement' in entry && entry.announcement) {
          return entry as MatchItemPayload;
        }
        const ann = entry as Announcement & { evaluation?: MatchItemPayload['evaluation'] };
        return {
          announcement: ann,
          evaluation: ann.evaluation ?? {
            announcementId: ann.id,
            eligible: true,
            matchScore: 100,
            matchedReasons: [],
            missingReasons: [],
            unknownReasons: [],
          },
        };
      });
      setMatchedItems(normalized);
    },
    []
  );

  const fetchMatched = useCallback(async () => {
    setMatchedLoading(true);
    setMatchedError(null);
    setMatchedAuthRequired(false);
    try {
      const res = await fetch('/api/announcements/matched', { cache: 'no-store' });
      if (res.status === 401) {
        setMatchedAuthRequired(true);
        setMatchedItems([]);
        return;
      }
      if (!res.ok) {
        setMatchedError('Profil eşleştirme sonuçları yüklenemedi.');
        return;
      }
      const data = (await res.json()) as Parameters<typeof applyMatchedPayload>[0];
      applyMatchedPayload(data);
    } catch {
      setMatchedError('Bağlantı hatası nedeniyle eşleştirmeler alınamadı.');
    } finally {
      setMatchedLoading(false);
    }
  }, [applyMatchedPayload]);

  const handleOpenMatchedTab = useCallback(() => {
    setActiveTab('matched');
    fetchMatched();
  }, [fetchMatched]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerItem) {
        setDrawerItem(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [drawerItem]);

  const facets = useMemo(() => getAnnouncementFacets(announcements), [announcements]);

  const filteredList = useMemo(() => {
    if (activeTab === 'matched') return [];
    return filterAnnouncements(announcements, {
      status: activeTab,
      category,
      source,
      city: city === 'hepsi' ? undefined : city,
      q: query,
    });
  }, [announcements, activeTab, category, source, city, query]);

  const filteredMatched = useMemo(() => {
    if (activeTab !== 'matched') return [];
    const allowedIds = new Set(
      filterAnnouncements(
        matchedItems.map((m) => m.announcement),
        {
          category,
          source,
          city: city === 'hepsi' ? undefined : city,
          q: query,
        }
      ).map((a) => a.id)
    );
    return matchedItems.filter((m) => allowedIds.has(m.announcement.id));
  }, [activeTab, matchedItems, category, source, city, query]);

  const handleToggleSave = async (announcementId: string) => {
    setSaveFeedback(null);
    setSavingId(announcementId);
    const isCurrentlySaved = savedIds.has(announcementId);

    try {
      const res = await fetch(
        isCurrentlySaved
          ? `/api/saved?announcementId=${encodeURIComponent(announcementId)}`
          : '/api/saved',
        {
          method: isCurrentlySaved ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isCurrentlySaved ? undefined : JSON.stringify({ announcementId }),
        }
      );

      if (res.status === 401) {
        setSaveFeedback({
          type: 'auth',
          message: 'İlan kaydetmek için giriş yapmanız veya ücretsiz hesap oluşturmanız gerekir.',
        });
        return;
      }

      if (res.status === 403) {
        const errData = (await res.json()) as { error?: string; code?: string };
        setSaveFeedback({
          type: 'limit',
          message:
            errData.error ||
            'Ücretsiz planda en fazla 10 ilan kaydedebilirsiniz. Sınırsız kayıt için Premium plana geçebilirsiniz.',
        });
        return;
      }

      if (!res.ok) {
        setSaveFeedback({
          type: 'error',
          message: 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyiniz.',
        });
        return;
      }

      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlySaved) {
          next.delete(announcementId);
        } else {
          next.add(announcementId);
        }
        return next;
      });
      setSaveFeedback({
        type: 'success',
        message: isCurrentlySaved
          ? 'İlan kayıtlı listenizden çıkarıldı.'
          : 'İlan kayıtlı listenize eklendi.',
      });
    } catch {
      setSaveFeedback({
        type: 'error',
        message: 'Ağ hatası nedeniyle kaydetme işlemi tamamlanamadı.',
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleResetFilters = () => {
    setQuery('');
    setCategory('hepsi');
    setSource('hepsi');
    setCity('hepsi');
  };

  const scrollToFeed = () => {
    const el = document.getElementById('ilan-akisi');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    searchInputRef.current?.focus();
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Compact SaaS Value Strip */}
      {!user ? (
        <section
          aria-label="Platform Özeti"
          className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div className="space-y-1 max-w-3xl">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Kamu Bildirim Sepeti: Resmî İlan Akışı ve Uygunluk Takibi
            </h1>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              Kariyer Kapısı, İŞKUR ve Resmî Gazete atama, personel alımı ve görevlendirme ilanlarını profilinize göre süzün, son başvuru tarihlerini kaçırmayın.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/kayit"
              className="min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center transition-colors"
            >
              Ücretsiz Hesap Oluştur
            </Link>
            <button
              type="button"
              onClick={scrollToFeed}
              className="min-h-[44px] px-4 py-2.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center cursor-pointer"
            >
              Hemen İlanlara Bak
            </button>
          </div>
        </section>
      ) : (
        <section
          aria-label="Hesap Özeti"
          className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Kamu İlan Akışı
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Oturum: <strong className="text-slate-900 dark:text-slate-200">{user.fullName || user.email}</strong> ({user.plan === 'premium' ? 'Premium Plan' : 'Ücretsiz Plan'})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/profil"
              className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center"
            >
              Aday Profilini Düzenle
            </Link>
            <Link
              href="/kayitli"
              className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center tabular-nums"
            >
              Kayıtlı İlanlar ({savedIds.size})
            </Link>
          </div>
        </section>
      )}

      {/* Main Workspace */}
      <section id="ilan-akisi" className="space-y-4">
        {/* Tabs + Source Summary */}
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-3 sm:p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div role="tablist" aria-label="İlan Durumu Sekmeleri" className="flex flex-wrap gap-2">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'acik'}
                onClick={() => setActiveTab('acik')}
                className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold border transition-colors cursor-pointer tabular-nums ${
                  activeTab === 'acik'
                    ? 'bg-[#b91c1c] dark:bg-[#dc2626] text-white border-[#b91c1c] dark:border-[#ef4444]'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Açık İlanlar ({facets.statuses.acik})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'kapali'}
                onClick={() => setActiveTab('kapali')}
                className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold border transition-colors cursor-pointer tabular-nums ${
                  activeTab === 'kapali'
                    ? 'bg-[#b91c1c] dark:bg-[#dc2626] text-white border-[#b91c1c] dark:border-[#ef4444]'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Kapalı İlanlar ({facets.statuses.kapali})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'matched'}
                onClick={handleOpenMatchedTab}
                className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold border transition-colors cursor-pointer ${
                  activeTab === 'matched'
                    ? 'bg-[#b91c1c] dark:bg-[#dc2626] text-white border-[#b91c1c] dark:border-[#ef4444]'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Bana Uygun
              </button>
            </div>

            <Link
              href="/kpss-arsivi"
              className="min-h-[44px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center"
            >
              ÖSYM KPSS Arşivi (2024-2026) →
            </Link>
          </div>

          {/* Search & Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-5">
              <label
                htmlFor="feed-search"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                İlan, Kurum, Şehir veya Nitelik Kodu Ara
              </label>
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="feed-search"
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Örn. Sağlık Bakanlığı, Mühendis, Ankara, 4531..."
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="feed-category"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Kategori
              </label>
              <select
                id="feed-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AnnouncementCategory | 'hepsi')}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="hepsi">Tümü</option>
                <option value="atama">Atama</option>
                <option value="personel_alimi">Personel Alımı</option>
                <option value="gorevlendirme">Görevlendirme</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="feed-source"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Resmî Kaynak
              </label>
              <select
                id="feed-source"
                value={source}
                onChange={(e) => setSource(e.target.value as AnnouncementSource | 'hepsi')}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="hepsi">Tümü</option>
                <option value="kariyer_kapisi">Kariyer Kapısı</option>
                <option value="iskur">İŞKUR</option>
                <option value="resmi_gazete">Resmî Gazete</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="feed-city"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Şehir
              </label>
              <select
                id="feed-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="hepsi">Tüm Şehirler</option>
                {facets.cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-1">
              <button
                type="button"
                onClick={handleResetFilters}
                title="Filtreleri Temizle"
                className="w-full min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Sıfırla
              </button>
            </div>
          </div>
        </div>

        {/* Save Action Feedback Banner */}
        {saveFeedback && (
          <div
            role="status"
            className={`p-3 border text-xs flex flex-wrap items-center justify-between gap-3 ${
              saveFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {saveFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{saveFeedback.message}</span>
            </div>
            <div className="flex items-center gap-2">
              {saveFeedback.type === 'auth' && (
                <>
                  <Link href="/giris" className="font-bold underline">
                    Giriş Yap
                  </Link>
                  <Link href="/kayit" className="font-bold underline">
                    Ücretsiz Kayıt
                  </Link>
                </>
              )}
              {saveFeedback.type === 'limit' && (
                <Link href="/premium" className="font-bold underline">
                  Premium Plana Geç
                </Link>
              )}
              <button
                type="button"
                onClick={() => setSaveFeedback(null)}
                aria-label="Bildirimi kapat"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Free Plan Cap Notice */}
        {activeTab !== 'matched' && limitApplied !== null && totalAvailable > announcements.length && (
          <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
            <span className="tabular-nums">
              Ücretsiz planda güncel ilk {limitApplied} ilan gösterilmektedir (toplam {totalAvailable} ilan).
            </span>
            <Link
              href="/premium"
              className="font-bold text-[#b91c1c] dark:text-[#ef4444] hover:underline"
            >
              Sınırsız İlan İçin Premium Planı İncele →
            </Link>
          </div>
        )}

        {/* Loading State */}
        {loadingFeed && activeTab !== 'matched' && (
          <div
            role="status"
            className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center text-sm text-slate-600 dark:text-slate-400"
          >
            İlanlar yükleniyor...
          </div>
        )}

        {/* Error State */}
        {feedError && activeTab !== 'matched' && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 p-5 flex flex-wrap items-center justify-between gap-3 text-sm text-red-900 dark:text-red-200"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{feedError}</span>
            </div>
            <button
              type="button"
              onClick={fetchFeedAndUser}
              className="min-h-[44px] px-3 py-2 border border-red-400 dark:border-red-700 bg-white dark:bg-slate-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Yeniden Dene</span>
            </button>
          </div>
        )}

        {/* Matched Tab Content */}
        {activeTab === 'matched' && (
          <div className="space-y-3">
            {matchedLoading ? (
              <div
                role="status"
                className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center text-sm text-slate-600 dark:text-slate-400"
              >
                Profilinize uygun ilanlar hesaplanıyor...
              </div>
            ) : matchedAuthRequired ? (
              <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8 text-center space-y-3">
                <Lock className="w-7 h-7 text-[#b91c1c] dark:text-[#ef4444] mx-auto" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Profil Eşleştirme İçin Oturum Açın
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                  Eğitim düzeyinize, bölümünüze, KPSS puanınıza ve sertifikalarınıza uygun ilanları görmek için hesap oluşturup profil bilgilerinizi doldurun.
                </p>
                <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                  <Link
                    href="/kayit"
                    className="min-h-[44px] px-4 py-2 bg-[#b91c1c] dark:bg-[#dc2626] text-white text-xs font-bold inline-flex items-center"
                  >
                    Ücretsiz Hesap Oluştur
                  </Link>
                  <Link
                    href="/giris"
                    className="min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center"
                  >
                    Giriş Yap
                  </Link>
                </div>
              </div>
            ) : matchedError ? (
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 p-5 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-900 dark:text-red-200"
              >
                <span>{matchedError}</span>
                <button
                  type="button"
                  onClick={fetchMatched}
                  className="min-h-[44px] px-3 py-2 border border-red-400 bg-white dark:bg-slate-900 text-xs font-bold cursor-pointer"
                >
                  Tekrar Dene
                </button>
              </div>
            ) : matchedLocked ? (
              <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8 space-y-4">
                <div className="flex items-start gap-3">
                  <Lock className="w-6 h-6 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      Profilinizle Eşleşen {matchedTotalCount} Açık İlan Bulundu
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                      &quot;Bana Uygun&quot; tam eşleşme listesi ve gerekçe dökümü Premium plan kapsamında sunulmaktadır. Ücretsiz planda tüm açık ilanları arayabilir ve 10 ilana kadar kaydedebilirsiniz.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <Link
                    href="/premium"
                    className="min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center"
                  >
                    Premium Plana Geç
                  </Link>
                  <Link
                    href="/profil"
                    className="min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center"
                  >
                    Profil Bilgilerini Güncelle
                  </Link>
                </div>
              </div>
            ) : filteredMatched.length === 0 ? (
              <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Mevcut profil ve filtre ayarlarınıza uyan açık ilan bulunamadı.
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <Link
                    href="/profil"
                    className="min-h-[44px] px-4 py-2 bg-[#b91c1c] dark:bg-[#dc2626] text-white text-xs font-bold inline-flex items-center"
                  >
                    Aday Profilini Düzenle
                  </Link>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Filtreleri Temizle
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMatched.map(({ announcement, evaluation }) => (
                  <AnnouncementCard
                    key={announcement.id}
                    item={announcement}
                    matchScore={evaluation.matchScore}
                    matchedReasons={evaluation.matchedReasons}
                    missingReasons={evaluation.missingReasons}
                    isSaved={savedIds.has(announcement.id)}
                    isSaving={savingId === announcement.id}
                    onToggleSave={handleToggleSave}
                    onOpenCriteria={setDrawerItem}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Open / Closed List */}
        {activeTab !== 'matched' && !loadingFeed && !feedError && (
          <>
            {filteredList.length === 0 ? (
              <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Arama ve filtre kriterlerinize uygun ilan bulunamadı.
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Kategori, kaynak veya şehir filtrelerini temizleyerek tüm ilanları görüntüleyebilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Filtreleri Temizle
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredList.map((item) => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    isSaved={savedIds.has(item.id)}
                    isSaving={savingId === item.id}
                    onToggleSave={handleToggleSave}
                    onOpenCriteria={setDrawerItem}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Slide-over Criteria Summary Drawer */}
      {drawerItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="criteria-drawer-title"
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerItem(null);
          }}
        >
          <div className="w-full max-w-xl bg-white dark:bg-[#111827] h-full overflow-y-auto border-l border-slate-300 dark:border-slate-800 p-5 sm:p-6 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-xs font-bold text-[#b91c1c] dark:text-[#ef4444] uppercase">
                    {drawerItem.sourceName} · {CATEGORY_LABELS[drawerItem.category]}
                  </span>
                  <h2
                    id="criteria-drawer-title"
                    className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1"
                  >
                    {drawerItem.title}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {drawerItem.institution}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerItem(null)}
                  aria-label="Şart özetini kapat"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Şehir</span>
                  <strong className="text-slate-900 dark:text-slate-100">{drawerItem.city}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Son Başvuru</span>
                  <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                    {drawerItem.deadlineAt}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Kontenjan</span>
                  <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                    {drawerItem.quota !== null ? `${drawerItem.quota} Kişi` : 'Belirtilmemiş'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Öğrenim Düzeyi</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {drawerItem.criteria.educationLevels.length > 0
                      ? drawerItem.criteria.educationLevels
                          .map((lvl) => EDUCATION_LABELS[lvl])
                          .join(', ')
                      : 'Genel'}
                  </strong>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Başvuru Şartları Özeti
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  {drawerItem.criteria.summaryLines.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>

              {drawerItem.criteria.qualificationCodes.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                    İlgili Nitelik Kodları
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {drawerItem.criteria.qualificationCodes.map((code) => (
                      <span
                        key={code}
                        className="px-2 py-1 text-xs font-mono font-bold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-950 dark:text-amber-100">
                Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2.5">
              <Link
                href={`/ilan/${drawerItem.id}`}
                className="flex-1 min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center justify-center"
              >
                İlan Detayını Aç
              </Link>
              <a
                href={drawerItem.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span>Resmî Kaynağa Git</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AnnouncementCardProps {
  item: Announcement;
  isSaved: boolean;
  isSaving: boolean;
  onToggleSave: (id: string) => void;
  onOpenCriteria: (item: Announcement) => void;
  matchScore?: number;
  matchedReasons?: string[];
  missingReasons?: string[];
}

function AnnouncementCard({
  item,
  isSaved,
  isSaving,
  onToggleSave,
  onOpenCriteria,
  matchScore,
  matchedReasons,
  missingReasons,
}: AnnouncementCardProps) {
  const daysLeft = getDeadlineDaysLeft(item.deadlineAt);
  const countdownText =
    item.status === 'kapali' || daysLeft < 0
      ? 'Başvuru Kapalı'
      : daysLeft === 0
        ? 'Son Gün'
        : `${daysLeft} gün kaldı`;

  return (
    <article className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 sm:p-5 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {SOURCE_LABELS[item.source]}
            </span>
            <span className="px-2 py-0.5 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300">
              {CATEGORY_LABELS[item.category]}
            </span>
            <span
              className={`px-2 py-0.5 border tabular-nums ${
                item.status === 'acik'
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.status === 'acik' ? 'Açık' : 'Kapalı'}
            </span>
            {typeof matchScore === 'number' && (
              <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 tabular-nums">
                Uyum: %{matchScore}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            <span>{item.institution}</span>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
            <Link
              href={`/ilan/${item.id}`}
              className="hover:text-[#b91c1c] dark:hover:text-[#ef4444] transition-colors"
            >
              {item.title}
            </Link>
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
            {item.summary}
          </p>
        </div>

        {/* Right Metadata & Quick Actions */}
        <div className="flex flex-wrap lg:flex-col lg:items-end justify-between gap-2 shrink-0 text-xs">
          <div className="flex flex-wrap lg:justify-end gap-3 text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>{item.city}</span>
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>{item.quota !== null ? `${item.quota} Kontenjan` : 'Kontenjan Yok'}</span>
            </span>
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
              <Clock className="w-3.5 h-3.5 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
              <span>
                {item.deadlineAt} ({countdownText})
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenCriteria(item)}
              className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Şart Özeti</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleSave(item.id)}
              disabled={isSaving}
              aria-pressed={isSaved}
              className={`min-h-[44px] px-3 py-2 border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                isSaved
                  ? 'border-[#b91c1c] dark:border-[#ef4444] bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kaydedildi</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kaydet</span>
                </>
              )}
            </button>

            <Link
              href={`/ilan/${item.id}`}
              className="min-h-[44px] px-3 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center"
            >
              Detay
            </Link>
          </div>
        </div>
      </div>

      {/* Match Reasons if present */}
      {(matchedReasons?.length || missingReasons?.length) ? (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 text-[11px]">
          {matchedReasons?.slice(0, 3).map((reason, i) => (
            <span
              key={`ok-${i}`}
              className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
            >
              Uygun: {reason}
            </span>
          ))}
          {missingReasons?.slice(0, 2).map((reason, i) => (
            <span
              key={`miss-${i}`}
              className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
            >
              Eksik: {reason}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default AnnouncementFeed;
