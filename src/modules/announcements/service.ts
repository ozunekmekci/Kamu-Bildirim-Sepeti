import { normalizeTrSearch } from '@/lib/turkish';
import { fetchOfficialAnnouncements } from './parsers';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementFacets,
  AnnouncementFilter,
  AnnouncementSource,
  AnnouncementStatus,
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
  referenceDate: string | Date = new Date()
): number {
  const targetMs = parseUtcDayMs(deadlineAt);
  const refMs = parseUtcDayMs(referenceDate);
  if (targetMs === null || refMs === null) return 0;
  return Math.round((targetMs - refMs) / 86_400_000);
}

export function filterAnnouncements(
  items: Announcement[],
  filter: AnnouncementFilter = {}
): Announcement[] {
  const { status, category, source, city, q } = filter;
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
    if (normCity && normCity !== 'hepsi' && normCity !== 'tumu') {
      const itemCityMatch = normalizeTrSearch(item.city) === normCity;
      const criteriaCityMatch = item.criteria.cities.some(
        (c) => normalizeTrSearch(c) === normCity
      );
      if (!itemCityMatch && !criteriaCityMatch) {
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
          ...item.criteria.cities,
          ...item.criteria.summaryLines,
          ...item.criteria.qualificationCodes,
          ...item.criteria.certificates,
        ].join(' ')
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
  options?: { timeoutMs?: number; referenceDate?: string }
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
