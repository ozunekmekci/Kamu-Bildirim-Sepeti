import { normalizeTrSearch } from '@/lib/turkish';
import type { DatabaseAdapter, SavedSearchFilters } from '@/modules/db/types';
import { enrichKariyerKapisiDetail, fetchAllOfficialSourcesV2 } from './connectors';
import { fetchOfficialAnnouncements } from './parsers';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementFacets,
  AnnouncementFilter,
  AnnouncementSource,
  AnnouncementStatus,
  EmploymentType,
  ExamType,
  FetchErrorItem,
  NoticeType,
  SourceCheckpoint,
  SyncOfficialResult,
} from './types';

function parseUtcDayMs(dateInput: string | Date): number | null {
  if (dateInput instanceof Date) {
    if (Number.isNaN(dateInput.getTime())) return null;
    return Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate());
  }
  const match = String(dateInput).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return Date.UTC(Number(y), Number(m) - 1, Number(d));
  }
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

export function getDeadlineDaysLeft(
  deadlineAt: string,
  referenceDate: string | Date = new Date(),
): number {
  const targetMs = parseUtcDayMs(deadlineAt);
  const refMs = parseUtcDayMs(referenceDate);
  if (targetMs === null || refMs === null) return 0;
  return Math.round((targetMs - refMs) / 86_400_000);
}

export function filterAnnouncements(
  items: Announcement[],
  filter: AnnouncementFilter = {},
): Announcement[] {
  const {
    status,
    category,
    source,
    employmentType,
    examType,
    noticeType,
    city,
    q,
    educationLevel,
    kpssScoreType,
    maxKpssScore,
    driverLicense,
    department,
  } = filter;
  const normCity = city ? normalizeTrSearch(city) : '';
  const normQuery = q ? normalizeTrSearch(q) : '';
  const normLicenseRaw = driverLicense ? driverLicense.trim() : '';
  const normLicenseSearch = normLicenseRaw ? normalizeTrSearch(normLicenseRaw) : '';
  const targetLicense =
    normLicenseRaw && normLicenseSearch !== 'hepsi' && normLicenseSearch !== 'tumu'
      ? normLicenseRaw.toUpperCase()
      : '';
  const normDepartment = department ? normalizeTrSearch(department) : '';
  const hasMaxKpssScore =
    typeof maxKpssScore === 'number' && Number.isFinite(maxKpssScore);

  return items.filter((item) => {
    if (status && status !== 'hepsi' && item.status !== status) {
      return false;
    }
    if (category && category !== 'hepsi' && item.category !== category) {
      return false;
    }
    if (source && source !== 'hepsi' && item.source !== source) {
      return false;
    }
    if (employmentType && employmentType !== 'hepsi') {
      const emp = item.employmentType ?? 'diger';
      if (employmentType === 'memur_ab') {
        if (emp !== 'memur_a' && emp !== 'memur_b') {
          return false;
        }
      } else if (emp !== employmentType) {
        return false;
      }
    }
    if (
      examType &&
      examType !== 'hepsi' &&
      (item.examType ?? 'unspecified') !== examType
    ) {
      return false;
    }
    if (
      noticeType &&
      noticeType !== 'hepsi' &&
      (item.noticeType ?? 'ilan') !== noticeType
    ) {
      return false;
    }
    if (normCity && normCity !== 'hepsi' && normCity !== 'tumu') {
      const itemCityMatch = normalizeTrSearch(item.city) === normCity;
      const criteriaCityMatch = item.criteria.cities.some(
        (c) => normalizeTrSearch(c) === normCity,
      );
      const positionCityMatch = (item.positions ?? []).some(
        (pos) => normalizeTrSearch(pos.city) === normCity,
      );
      if (!itemCityMatch && !criteriaCityMatch && !positionCityMatch) {
        return false;
      }
    }
    if (educationLevel && educationLevel !== 'hepsi') {
      const criteriaEduMatch = item.criteria.educationLevels.includes(educationLevel);
      const positionEduMatch = (item.positions ?? []).some(
        (pos) => pos.educationLevel === educationLevel,
      );
      if (!criteriaEduMatch && !positionEduMatch) {
        return false;
      }
    }
    if (kpssScoreType && kpssScoreType !== 'hepsi') {
      const criteriaTypeMatch = item.criteria.kpssScoreTypes.includes(kpssScoreType);
      const positionTypeMatch = (item.positions ?? []).some(
        (pos) => pos.kpssScoreType === kpssScoreType,
      );
      if (!criteriaTypeMatch && !positionTypeMatch) {
        return false;
      }
    }
    if (hasMaxKpssScore) {
      const criteriaScoreOk =
        item.criteria.minKpssScore === null || item.criteria.minKpssScore <= maxKpssScore;
      const positionScoreOk =
        (item.positions?.length ?? 0) > 0 &&
        (item.positions ?? []).some(
          (pos) => pos.minKpssScore === null || pos.minKpssScore <= maxKpssScore,
        );
      if (!criteriaScoreOk && !positionScoreOk) {
        return false;
      }
    }
    if (targetLicense) {
      const licenseMatch = item.criteria.driverLicenses.some(
        (lic) => lic.trim().toUpperCase() === targetLicense,
      );
      if (!licenseMatch) {
        return false;
      }
    }
    if (normDepartment && normDepartment !== 'hepsi' && normDepartment !== 'tumu') {
      const departmentHaystack = normalizeTrSearch(
        [
          ...(item.criteria.departments ?? []),
          ...item.criteria.qualificationCodes,
          item.title,
          item.summary,
          ...item.criteria.summaryLines,
          item.criteria.extractedTextExcerpt ?? '',
          ...(item.positions ?? []).map((pos) => pos.requirementsSummary),
        ].join(' '),
      );
      if (!departmentHaystack.includes(normDepartment)) {
        return false;
      }
    }
    if (normQuery) {
      const searchable = normalizeTrSearch(
        [
          item.institution,
          item.title,
          item.summary,
          item.city,
          item.sourceName,
          item.organizationUnit ?? '',
          ...item.criteria.cities,
          ...item.criteria.summaryLines,
          ...item.criteria.qualificationCodes,
          ...item.criteria.certificates,
          ...(item.criteria.departments ?? []),
          ...item.criteria.driverLicenses,
          item.criteria.extractedTextExcerpt ?? '',
          ...(item.positions ?? []).flatMap((pos) => [
            pos.title,
            pos.unvan ?? '',
            pos.city,
            pos.district ?? '',
            pos.requirementsSummary,
          ]),
        ].join(' '),
      );
      const tokens = normQuery.split(' ').filter(Boolean);
      for (const token of tokens) {
        if (!searchable.includes(token)) {
          return false;
        }
      }
    }
    return true;
  });
}

const SAVED_VALID_STATUSES = new Set(['acik', 'kapali', 'hepsi']);
const SAVED_VALID_CATEGORIES = new Set(['atama', 'personel_alimi', 'gorevlendirme', 'hepsi']);
const SAVED_VALID_SOURCES = new Set([
  'kariyer_kapisi',
  'sbb',
  'iskur',
  'resmi_gazete',
  'osym_kpss',
  'hepsi',
]);
const SAVED_VALID_EMPLOYMENT_TYPES = new Set([
  'memur_a',
  'memur_b',
  'sozlesmeli_4b',
  'akademik',
  'isci',
  'askeri_guvenlik',
  'gorevde_yukselme',
  'diger',
  'hepsi',
]);
const SAVED_VALID_EXAM_TYPES = new Set([
  'kpss_only',
  'oral_exam',
  'written_and_oral',
  'practice_exam',
  'unspecified',
  'hepsi',
]);
const SAVED_VALID_NOTICE_TYPES = new Set(['ilan', 'duzeltme', 'iptal', 'sonuc', 'hepsi']);
const SAVED_VALID_EDUCATION_LEVELS = new Set(['lisans', 'onlisans', 'ortaogretim', 'hepsi']);
const SAVED_VALID_KPSS_TYPES = new Set(['P3', 'P93', 'P94', 'hepsi']);

export function savedSearchFiltersToAnnouncementFilter(
  filters: SavedSearchFilters,
): AnnouncementFilter {
  const result: AnnouncementFilter = {};

  if (filters.status && SAVED_VALID_STATUSES.has(filters.status)) {
    result.status = filters.status as AnnouncementStatus | 'hepsi';
  }
  if (filters.category && SAVED_VALID_CATEGORIES.has(filters.category)) {
    result.category = filters.category as AnnouncementCategory | 'hepsi';
  }
  if (filters.source && SAVED_VALID_SOURCES.has(filters.source)) {
    result.source = filters.source as AnnouncementSource | 'hepsi';
  }
  if (
    filters.employmentType &&
    filters.employmentType !== 'memur_ab' &&
    SAVED_VALID_EMPLOYMENT_TYPES.has(filters.employmentType)
  ) {
    result.employmentType = filters.employmentType as EmploymentType | 'hepsi';
  }
  if (filters.examType && SAVED_VALID_EXAM_TYPES.has(filters.examType)) {
    result.examType = filters.examType as ExamType | 'hepsi';
  }
  if (filters.noticeType && SAVED_VALID_NOTICE_TYPES.has(filters.noticeType)) {
    result.noticeType = filters.noticeType as NoticeType | 'hepsi';
  }
  if (filters.city?.trim()) {
    result.city = filters.city.trim();
  }
  if (filters.q?.trim()) {
    result.q = filters.q.trim();
  }
  if (filters.educationLevel && SAVED_VALID_EDUCATION_LEVELS.has(filters.educationLevel)) {
    result.educationLevel = filters.educationLevel as
      | 'lisans'
      | 'onlisans'
      | 'ortaogretim'
      | 'hepsi';
  }
  if (filters.kpssScoreType) {
    const normalizedKpss =
      filters.kpssScoreType.trim().toLowerCase() === 'hepsi'
        ? 'hepsi'
        : filters.kpssScoreType.trim().toUpperCase();
    if (SAVED_VALID_KPSS_TYPES.has(normalizedKpss)) {
      result.kpssScoreType = normalizedKpss as 'P3' | 'P93' | 'P94' | 'hepsi';
    }
  }
  if (filters.maxKpssScore !== undefined && filters.maxKpssScore.trim() !== '') {
    const parsedScore = Number(filters.maxKpssScore.trim().replace(',', '.'));
    if (Number.isFinite(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
      result.maxKpssScore = parsedScore;
    }
  }
  if (filters.driverLicense?.trim()) {
    result.driverLicense = filters.driverLicense.trim();
  }
  if (filters.department?.trim()) {
    result.department = filters.department.trim();
  }

  return result;
}

export function matchesSavedSearchFilters(
  announcement: Announcement,
  filters: SavedSearchFilters,
): boolean {
  if (filters.employmentType === 'memur_ab') {
    if (announcement.employmentType !== 'memur_a' && announcement.employmentType !== 'memur_b') {
      return false;
    }
  }
  const announcementFilter = savedSearchFiltersToAnnouncementFilter(filters);
  return filterAnnouncements([announcement], announcementFilter).length === 1;
}

export function getAnnouncementFacets(items: Announcement[]): AnnouncementFacets {
  const categories: Record<AnnouncementCategory, number> = {
    atama: 0,
    personel_alimi: 0,
    gorevlendirme: 0,
  };
  const sources: Record<AnnouncementSource, number> = {
    kariyer_kapisi: 0,
    sbb: 0,
    iskur: 0,
    resmi_gazete: 0,
    osym_kpss: 0,
  };
  const statuses: Record<AnnouncementStatus, number> = {
    acik: 0,
    kapali: 0,
  };
  const citySet = new Set<string>();

  for (const item of items) {
    categories[item.category] = (categories[item.category] ?? 0) + 1;
    sources[item.source] = (sources[item.source] ?? 0) + 1;
    statuses[item.status] = (statuses[item.status] ?? 0) + 1;
    if (item.city) {
      citySet.add(item.city);
    }
  }

  const cities = Array.from(citySet).sort((a, b) => a.localeCompare(b, 'tr-TR'));

  return {
    categories,
    sources,
    statuses,
    cities,
  };
}

export type UpsertCallbackResult =
  | number
  | void
  | { inserted?: number; updated?: number; total?: number };

export async function syncOfficialSources(
  upsertFn: (items: Announcement[]) => Promise<UpsertCallbackResult> | UpsertCallbackResult,
  fetcher?: typeof fetch,
  options?: { timeoutMs?: number; referenceDate?: string },
): Promise<SyncOfficialResult> {
  const { items, errors } = await fetchOfficialAnnouncements(fetcher, options);
  if (items.length === 0) {
    return {
      syncedCount: 0,
      items: [],
      errors,
    };
  }

  const result = await upsertFn(items);
  const syncedCount =
    typeof result === 'number'
      ? result
      : typeof result === 'object' && result !== null && typeof result.total === 'number'
        ? result.total
        : items.length;
  return {
    syncedCount,
    items,
    errors,
  };
}

export interface SyncOfficialV2Options {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  referenceDate?: string;
  maxEnrichPerRun?: number;
  maxIskurCities?: number;
  includeResmiGazete?: boolean;
}

export interface SyncOfficialV2Result {
  syncedCount: number;
  inserted: number;
  updated: number;
  rawCount: number;
  dedupedCount: number;
  enrichedCount: number;
  expiredCount: number;
  prunedNoisyCount: number;
  items: Announcement[];
  errors: FetchErrorItem[];
  checkpoints: SourceCheckpoint[];
}

export function extractKariyerGuid(announcement: Announcement): string | null {
  if (announcement.source !== 'kariyer_kapisi') return null;
  try {
    const parsedUrl = new URL(announcement.sourceUrl);
    const paramGuid = parsedUrl.searchParams.get('i')?.trim();
    if (paramGuid) return paramGuid;
  } catch {
    // Fallback to externalId prefix parsing
  }
  const extPrefix = 'KARIYER_KAPISI-';
  if (announcement.externalId.startsWith(extPrefix)) {
    const rest = announcement.externalId.slice(extPrefix.length).trim();
    return rest || null;
  }
  return null;
}

/**
 * Enriches a single Kariyer Kapisi announcement on-demand when viewing its detail page.
 */
export async function enrichAnnouncementOnDemand(
  db: DatabaseAdapter,
  announcement: Announcement,
  fetcher?: typeof fetch,
  options?: { timeoutMs?: number },
): Promise<Announcement> {
  if (
    announcement.source !== 'kariyer_kapisi' ||
    announcement.enrichmentStatus === 'enriched' ||
    announcement.isDemo === true
  ) {
    return announcement;
  }

  const guid = extractKariyerGuid(announcement);
  if (!guid) {
    return announcement;
  }

  try {
    const enriched = await enrichKariyerKapisiDetail(guid, announcement, fetcher, options);
    const positions = enriched.positions ?? [];
    if (enriched.enrichmentStatus === 'enriched' || positions.length > 0) {
      await db.replaceAnnouncementPositions(enriched.id, positions);
      await db.upsertAnnouncements([{ ...enriched, isDemo: false }]);
      return {
        ...enriched,
        positions,
        positionsCount: positions.length,
      };
    }
    return announcement;
  } catch {
    return announcement;
  }
}

/**
 * Runs Phase 7 multi-source sync with checkpoints, demo/noise pruning, expiry closure,
 * and staged Kariyer Kapisi detail + position enrichment.
 */
export async function syncOfficialSourcesV2(
  db: DatabaseAdapter,
  options: SyncOfficialV2Options = {},
): Promise<SyncOfficialV2Result> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const maxEnrichPerRun = Math.max(0, options.maxEnrichPerRun ?? 6);
  const existingCheckpoints = await db.listSourceCheckpoints();
  const checkpointsBySource: Record<string, SourceCheckpoint | undefined> = {};
  for (const cp of existingCheckpoints) {
    checkpointsBySource[cp.source] = cp;
  }

  const fetchResult = await fetchAllOfficialSourcesV2(options.fetcher, {
    timeoutMs,
    referenceDate: options.referenceDate,
    checkpoints: checkpointsBySource,
    maxIskurCities: options.maxIskurCities,
    includeResmiGazete: options.includeResmiGazete,
  });

  let inserted = 0;
  let updated = 0;
  let prunedNoisyCount = 0;

  if (fetchResult.items.length > 0) {
    const normalizedItems = fetchResult.items.map((item) => ({
      ...item,
      isDemo: false,
    }));
    const upsertRes = await db.upsertAnnouncements(normalizedItems);
    inserted = upsertRes.inserted;
    updated = upsertRes.updated;

    const pruneRes = await db.pruneNoisyAndDemoProductionRows();
    prunedNoisyCount = pruneRes.prunedNoisy;
  }

  const expiredCount = await db.markExpiredAnnouncements(options.referenceDate);

  const savedCheckpoints: SourceCheckpoint[] = [];
  for (const cp of fetchResult.sourceCheckpoints) {
    savedCheckpoints.push(await db.upsertSourceCheckpoint(cp));
  }

  let enrichedCount = 0;
  const errors = [...fetchResult.errors];
  if (maxEnrichPerRun > 0) {
    const liveList = await db.listAnnouncements({
      source: 'kariyer_kapisi',
      status: 'hepsi',
      excludeDemo: true,
    });
    const pendingCandidates = liveList
      .filter((item) => item.enrichmentStatus === 'pending' && Boolean(extractKariyerGuid(item)))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, maxEnrichPerRun);

    for (let idx = 0; idx < pendingCandidates.length; idx += 1) {
      const candidate = pendingCandidates[idx];
      const guid = extractKariyerGuid(candidate);
      if (!guid) continue;
      try {
        const enriched = await enrichKariyerKapisiDetail(guid, candidate, options.fetcher, {
          timeoutMs,
        });
        if (enriched.enrichmentStatus !== 'enriched') {
          if (idx === 0) {
            break;
          }
          continue;
        }
        const positions = enriched.positions ?? [];
        await db.replaceAnnouncementPositions(enriched.id, positions);
        await db.upsertAnnouncements([{ ...enriched, isDemo: false }]);
        enrichedCount += 1;
      } catch (err) {
        errors.push({
          source: 'kariyer_kapisi',
          sourceName: candidate.sourceName,
          url: candidate.sourceUrl,
          message: err instanceof Error ? err.message : 'Detay zenginleştirme hatası.',
        });
        if (idx === 0) {
          break;
        }
      }
    }
  }

  const syncedCount = inserted + updated;
  return {
    syncedCount,
    inserted,
    updated,
    rawCount: fetchResult.rawCount,
    dedupedCount: fetchResult.dedupedCount,
    enrichedCount,
    expiredCount,
    prunedNoisyCount,
    items: fetchResult.items,
    errors,
    checkpoints: savedCheckpoints,
  };
}
