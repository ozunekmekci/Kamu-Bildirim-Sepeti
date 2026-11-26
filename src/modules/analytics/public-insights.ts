import { QUALIFICATIONS_BY_CODE } from '@/data/qualifications';
import { PLACEMENT_RECORDS } from '@/data/records';
import { normalizeTrSearch, toTurkishUpper } from '@/lib/turkish';
import { OFFICIAL_SOURCE_URLS } from '@/modules/announcements/parsers';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementSource,
} from '@/modules/announcements/types';
import { evaluateAnnouncementMatch, MatchingProfileInput } from '@/modules/matching';
import { PlacementRecord } from '@/types/kpss';

export interface InstitutionInsight {
  name: string;
  count: number;
  quota: number;
  avgMinScore: number | null;
}

export interface CityInsight {
  slug: string;
  city: string;
  archivePostsCount: number;
  archiveQuota: number;
  openAnnouncementsCount: number;
  avgMinScore: number | null;
}

export interface QualificationCodeInsight {
  code: string;
  label: string;
  count: number;
}

export interface PeriodInsight {
  period: string;
  postsCount: number;
  totalQuota: number;
  avgMinScore: number | null;
}

export interface CategoryInsight {
  category: AnnouncementCategory;
  label: string;
  openCount: number;
  totalCount: number;
}

export interface PublicInsightsSummary {
  totalArchivePosts: number;
  totalArchiveQuota: number;
  totalOpenAnnouncements: number;
  totalAllAnnouncements: number;
  topInstitutions: InstitutionInsight[];
  topCities: CityInsight[];
  topQualificationCodes: QualificationCodeInsight[];
  periodBreakdown: PeriodInsight[];
  categoryBreakdown: CategoryInsight[];
}

export interface CitySeoCatalogEntry {
  slug: string;
  city: string;
  openAnnouncementsCount: number;
  archivePostsCount: number;
  archiveQuota: number;
  avgMinScore: number | null;
}

export interface CityLandingData {
  slug: string;
  city: string;
  announcements: Announcement[];
  nationalAnnouncements: Announcement[];
  archivePostsCount: number;
  archiveQuota: number;
  avgMinScore: number | null;
  topInstitutions: InstitutionInsight[];
}

export type OfficialSourceSlug =
  | 'kariyer-kapisi'
  | 'kamuilan-sbb'
  | 'iskur'
  | 'resmi-gazete';

export interface SourceLandingData {
  slug: OfficialSourceSlug;
  source: Exclude<AnnouncementSource, 'osym_kpss'>;
  sourceName: string;
  sourceUrl: string;
  description: string;
  announcements: Announcement[];
}

export interface ProfileScenarioComparison {
  baseEligibleCount: number;
  altEligibleCount: number;
  deltaCount: number;
  gained: Announcement[];
  lost: Announcement[];
}

const CATEGORY_DEFINITIONS: Array<{ category: AnnouncementCategory; label: string }> = [
  { category: 'atama', label: 'Atama' },
  { category: 'personel_alimi', label: 'Personel Alımı' },
  { category: 'gorevlendirme', label: 'Görevlendirme' },
];

const SOURCE_CONFIG: Record<
  OfficialSourceSlug,
  {
    source: Exclude<AnnouncementSource, 'osym_kpss'>;
    description: string;
  }
> = {
  'kariyer-kapisi': {
    source: 'kariyer_kapisi',
    description:
      'Cumhurbaşkanlığı İnsan Kaynakları Ofisi Kariyer Kapısı üzerinde yayımlanan merkezi ve sözleşmeli kamu personel alım ilanları.',
  },
  'kamuilan-sbb': {
    source: 'sbb',
    description:
      'T.C. Cumhurbaşkanlığı Strateji ve Bütçe Başkanlığı (SBB) Kamu İlan portalında yayımlanan merkezi kurum, akademik ve sözleşmeli alım duyuruları.',
  },
  iskur: {
    source: 'iskur',
    description:
      'Türkiye İş Kurumu (İŞKUR) kamu iş ilanları kapısında yayımlanan sürekli işçi ve kamu kurumu alım duyuruları.',
  },
  'resmi-gazete': {
    source: 'resmi_gazete',
    description:
      'T.C. Resmî Gazete Çeşitli İlanlar bölümünde yayımlanan memur alımı, uzman yardımcılığı, atama ve görevlendirme duyuruları.',
  },
};

const CITY_CACHE_MAX = 512;
const citySlugCache = new Map<string, string>();
const canonicalCityCache = new Map<string, string>();

/**
 * Converts a Turkish city name into an ASCII URL slug using Turkish search normalization.
 */
export function slugifyTurkishCity(city: string): string {
  const cached = citySlugCache.get(city);
  if (cached !== undefined) return cached;
  const computed = normalizeTrSearch(city).replace(/\s+/g, '-');
  if (citySlugCache.size < CITY_CACHE_MAX) {
    citySlugCache.set(city, computed);
  }
  return computed;
}

function canonicalizeCityName(rawCity: string): string {
  const cached = canonicalCityCache.get(rawCity);
  if (cached !== undefined) return cached;
  const withoutParens = rawCity.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const computed = withoutParens ? toTurkishUpper(withoutParens) : '';
  if (canonicalCityCache.size < CITY_CACHE_MAX) {
    canonicalCityCache.set(rawCity, computed);
  }
  return computed;
}

function isGenericNationalCity(city: string): boolean {
  const norm = normalizeTrSearch(city);
  return !norm || norm === 'turkiye geneli' || norm === 'merkez';
}

function computeAverageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const total = scores.reduce((acc, value) => acc + value, 0);
  return Number((total / scores.length).toFixed(2));
}

function parsePeriodOrderKey(period: string): number {
  const parts = period.split('/');
  const year = parseInt(parts[0] ?? '0', 10) || 0;
  const term = parseInt(parts[1] ?? '0', 10) || 0;
  return year * 100 + term;
}

function sortAnnouncementsForDisplay(items: Announcement[]): Announcement[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'acik' ? -1 : 1;
    }
    if (a.status === 'acik') {
      return a.deadlineAt.localeCompare(b.deadlineAt);
    }
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

function buildInstitutionInsights(records: PlacementRecord[], limit = 10): InstitutionInsight[] {
  const instMap = new Map<
    string,
    { count: number; quota: number; scores: number[] }
  >();

  for (const record of records) {
    if (!record.kurumAdi) continue;
    let bucket = instMap.get(record.kurumAdi);
    if (!bucket) {
      bucket = { count: 0, quota: 0, scores: [] };
      instMap.set(record.kurumAdi, bucket);
    }
    bucket.count += 1;
    bucket.quota += record.kontenjan || 0;
    if (record.tabanPuan !== null && !Number.isNaN(record.tabanPuan)) {
      bucket.scores.push(record.tabanPuan);
    }
  }

  return Array.from(instMap.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      quota: data.quota,
      avgMinScore: computeAverageScore(data.scores),
    }))
    .sort((a, b) => {
      if (b.quota !== a.quota) return b.quota - a.quota;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, 'tr-TR');
    })
    .slice(0, limit);
}

interface CityAccumulator {
  slug: string;
  city: string;
  archivePostsCount: number;
  archiveQuota: number;
  openAnnouncementsCount: number;
  scores: number[];
}

function buildCityAccumulators(
  records: PlacementRecord[],
  announcements: Announcement[]
): Map<string, CityAccumulator> {
  const cityMap = new Map<string, CityAccumulator>();

  const ensureCity = (canonicalName: string): CityAccumulator | null => {
    if (!canonicalName || isGenericNationalCity(canonicalName)) {
      return null;
    }
    const slug = slugifyTurkishCity(canonicalName);
    if (!slug || slug === 'turkiye-geneli') {
      return null;
    }
    let entry = cityMap.get(slug);
    if (!entry) {
      entry = {
        slug,
        city: canonicalName,
        archivePostsCount: 0,
        archiveQuota: 0,
        openAnnouncementsCount: 0,
        scores: [],
      };
      cityMap.set(slug, entry);
    }
    return entry;
  };

  for (const record of records) {
    const canonical = canonicalizeCityName(record.sehir);
    const entry = ensureCity(canonical);
    if (!entry) continue;
    entry.archivePostsCount += 1;
    entry.archiveQuota += record.kontenjan || 0;
    if (record.tabanPuan !== null && !Number.isNaN(record.tabanPuan)) {
      entry.scores.push(record.tabanPuan);
    }
  }

  for (const item of announcements) {
    if (item.status !== 'acik') continue;
    const itemSlugsSeen = new Set<string>();
    const rawCities = [item.city, ...(item.criteria?.cities ?? [])];
    for (const rawCity of rawCities) {
      const canonical = canonicalizeCityName(rawCity);
      const entry = ensureCity(canonical);
      if (!entry || itemSlugsSeen.has(entry.slug)) continue;
      itemSlugsSeen.add(entry.slug);
      entry.openAnnouncementsCount += 1;
    }
  }

  return cityMap;
}

/**
 * Computes aggregate public analytics directly from KPSS placement archive and announcement datasets.
 */
export function getPublicInsightsSummary(
  records: PlacementRecord[] = PLACEMENT_RECORDS,
  announcements: Announcement[] = INITIAL_ANNOUNCEMENTS
): PublicInsightsSummary {
  let totalArchiveQuota = 0;
  const codeCounts = new Map<string, number>();
  const periodMap = new Map<
    string,
    { postsCount: number; totalQuota: number; scores: number[] }
  >();

  for (const record of records) {
    const quota = record.kontenjan || 0;
    totalArchiveQuota += quota;

    if (record.donem) {
      let periodBucket = periodMap.get(record.donem);
      if (!periodBucket) {
        periodBucket = { postsCount: 0, totalQuota: 0, scores: [] };
        periodMap.set(record.donem, periodBucket);
      }
      periodBucket.postsCount += 1;
      periodBucket.totalQuota += quota;
      if (record.tabanPuan !== null && !Number.isNaN(record.tabanPuan)) {
        periodBucket.scores.push(record.tabanPuan);
      }
    }

    const uniqueCodes = new Set(record.nitelikKodlari ?? []);
    for (const code of uniqueCodes) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  const totalOpenAnnouncements = announcements.filter((a) => a.status === 'acik').length;

  const topInstitutions = buildInstitutionInsights(records, 10);

  const cityMap = buildCityAccumulators(records, announcements);
  const topCities: CityInsight[] = Array.from(cityMap.values())
    .map((entry) => ({
      slug: entry.slug,
      city: entry.city,
      archivePostsCount: entry.archivePostsCount,
      archiveQuota: entry.archiveQuota,
      openAnnouncementsCount: entry.openAnnouncementsCount,
      avgMinScore: computeAverageScore(entry.scores),
    }))
    .sort((a, b) => {
      if (b.archiveQuota !== a.archiveQuota) return b.archiveQuota - a.archiveQuota;
      if (b.archivePostsCount !== a.archivePostsCount) {
        return b.archivePostsCount - a.archivePostsCount;
      }
      if (b.openAnnouncementsCount !== a.openAnnouncementsCount) {
        return b.openAnnouncementsCount - a.openAnnouncementsCount;
      }
      return a.city.localeCompare(b.city, 'tr-TR');
    })
    .slice(0, 15);

  const topQualificationCodes: QualificationCodeInsight[] = Array.from(codeCounts.entries())
    .map(([code, count]) => ({
      code,
      label: QUALIFICATIONS_BY_CODE[code]?.kisaTanim ?? `Nitelik Kodu ${code}`,
      count,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.code.localeCompare(b.code, 'tr-TR');
    })
    .slice(0, 10);

  const periodBreakdown: PeriodInsight[] = Array.from(periodMap.entries())
    .map(([period, data]) => ({
      period,
      postsCount: data.postsCount,
      totalQuota: data.totalQuota,
      avgMinScore: computeAverageScore(data.scores),
    }))
    .sort((a, b) => parsePeriodOrderKey(a.period) - parsePeriodOrderKey(b.period));

  const categoryBreakdown: CategoryInsight[] = CATEGORY_DEFINITIONS.map(
    ({ category, label }) => {
      let openCount = 0;
      let totalCount = 0;
      for (const item of announcements) {
        if (item.category === category) {
          totalCount += 1;
          if (item.status === 'acik') {
            openCount += 1;
          }
        }
      }
      return {
        category,
        label,
        openCount,
        totalCount,
      };
    }
  );

  return {
    totalArchivePosts: records.length,
    totalArchiveQuota,
    totalOpenAnnouncements,
    totalAllAnnouncements: announcements.length,
    topInstitutions,
    topCities,
    topQualificationCodes,
    periodBreakdown,
    categoryBreakdown,
  };
}

/**
 * Returns deterministic Turkish province catalog sorted by combined activity descending.
 */
export function getCitySeoCatalog(
  records: PlacementRecord[] = PLACEMENT_RECORDS,
  announcements: Announcement[] = INITIAL_ANNOUNCEMENTS
): CitySeoCatalogEntry[] {
  const cityMap = buildCityAccumulators(records, announcements);

  return Array.from(cityMap.values())
    .map((entry) => ({
      slug: entry.slug,
      city: entry.city,
      openAnnouncementsCount: entry.openAnnouncementsCount,
      archivePostsCount: entry.archivePostsCount,
      archiveQuota: entry.archiveQuota,
      avgMinScore: computeAverageScore(entry.scores),
    }))
    .sort((a, b) => {
      const activityA = a.openAnnouncementsCount * 500 + a.archiveQuota + a.archivePostsCount;
      const activityB = b.openAnnouncementsCount * 500 + b.archiveQuota + b.archivePostsCount;
      if (activityB !== activityA) return activityB - activityA;
      if (b.archiveQuota !== a.archiveQuota) return b.archiveQuota - a.archiveQuota;
      return a.city.localeCompare(b.city, 'tr-TR');
    });
}

interface CityArchiveBucket {
  city: string;
  records: PlacementRecord[];
  archiveQuota: number;
  scores: number[];
  topInstitutions?: InstitutionInsight[];
}

const cityArchiveIndexCache = new WeakMap<PlacementRecord[], Map<string, CityArchiveBucket>>();

function getCityArchiveIndex(records: PlacementRecord[]): Map<string, CityArchiveBucket> {
  const cached = cityArchiveIndexCache.get(records);
  if (cached) return cached;

  const index = new Map<string, CityArchiveBucket>();
  for (const record of records) {
    const canonical = canonicalizeCityName(record.sehir);
    if (!canonical || isGenericNationalCity(canonical)) continue;
    const slug = slugifyTurkishCity(canonical);
    if (!slug || slug === 'turkiye-geneli' || slug === 'merkez') continue;

    let bucket = index.get(slug);
    if (!bucket) {
      bucket = { city: canonical, records: [], archiveQuota: 0, scores: [] };
      index.set(slug, bucket);
    }
    bucket.records.push(record);
    bucket.archiveQuota += record.kontenjan || 0;
    if (record.tabanPuan !== null && !Number.isNaN(record.tabanPuan)) {
      bucket.scores.push(record.tabanPuan);
    }
  }

  cityArchiveIndexCache.set(records, index);
  return index;
}

/**
 * Resolves city landing page data for a normalized Turkish city slug.
 */
export function getCityLandingData(
  slug: string,
  allAnnouncements: Announcement[] = INITIAL_ANNOUNCEMENTS,
  records: PlacementRecord[] = PLACEMENT_RECORDS
): CityLandingData | null {
  const targetSlug = slugifyTurkishCity(slug);
  if (!targetSlug || targetSlug === 'turkiye-geneli' || targetSlug === 'merkez') {
    return null;
  }

  const archiveBucket = getCityArchiveIndex(records).get(targetSlug);
  const cityAnnouncements: Announcement[] = [];
  const nationalAnnouncements: Announcement[] = [];
  let matchedCityLabel: string | null = archiveBucket ? archiveBucket.city : null;

  for (const item of allAnnouncements) {
    const rawCities = [item.city, ...(item.criteria?.cities ?? [])];
    let matchesCity = false;
    let isNational = false;

    for (const rawCity of rawCities) {
      const canonical = canonicalizeCityName(rawCity);
      if (!canonical) continue;
      if (slugifyTurkishCity(canonical) === targetSlug) {
        matchesCity = true;
        if (!matchedCityLabel) {
          matchedCityLabel = canonical;
        }
      } else if (normalizeTrSearch(canonical) === 'turkiye geneli') {
        isNational = true;
      }
    }

    if (matchesCity) {
      cityAnnouncements.push(item);
    } else if (isNational) {
      nationalAnnouncements.push(item);
    }
  }

  if (!matchedCityLabel) {
    return null;
  }

  if (!archiveBucket) {
    return {
      slug: targetSlug,
      city: matchedCityLabel,
      announcements: sortAnnouncementsForDisplay(cityAnnouncements),
      nationalAnnouncements: sortAnnouncementsForDisplay(nationalAnnouncements),
      archivePostsCount: 0,
      archiveQuota: 0,
      avgMinScore: null,
      topInstitutions: [],
    };
  }

  if (!archiveBucket.topInstitutions) {
    archiveBucket.topInstitutions = buildInstitutionInsights(archiveBucket.records, 10);
  }

  return {
    slug: targetSlug,
    city: matchedCityLabel,
    announcements: sortAnnouncementsForDisplay(cityAnnouncements),
    nationalAnnouncements: sortAnnouncementsForDisplay(nationalAnnouncements),
    archivePostsCount: archiveBucket.records.length,
    archiveQuota: archiveBucket.archiveQuota,
    avgMinScore: computeAverageScore(archiveBucket.scores),
    topInstitutions: archiveBucket.topInstitutions,
  };
}

/**
 * Resolves official source landing page data for supported public recruitment portals.
 */
export function getSourceLandingData(
  slug: string,
  allAnnouncements: Announcement[] = INITIAL_ANNOUNCEMENTS
): SourceLandingData | null {
  const rawNormalized = slugifyTurkishCity(slug);
  const normalized = (
    rawNormalized === 'sbb' ? 'kamuilan-sbb' : rawNormalized
  ) as OfficialSourceSlug;
  const config = SOURCE_CONFIG[normalized];
  if (!config) {
    return null;
  }

  const sourceMeta = OFFICIAL_SOURCE_URLS[config.source];
  const filtered = allAnnouncements.filter((item) => item.source === config.source);

  return {
    slug: normalized,
    source: config.source,
    sourceName: sourceMeta.name,
    sourceUrl: sourceMeta.url,
    description: config.description,
    announcements: sortAnnouncementsForDisplay(filtered),
  };
}

/**
 * Compares open announcement eligibility between a baseline profile and an alternate scenario.
 */
export function compareProfileScenarios(
  baseProfile: MatchingProfileInput,
  altProfile: MatchingProfileInput,
  announcements: Announcement[] = INITIAL_ANNOUNCEMENTS
): ProfileScenarioComparison {
  const openAnnouncements = announcements.filter((item) => item.status === 'acik');
  const gained: Announcement[] = [];
  const lost: Announcement[] = [];
  let baseEligibleCount = 0;
  let altEligibleCount = 0;

  for (const announcement of openAnnouncements) {
    const baseEligible = evaluateAnnouncementMatch(baseProfile, announcement).eligible;
    const altEligible = evaluateAnnouncementMatch(altProfile, announcement).eligible;

    if (baseEligible) baseEligibleCount += 1;
    if (altEligible) altEligibleCount += 1;

    if (!baseEligible && altEligible) {
      gained.push(announcement);
    } else if (baseEligible && !altEligible) {
      lost.push(announcement);
    }
  }

  return {
    baseEligibleCount,
    altEligibleCount,
    deltaCount: altEligibleCount - baseEligibleCount,
    gained,
    lost,
  };
}
