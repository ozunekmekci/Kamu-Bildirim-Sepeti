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
  BellPlus,
  Layers,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementPosition,
  AnnouncementSource,
  EmploymentType,
  ExamType,
  NoticeType,
  SourceCheckpoint,
} from '@/modules/announcements/types';
import {
  filterAnnouncements,
  getAnnouncementFacets,
  getDeadlineDaysLeft,
} from '@/modules/announcements/service';
import type { MatchEvaluation, SavedSearchFilters } from '@/modules/db/types';

interface AuthUserSummary {
  id: string;
  email: string;
  fullName?: string | null;
  plan?: 'free' | 'premium';
}

interface MatchItemPayload {
  announcement: Announcement;
  evaluation: MatchEvaluation;
}

interface FeedFreshness {
  lastCheckedAt: string | null;
  checkpoints: SourceCheckpoint[];
}

export interface AnnouncementFeedProps {
  initialAnnouncements?: Announcement[];
  initialUser?: AuthUserSummary | null;
}

type TaxonomyTabKey =
  | 'hepsi'
  | 'memur_ab'
  | 'sozlesmeli_4b'
  | 'akademik'
  | 'isci'
  | 'askeri_guvenlik';

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  atama: 'Atama',
  personel_alimi: 'Personel Alımı',
  gorevlendirme: 'Görevlendirme',
};

const SOURCE_LABELS: Record<AnnouncementSource, string> = {
  kariyer_kapisi: 'Kariyer Kapısı',
  sbb: 'SBB Kamu İlan',
  iskur: 'İŞKUR',
  resmi_gazete: 'Resmî Gazete',
  osym_kpss: 'ÖSYM KPSS',
};

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

const NOTICE_TYPE_LABELS: Record<NoticeType, string> = {
  ilan: 'İlan',
  duzeltme: 'Düzeltme İlanı',
  iptal: 'İptal İlanı',
  sonuc: 'Sonuç Duyurusu',
};

const EDUCATION_LABELS: Record<'lisans' | 'onlisans' | 'ortaogretim', string> = {
  lisans: 'Lisans',
  onlisans: 'Ön Lisans',
  ortaogretim: 'Ortaöğretim',
};

const TAXONOMY_TABS: ReadonlyArray<{ key: TaxonomyTabKey; label: string }> = [
  { key: 'hepsi', label: 'Tümü' },
  { key: 'memur_ab', label: 'Memur (A/B)' },
  { key: 'sozlesmeli_4b', label: 'Sözleşmeli (4/B)' },
  { key: 'akademik', label: 'Akademik' },
  { key: 'isci', label: 'Kamu İşçi' },
  { key: 'askeri_guvenlik', label: 'Askerî & Kolluk' },
];

function matchesTaxonomyAndExam(
  item: Announcement,
  taxonomyTab: TaxonomyTabKey,
  interviewFreeOnly: boolean
): boolean {
  if (interviewFreeOnly && item.examType !== 'kpss_only') {
    return false;
  }
  if (taxonomyTab === 'hepsi') return true;
  if (taxonomyTab === 'memur_ab') {
    return item.employmentType === 'memur_a' || item.employmentType === 'memur_b';
  }
  return item.employmentType === taxonomyTab;
}

function formatSyncTimestamp(iso: string | null): string {
  if (!iso) return 'Henüz güncellenmedi';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const diffMin = Math.round((Date.now() - parsed.getTime()) / 60_000);
  const clock = parsed.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (diffMin >= 0 && diffMin < 1) {
    return `Az önce (${clock})`;
  }
  if (diffMin >= 1 && diffMin < 60) {
    return `${diffMin} dk önce (${clock})`;
  }
  return parsed.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSourceLabel(sourceKey: string, fallback?: string): string {
  if (sourceKey in SOURCE_LABELS) {
    return SOURCE_LABELS[sourceKey as AnnouncementSource];
  }
  return fallback || sourceKey;
}

export function AnnouncementFeed({
  initialAnnouncements = [],
  initialUser = null,
}: AnnouncementFeedProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [loadingFeed, setLoadingFeed] = useState<boolean>(initialAnnouncements.length === 0);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [limitApplied, setLimitApplied] = useState<number | null>(null);
  const [totalAvailable, setTotalAvailable] = useState<number>(initialAnnouncements.length);
  const [freshness, setFreshness] = useState<FeedFreshness | null>(null);

  const [user, setUser] = useState<AuthUserSummary | null>(initialUser);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingSearch, setSavingSearch] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'error' | 'auth' | 'limit' | 'success';
    message: string;
    actionHref?: string;
    actionLabel?: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'acik' | 'kapali' | 'matched'>('acik');
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<AnnouncementCategory | 'hepsi'>('hepsi');
  const [source, setSource] = useState<AnnouncementSource | 'hepsi'>('hepsi');
  const [city, setCity] = useState<string>('hepsi');
  const [taxonomyTab, setTaxonomyTab] = useState<TaxonomyTabKey>('hepsi');
  const [interviewFreeOnly, setInterviewFreeOnly] = useState<boolean>(false);

  // Matched tab state
  const [matchedLoading, setMatchedLoading] = useState<boolean>(false);
  const [matchedError, setMatchedError] = useState<string | null>(null);
  const [matchedAuthRequired, setMatchedAuthRequired] = useState<boolean>(false);
  const [matchedLocked, setMatchedLocked] = useState<boolean>(false);
  const [matchedTotalCount, setMatchedTotalCount] = useState<number>(0);
  const [matchedItems, setMatchedItems] = useState<MatchItemPayload[]>([]);

  // Criteria Drawer state
  const [drawerItem, setDrawerItem] = useState<Announcement | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<{
    id: string;
    announcement: Announcement;
    positions: AnnouncementPosition[];
  } | null>(null);
  const [drawerLoadedId, setDrawerLoadedId] = useState<string | null>(null);
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
        freshness?: FeedFreshness | null;
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
        if (annData.freshness) {
          setFreshness({
            lastCheckedAt: annData.freshness.lastCheckedAt ?? null,
            checkpoints: Array.isArray(annData.freshness.checkpoints)
              ? annData.freshness.checkpoints
              : [],
          });
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
      const [annRes, meRes] = await Promise.all([
        fetch('/api/announcements?status=hepsi', { cache: 'no-store' }),
        fetch('/api/auth/me', { cache: 'no-store' }),
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
      let savedData: Parameters<typeof applyFeedResults>[2] = null;
      if (meData?.user) {
        const savedRes = await fetch('/api/saved', { cache: 'no-store' });
        savedData = savedRes.ok
          ? ((await savedRes.json()) as Parameters<typeof applyFeedResults>[2])
          : null;
      }

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
    ])
      .then(async ([annRes, meRes]) => {
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
        let savedData: Parameters<typeof applyFeedResults>[2] = null;
        if (meData?.user) {
          const savedRes = await fetch('/api/saved', { cache: 'no-store' });
          if (!active) return;
          savedData = savedRes.ok
            ? ((await savedRes.json()) as Parameters<typeof applyFeedResults>[2])
            : null;
        }
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

  useEffect(() => {
    if (!drawerItem) {
      return;
    }

    let active = true;
    const targetId = drawerItem.id;

    fetch(`/api/announcements/${encodeURIComponent(targetId)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const data = (await res.json()) as {
          announcement?: Announcement;
          positions?: AnnouncementPosition[];
        };
        if (!active) return;
        if (data.announcement || Array.isArray(data.positions)) {
          const nextAnnouncement = data.announcement ?? drawerItem;
          const nextPositions = Array.isArray(data.positions)
            ? data.positions
            : nextAnnouncement.positions ?? drawerItem.positions ?? [];
          setDrawerDetail({
            id: targetId,
            announcement: nextAnnouncement,
            positions: nextPositions,
          });
        }
      })
      .catch(() => {
        // Keep already-rendered drawer summary silently when offline or mocked
      })
      .finally(() => {
        if (active) setDrawerLoadedId(targetId);
      });

    return () => {
      active = false;
    };
  }, [drawerItem]);

  const applyMatchedPayload = useCallback(
    (data: {
      locked?: boolean;
      totalMatches?: number;
      items?: Array<MatchItemPayload | (Announcement & { evaluation?: MatchEvaluation })>;
    }) => {
      setMatchedLocked(Boolean(data.locked));
      setMatchedTotalCount(data.totalMatches ?? (data.items?.length || 0));
      const normalized: MatchItemPayload[] = (data.items || []).map((entry) => {
        if ('announcement' in entry && entry.announcement) {
          return entry as MatchItemPayload;
        }
        const ann = entry as Announcement & { evaluation?: MatchEvaluation };
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

  const statusScopedAnnouncements = useMemo(() => {
    if (activeTab === 'matched') {
      return matchedItems.map((m) => m.announcement);
    }
    return announcements.filter((item) => item.status === activeTab);
  }, [announcements, activeTab, matchedItems]);

  const taxonomyCounts = useMemo(() => {
    const counts: Record<TaxonomyTabKey, number> & { kpssOnly: number } = {
      hepsi: statusScopedAnnouncements.length,
      memur_ab: 0,
      sozlesmeli_4b: 0,
      akademik: 0,
      isci: 0,
      askeri_guvenlik: 0,
      kpssOnly: 0,
    };

    for (const item of statusScopedAnnouncements) {
      if (item.employmentType === 'memur_a' || item.employmentType === 'memur_b') {
        counts.memur_ab += 1;
      } else if (item.employmentType === 'sozlesmeli_4b') {
        counts.sozlesmeli_4b += 1;
      } else if (item.employmentType === 'akademik') {
        counts.akademik += 1;
      } else if (item.employmentType === 'isci') {
        counts.isci += 1;
      } else if (item.employmentType === 'askeri_guvenlik') {
        counts.askeri_guvenlik += 1;
      }
      if (item.examType === 'kpss_only') {
        counts.kpssOnly += 1;
      }
    }

    return counts;
  }, [statusScopedAnnouncements]);

  const filteredList = useMemo(() => {
    if (activeTab === 'matched') return [];
    const base = filterAnnouncements(announcements, {
      status: activeTab,
      category,
      source,
      city: city === 'hepsi' ? undefined : city,
      examType: interviewFreeOnly ? 'kpss_only' : undefined,
      q: query,
    });
    return base.filter((item) =>
      matchesTaxonomyAndExam(item, taxonomyTab, interviewFreeOnly)
    );
  }, [
    announcements,
    activeTab,
    category,
    source,
    city,
    query,
    taxonomyTab,
    interviewFreeOnly,
  ]);

  const filteredMatched = useMemo(() => {
    if (activeTab !== 'matched') return [];
    const base = filterAnnouncements(
      matchedItems.map((m) => m.announcement),
      {
        category,
        source,
        city: city === 'hepsi' ? undefined : city,
        examType: interviewFreeOnly ? 'kpss_only' : undefined,
        q: query,
      }
    ).filter((item) => matchesTaxonomyAndExam(item, taxonomyTab, interviewFreeOnly));
    const allowedIds = new Set(base.map((a) => a.id));
    return matchedItems.filter((m) => allowedIds.has(m.announcement.id));
  }, [
    activeTab,
    matchedItems,
    category,
    source,
    city,
    query,
    taxonomyTab,
    interviewFreeOnly,
  ]);

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

  const handleSaveCurrentSearch = async () => {
    setSaveFeedback(null);
    setSavingSearch(true);

    const nameParts: string[] = [];
    if (query.trim()) nameParts.push(query.trim());
    if (city !== 'hepsi') nameParts.push(city);
    if (taxonomyTab !== 'hepsi') {
      const tabLabel = TAXONOMY_TABS.find((t) => t.key === taxonomyTab)?.label;
      if (tabLabel) nameParts.push(tabLabel);
    }
    if (interviewFreeOnly) nameParts.push('Mülakatsız KPSS');
    if (source !== 'hepsi') nameParts.push(SOURCE_LABELS[source]);
    if (category !== 'hepsi') nameParts.push(CATEGORY_LABELS[category]);
    const searchName = (nameParts.length > 0 ? nameParts.join(' / ') : 'Tüm Açık İlanlar').slice(
      0,
      120
    );

    const filters: SavedSearchFilters = {};
    if (query.trim()) filters.q = query.trim();
    if (city !== 'hepsi') filters.city = city;
    if (category !== 'hepsi') filters.category = category;
    if (source !== 'hepsi') filters.source = source;
    if (activeTab !== 'matched') filters.status = activeTab;
    if (taxonomyTab !== 'hepsi') filters.employmentType = taxonomyTab;
    if (interviewFreeOnly) filters.examType = 'kpss_only';

    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: searchName,
          filters,
          notifyPush: true,
          notifyEmail: true,
        }),
      });

      if (res.status === 401) {
        setSaveFeedback({
          type: 'auth',
          message: 'Arama alarmı kaydetmek için giriş yapmanız veya ücretsiz hesap oluşturmanız gerekir.',
        });
        return;
      }

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveFeedback({
          type: 'error',
          message: errData.error || 'Arama alarmı kaydedilemedi. Lütfen tekrar deneyiniz.',
        });
        return;
      }

      setSaveFeedback({
        type: 'success',
        message: `"${searchName}" için arama alarmı oluşturuldu.`,
        actionHref: '/ayarlar',
        actionLabel: 'Alarmları Yönet',
      });
    } catch {
      setSaveFeedback({
        type: 'error',
        message: 'Ağ hatası nedeniyle arama alarmı kaydedilemedi.',
      });
    } finally {
      setSavingSearch(false);
    }
  };

  const handleResetFilters = () => {
    setQuery('');
    setCategory('hepsi');
    setSource('hepsi');
    setCity('hepsi');
    setTaxonomyTab('hepsi');
    setInterviewFreeOnly(false);
  };

  const scrollToFeed = () => {
    const el = document.getElementById('ilan-akisi');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    searchInputRef.current?.focus();
  };

  const effectiveDrawerAnnouncement =
    drawerItem && drawerDetail && drawerDetail.id === drawerItem.id
      ? drawerDetail.announcement
      : drawerItem;
  const effectiveDrawerPositions =
    drawerItem && drawerDetail && drawerDetail.id === drawerItem.id
      ? drawerDetail.positions
      : (drawerItem?.positions ?? []);
  const drawerLoading = Boolean(drawerItem && drawerLoadedId !== drawerItem.id);
  const drawerHasApplyUrl = Boolean(
    effectiveDrawerAnnouncement?.applyUrl &&
      effectiveDrawerAnnouncement.applyUrl.trim().length > 0
  );
  const showFreshnessStrip = Boolean(
    freshness && (freshness.lastCheckedAt || freshness.checkpoints.length > 0)
  );

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
              Kariyer Kapısı, SBB Kamu İlan, İŞKUR ve Resmî Gazete atama, personel alımı ve görevlendirme ilanlarını profilinize göre süzün, son başvuru tarihlerini kaçırmayın.
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

      {/* Live Freshness Strip */}
      {showFreshnessStrip && freshness && (
        <section
          aria-label="Canlı Kaynak Durumu"
          className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex flex-wrap items-center gap-3 text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span>Son kontrol: {formatSyncTimestamp(freshness.lastCheckedAt)}</span>
            </span>
            <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 tabular-nums">
              5 dk otomatik senkronizasyon
            </span>
          </div>
          {freshness.checkpoints.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {freshness.checkpoints.map((cp) => (
                <span
                  key={cp.source}
                  className={`px-2 py-0.5 border font-semibold tabular-nums ${
                    cp.lastError
                      ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {getSourceLabel(cp.source)}: {cp.activeCount}
                </span>
              ))}
            </div>
          )}
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

          {/* Internal Taxonomy Bar & Mülakatsız KPSS Quick Filter */}
          <div
            aria-label="Kadro Türü ve Sınav Filtresi"
            className="flex flex-wrap items-center justify-between gap-2 pb-1"
          >
            <div className="flex flex-wrap items-center gap-2">
              {TAXONOMY_TABS.map((tab) => {
                const selected = taxonomyTab === tab.key;
                const count = taxonomyCounts[tab.key];
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTaxonomyTab(tab.key)}
                    className={`min-h-[44px] px-3 py-2 text-xs font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 tabular-nums ${
                      selected
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                        : 'bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[11px] ${
                        selected
                          ? 'text-slate-200 dark:text-slate-700'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-pressed={interviewFreeOnly}
              onClick={() => setInterviewFreeOnly((prev) => !prev)}
              className={`min-h-[44px] px-3.5 py-2 text-xs font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 tabular-nums ${
                interviewFreeOnly
                  ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Mülakatsız (KPSS)</span>
              <span>({taxonomyCounts.kpssOnly})</span>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-4">
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
                <option value="sbb">SBB Kamu İlan</option>
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

            <div className="lg:col-span-2 flex flex-wrap sm:flex-nowrap gap-2">
              <button
                type="button"
                onClick={handleResetFilters}
                title="Filtreleri Temizle"
                className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
              >
                Sıfırla
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentSearch}
                disabled={savingSearch}
                className="flex-1 min-h-[44px] px-3 py-2 border border-[#b91c1c] dark:border-[#ef4444] bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold text-[#b91c1c] dark:text-red-300 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <BellPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{savingSearch ? 'Kaydediliyor...' : 'Bu Aramayı Alarm Yap'}</span>
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
              {saveFeedback.actionHref && saveFeedback.actionLabel && (
                <Link href={saveFeedback.actionHref} className="font-bold underline">
                  {saveFeedback.actionLabel}
                </Link>
              )}
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
                    matchedPositionCount={evaluation.matchedPositionCount}
                    totalPositionCount={evaluation.totalPositionCount}
                    scoreMargin={evaluation.scoreMargin}
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
                  Kategori, kaynak, kadro türü veya şehir filtrelerini temizleyerek tüm ilanları görüntüleyebilirsiniz.
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
      {drawerItem && effectiveDrawerAnnouncement && (
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
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                    <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      {getSourceLabel(
                        effectiveDrawerAnnouncement.source,
                        effectiveDrawerAnnouncement.sourceName
                      )}
                    </span>
                    <span className="px-2 py-0.5 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300">
                      {CATEGORY_LABELS[effectiveDrawerAnnouncement.category]}
                    </span>
                    {effectiveDrawerAnnouncement.employmentType &&
                      effectiveDrawerAnnouncement.employmentType !== 'diger' && (
                        <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                          {EMPLOYMENT_TYPE_LABELS[effectiveDrawerAnnouncement.employmentType]}
                        </span>
                      )}
                  </div>
                  <h2
                    id="criteria-drawer-title"
                    className="text-lg font-bold text-slate-900 dark:text-slate-100"
                  >
                    {effectiveDrawerAnnouncement.title}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {effectiveDrawerAnnouncement.institution}
                    {effectiveDrawerAnnouncement.organizationUnit
                      ? ` / ${effectiveDrawerAnnouncement.organizationUnit}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerItem(null)}
                  aria-label="Şart özetini kapat"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {(effectiveDrawerAnnouncement.noticeType === 'iptal' ||
                effectiveDrawerAnnouncement.noticeType === 'duzeltme') && (
                <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-950 dark:text-amber-100 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Bu kayıt{' '}
                    <strong>
                      {NOTICE_TYPE_LABELS[effectiveDrawerAnnouncement.noticeType]}
                    </strong>{' '}
                    niteliğindedir. Güncel uygulama için resmî ilan metnini kontrol ediniz.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Şehir</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {effectiveDrawerAnnouncement.city}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Son Başvuru</span>
                  <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                    {effectiveDrawerAnnouncement.deadlineAt}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Kontenjan</span>
                  <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                    {effectiveDrawerAnnouncement.quota !== null
                      ? `${effectiveDrawerAnnouncement.quota} Kişi`
                      : 'Belirtilmemiş'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Öğrenim Düzeyi</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {effectiveDrawerAnnouncement.criteria.educationLevels.length > 0
                      ? effectiveDrawerAnnouncement.criteria.educationLevels
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
                  {effectiveDrawerAnnouncement.criteria.summaryLines.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>

              {/* Sub-positions loaded lazily or from SSR */}
              {(drawerLoading || effectiveDrawerPositions.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                      <span>
                        Alt Kadrolar{' '}
                        {effectiveDrawerPositions.length > 0
                          ? `(${effectiveDrawerPositions.length})`
                          : ''}
                      </span>
                    </h3>
                    {drawerLoading && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Kadro ayrıntıları güncelleniyor...
                      </span>
                    )}
                  </div>
                  {effectiveDrawerPositions.length > 0 && (
                    <div className="space-y-2">
                      {effectiveDrawerPositions.map((pos) => (
                        <div
                          key={pos.id}
                          className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 text-xs space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {pos.title}
                            </span>
                            {pos.isInterviewFree && (
                              <span className="px-2 py-0.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-[11px] font-bold">
                                Mülakatsız
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-slate-700 dark:text-slate-300 tabular-nums">
                            <span>
                              {pos.city}
                              {pos.district ? ` / ${pos.district}` : ''}
                            </span>
                            {pos.quota !== null && <span>{pos.quota} Kontenjan</span>}
                            {pos.educationLevel && (
                              <span>{EDUCATION_LABELS[pos.educationLevel]}</span>
                            )}
                            {(pos.kpssScoreType || pos.minKpssScore !== null) && (
                              <span>
                                {pos.kpssScoreType ?? 'KPSS'}
                                {pos.minKpssScore !== null ? ` (${pos.minKpssScore}+)` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {effectiveDrawerAnnouncement.criteria.qualificationCodes.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    İlgili Nitelik Kodları
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {effectiveDrawerAnnouncement.criteria.qualificationCodes.map((code) => (
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
                href={`/ilan/${effectiveDrawerAnnouncement.id}`}
                className="flex-1 min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center justify-center"
              >
                İlan Detayını Aç
              </Link>
              {drawerHasApplyUrl && (
                <a
                  href={effectiveDrawerAnnouncement.applyUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[44px] px-4 py-2 border border-[#b91c1c] dark:border-[#ef4444] text-[#b91c1c] dark:text-red-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <span>Resmî Başvuru / e-Devlet</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}
              <a
                href={effectiveDrawerAnnouncement.sourceUrl}
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
  matchedPositionCount?: number;
  totalPositionCount?: number;
  scoreMargin?: number | null;
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
  matchedPositionCount,
  totalPositionCount,
  scoreMargin,
}: AnnouncementCardProps) {
  const daysLeft = getDeadlineDaysLeft(item.deadlineAt);
  const isUrgent = item.status === 'acik' && daysLeft >= 0 && daysLeft <= 3;
  const countdownText =
    item.status === 'kapali' || daysLeft < 0
      ? 'Başvuru Kapalı'
      : daysLeft === 0
        ? 'Son Gün'
        : `${daysLeft} gün kaldı`;

  const verifiedSources = item.verifiedSources ?? [];
  const multiSourceLabel =
    verifiedSources.length > 1
      ? verifiedSources
          .map((ref) => getSourceLabel(ref.source, ref.sourceName))
          .join(' + ')
      : null;
  const positionsCount = item.positionsCount ?? item.positions?.length ?? 0;

  return (
    <article className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-4 sm:p-5 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {getSourceLabel(item.source, item.sourceName)}
            </span>
            {multiSourceLabel && (
              <span
                title={multiSourceLabel}
                className="px-2 py-0.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 inline-flex items-center gap-1"
              >
                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                <span>{multiSourceLabel}</span>
              </span>
            )}
            <span className="px-2 py-0.5 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300">
              {CATEGORY_LABELS[item.category]}
            </span>
            {item.employmentType && item.employmentType !== 'diger' && (
              <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                {EMPLOYMENT_TYPE_LABELS[item.employmentType]}
              </span>
            )}
            {item.examType && item.examType !== 'unspecified' && (
              <span
                className={`px-2 py-0.5 border ${
                  item.examType === 'kpss_only'
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                {EXAM_TYPE_LABELS[item.examType]}
              </span>
            )}
            {(item.noticeType === 'iptal' ||
              item.noticeType === 'duzeltme' ||
              item.noticeType === 'sonuc') && (
              <span
                className={`px-2 py-0.5 border ${
                  item.noticeType === 'iptal'
                    ? 'border-red-400 dark:border-red-700 bg-red-100 dark:bg-red-950/70 text-red-900 dark:text-red-200'
                    : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200'
                }`}
              >
                {NOTICE_TYPE_LABELS[item.noticeType]}
              </span>
            )}
            <span
              className={`px-2 py-0.5 border tabular-nums ${
                item.status === 'acik'
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.status === 'acik' ? 'Açık' : 'Kapalı'}
            </span>
            {positionsCount > 0 && (
              <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums">
                {positionsCount} Alt Kadro
              </span>
            )}
            {typeof matchScore === 'number' && (
              <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 tabular-nums">
                Uyum: %{matchScore}
              </span>
            )}
            {typeof matchedPositionCount === 'number' &&
              typeof totalPositionCount === 'number' &&
              totalPositionCount > 0 && (
                <span className="px-2 py-0.5 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 tabular-nums">
                  {matchedPositionCount} / {totalPositionCount} Alt Kadro Uygun
                </span>
              )}
            {typeof scoreMargin === 'number' && (
              <span className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums">
                KPSS Farkı: {scoreMargin >= 0 ? `+${scoreMargin}` : scoreMargin}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            <span>{item.institution}</span>
            {item.organizationUnit && (
              <span className="text-slate-600 dark:text-slate-400 font-normal">
                ({item.organizationUnit})
              </span>
            )}
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
            <span
              className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                isUrgent
                  ? 'text-[#b91c1c] dark:text-red-300'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
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
