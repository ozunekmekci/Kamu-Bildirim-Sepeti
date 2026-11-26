import { normalizeTrSearch } from '@/lib/turkish';
import type { DatabaseAdapter } from '@/modules/db/types';
import { enrichKariyerKapisiDetail, fetchAllOfficialSourcesV2 } from './connectors';
import { fetchOfficialAnnouncements } from './parsers';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementFacets,
  AnnouncementFilter,
  AnnouncementSource,
  AnnouncementStatus,
  FetchErrorItem,
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
  const { status, category, source, employmentType, examType, noticeType, city, q } = filter;
  const normCity = city ? normalizeTrSearch(city) : '';
  const normQuery = q ? normalizeTrSearch(q) : '';

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
    if (
      employmentType &&
      employmentType !== 'hepsi' &&
      (item.employmentType ?? 'diger') !== employmentType
    ) {
      return false;
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
          ...(item.positions ?? []).flatMap((pos) => [
            pos.title,
            pos.unvan ?? '',
            pos.city,
            pos.district ?? '',
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
