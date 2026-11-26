import { normalizeTrSearch, toTurkishUpper } from '@/lib/turkish';
import {
  OFFICIAL_SOURCE_URLS,
  computeStatus,
  decodeHtmlEntities,
  extractAttr,
  extractCriteriaFromText,
  extractQuota,
  parseKariyerKapisiHtml,
  parseResmiGazeteHtml,
  resolveUrl,
  stripTags,
} from './parsers';
import {
  classifyAnnouncement,
  computeContentHash,
  inferCityFromInstitutionOrText,
  isPublicRecruitmentResmiGazeteItem,
  mergeCrossSourceAnnouncements,
  parseCityAndDistrict,
  parseTurkishDateRange,
} from './taxonomy';
import {
  Announcement,
  AnnouncementPosition,
  EnrichmentStatus,
  FetchErrorItem,
  SourceCheckpoint,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = 'KamuBildirimSepeti/1.0 (+https://kamubildirimsepeti.example)';
const KARIYER_API_BASE = 'https://api.kariyerkapisi.gov.tr';
const KARIYER_ORIGIN = 'https://kariyerkapisi.gov.tr';
const KARIYER_REFERER = 'https://kariyerkapisi.gov.tr/isealim';
const SBB_URL = 'https://kamuilan.sbb.gov.tr/';
const ISKUR_MEMUR_URL = 'https://www.iskur.gov.tr/ilanlar/kamu-memur-alim-ilanlari/';

function resolveFetcher(fetcher?: typeof fetch): typeof fetch | null {
  if (fetcher) return fetcher;
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  return null;
}

function getTodayIso(referenceDate?: string): string {
  return referenceDate ?? new Date().toISOString().slice(0, 10);
}

function getReferenceYear(referenceDate?: string): number {
  const iso = getTodayIso(referenceDate);
  const year = Number(iso.slice(0, 4));
  return Number.isFinite(year) && year > 2000 ? year : new Date().getUTCFullYear();
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractIsoDatePrefix(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function buildErrorItem(
  source: FetchErrorItem['source'],
  url: string,
  err: unknown,
  timeoutMs: number
): FetchErrorItem {
  const sourceName =
    source === 'osym_kpss' ? 'ÖSYM KPSS' : OFFICIAL_SOURCE_URLS[source].name;
  const message =
    err instanceof Error
      ? err.name === 'AbortError' || err.name === 'TimeoutError'
        ? `İstek zaman aşımına uğradı (${timeoutMs} ms).`
        : err.message
      : 'Bilinmeyen bağlantı hatası.';
  return { source, sourceName, url, message };
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strips BBCode tags (`[justify]`, `[size=14pt]`, etc.) and HTML markup from Kariyer Kapisi rich text.
 */
export function cleanBbCodeAndHtml(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const withoutBbCode = raw.replace(/\[\/?[a-z0-9]+(?:=[^\]]*)?\]/gi, ' ');
  return decodeHtmlEntities(
    withoutBbCode
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMaxAgeFromText(text: string): number | null {
  const match =
    text.match(/(\d{2})\s*yaş(?:ından\s*gün\s*almamış|ını\s*doldurmamış|ından\s*büyük\s*olmamak)/i) ??
    text.match(/yaş\s*(?:sınırı|üst\s*sınırı)\s*[:\-]?\s*(\d{2})/i);
  if (!match) return null;
  const age = Number(match[1]);
  return Number.isFinite(age) && age >= 18 && age <= 70 ? age : null;
}

function extractPrimaryEducationLevel(
  text: string
): 'lisans' | 'onlisans' | 'ortaogretim' | null {
  const lineMatch = text.match(/MEZUNİYET\s*[:\-]\s*([^\n]+)/i);
  const target = normalizeTrSearch(lineMatch ? lineMatch[1] : text);
  if (target.includes('onlisans') || target.includes('on lisans')) return 'onlisans';
  if (target.includes('ortaogretim') || target.includes('lise')) return 'ortaogretim';
  if (/\blisans\b/.test(target)) return 'lisans';
  return null;
}

interface KariyerSearchRow {
  guid?: unknown;
  kurumAdi?: unknown;
  birimAdi?: unknown;
  ilanBaslik?: unknown;
  ilanTuru?: unknown;
  basTarih?: unknown;
  bitTarih?: unknown;
  basvuruLinki?: unknown;
}

interface KariyerPreviewPayload {
  kurumAdi?: unknown;
  birimAdi?: unknown;
  ilanBaslik?: unknown;
  ilanMetni?: unknown;
  ilanTuru?: unknown;
  basTarih?: unknown;
  bitTarih?: unknown;
  eDevletServisURL?: unknown;
  basvuruLinki?: unknown;
  kontenjan?: unknown;
}

interface KariyerAltilanRow {
  ilanBaslik?: unknown;
  ilanMetni?: unknown;
  unvan?: unknown;
  kontenjanList?: Array<{ il?: unknown; kontenjan?: unknown }>;
  degerlemeAsamaList?: Array<{
    asamaAdi?: unknown;
    sinavsizAsama?: unknown;
    puansizAsama?: unknown;
    turu?: unknown;
    agirlik?: unknown;
  }>;
}

function kariyerApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: KARIYER_ORIGIN,
    Referer: KARIYER_REFERER,
    'User-Agent': USER_AGENT,
  };
}

function stripInstitutionPrefix(rawTitle: string, institution: string): string {
  const normTitle = normalizeTrSearch(rawTitle);
  const normInst = normalizeTrSearch(institution);
  if (normInst && normTitle.startsWith(normInst)) {
    const dashSplit = rawTitle.match(/^.+?\s+-\s+(.+)$/);
    if (dashSplit && dashSplit[1]) {
      return dashSplit[1].trim();
    }
  }
  return rawTitle.trim();
}

function finalizeConnectorAnnouncement(
  base: Announcement,
  rawType?: string | null,
  description?: string | null
): Announcement {
  const inferredCity =
    base.city && base.city !== 'TÜRKİYE GENELİ'
      ? base.city
      : inferCityFromInstitutionOrText(base.institution, `${base.title} ${description ?? ''}`);
  const classification = classifyAnnouncement({
    source: base.source,
    institution: base.institution,
    title: base.title,
    rawType,
    description: description ?? base.summary,
  });

  const cities = Array.from(
    new Set(
      [...(base.criteria.cities ?? []), inferredCity].filter(
        (c) => Boolean(c) && (inferredCity === 'TÜRKİYE GENELİ' || c !== 'TÜRKİYE GENELİ')
      )
    )
  );
  if (cities.length === 0) cities.push('TÜRKİYE GENELİ');

  const verifiedSources = base.verifiedSources?.length
    ? base.verifiedSources
    : [{ source: base.source, sourceName: base.sourceName, url: base.sourceUrl }];

  return {
    ...base,
    city: inferredCity,
    category: classification.category,
    employmentType: base.employmentType ?? classification.employmentType,
    noticeType: base.noticeType ?? classification.noticeType,
    examType: base.examType ?? classification.examType,
    verifiedSources,
    enrichmentStatus: base.enrichmentStatus ?? 'pending',
    isDemo: false,
    criteria: {
      ...base.criteria,
      cities,
    },
    contentHash:
      base.contentHash ??
      computeContentHash({
        externalId: base.externalId,
        institution: base.institution,
        title: base.title,
        deadlineAt: base.deadlineAt,
        city: inferredCity,
      }),
  };
}

export interface ConnectorFetchResult {
  items: Announcement[];
  error: FetchErrorItem | null;
  checkpoint: SourceCheckpoint;
  usedFallback?: boolean;
}

/**
 * Fetches live public recruitment listings from Kariyer Kapisi JSON API,
 * falling back to official RSS only when the JSON API request fails.
 */
export async function fetchKariyerKapisiApi(
  fetcher?: typeof fetch,
  options?: {
    timeoutMs?: number;
    referenceDate?: string;
    previousCheckpoint?: SourceCheckpoint | null;
  }
): Promise<ConnectorFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const refDate = getTodayIso(options?.referenceDate);
  const nowIso = new Date().toISOString();
  const endpointUrl = `${KARIYER_API_BASE}/api/ilan/GetIseAlimPage`;
  const fetchFn = resolveFetcher(fetcher);

  if (!fetchFn) {
    const error: FetchErrorItem = {
      source: 'kariyer_kapisi',
      sourceName: OFFICIAL_SOURCE_URLS.kariyer_kapisi.name,
      url: endpointUrl,
      message: 'Fetch istemcisi kullanılabilir değil.',
    };
    return {
      items: [],
      error,
      checkpoint: {
        source: 'kariyer_kapisi',
        etag: null,
        lastModified: null,
        bodyHash: null,
        lastCheckedAt: nowIso,
        lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
        activeCount: 0,
        lastError: error.message,
      },
    };
  }

  try {
    const res = await fetchWithTimeout(
      fetchFn,
      endpointUrl,
      {
        method: 'POST',
        headers: kariyerApiHeaders(),
        body: JSON.stringify({ krM_ID: 0, searchText: '', il: '0', ilanTuru: '0' }),
      },
      timeoutMs
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} yanıtı alındı.`);
    }

    const rawText = await res.text();
    const parsed = JSON.parse(rawText) as {
      searchIlan?: KariyerSearchRow[];
      data?: { searchIlan?: KariyerSearchRow[] };
    };
    const rows = Array.isArray(parsed?.searchIlan)
      ? parsed.searchIlan
      : Array.isArray(parsed?.data?.searchIlan)
        ? parsed.data.searchIlan
        : null;

    if (!rows) {
      throw new Error('Kariyer Kapısı API yanıtında searchIlan alanı bulunamadı.');
    }

    const items: Announcement[] = [];
    const seenIds = new Set<string>();

    for (const row of rows) {
      const guid = nonEmptyString(row.guid);
      const institution = nonEmptyString(row.kurumAdi);
      const rawTitle = nonEmptyString(row.ilanBaslik);
      if (!guid || !institution || !rawTitle) continue;

      const title = stripInstitutionPrefix(rawTitle, institution);
      const organizationUnit = nonEmptyString(row.birimAdi);
      const rawType = nonEmptyString(row.ilanTuru);
      const publishedAt = extractIsoDatePrefix(row.basTarih) ?? refDate;
      const deadlineAt = extractIsoDatePrefix(row.bitTarih) ?? publishedAt;
      const applyUrl = nonEmptyString(row.basvuruLinki);
      const sourceUrl = `${KARIYER_ORIGIN}/IlanDetay?i=${encodeURIComponent(guid)}`;
      const externalId = `KARIYER_KAPISI-${guid}`;
      const id = `kariyer_kapisi-${externalId}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const city = inferCityFromInstitutionOrText(
        institution,
        `${title} ${organizationUnit ?? ''}`
      );
      const classification = classifyAnnouncement({
        source: 'kariyer_kapisi',
        institution,
        title,
        rawType,
      });
      const criteria = extractCriteriaFromText(`${institution} ${title} ${rawType ?? ''}`, city);
      const quota = extractQuota(title);
      const summaryParts = [rawType, organizationUnit, title].filter(Boolean);
      const summary = summaryParts.join(' - ').slice(0, 220);

      const contentHash = computeContentHash({
        externalId,
        institution,
        title,
        publishedAt,
        deadlineAt,
        applyUrl,
      });

      items.push({
        id,
        externalId,
        source: 'kariyer_kapisi',
        sourceName: OFFICIAL_SOURCE_URLS.kariyer_kapisi.name,
        sourceUrl,
        institution,
        title,
        category: classification.category,
        city,
        status: computeStatus(deadlineAt, refDate),
        publishedAt,
        deadlineAt,
        quota,
        summary,
        criteria,
        employmentType: classification.employmentType,
        noticeType: classification.noticeType,
        examType: classification.examType,
        organizationUnit,
        applyUrl,
        verifiedSources: [
          {
            source: 'kariyer_kapisi',
            sourceName: OFFICIAL_SOURCE_URLS.kariyer_kapisi.name,
            url: sourceUrl,
          },
        ],
        enrichmentStatus: 'pending',
        contentHash,
        lastSeenAt: nowIso,
        isDemo: false,
      });
    }

    const bodyHash = computeContentHash(rawText);
    const changed = options?.previousCheckpoint?.bodyHash !== bodyHash;
    return {
      items,
      error: null,
      usedFallback: false,
      checkpoint: {
        source: 'kariyer_kapisi',
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        bodyHash,
        lastCheckedAt: nowIso,
        lastChangedAt: changed
          ? nowIso
          : options?.previousCheckpoint?.lastChangedAt ?? nowIso,
        activeCount: items.length,
        lastError: null,
      },
    };
  } catch (apiErr) {
    // Fallback to official RSS only when the primary JSON API fails, preserving the API failure reason
    const apiError = buildErrorItem('kariyer_kapisi', endpointUrl, apiErr, timeoutMs);
    const rssUrl = OFFICIAL_SOURCE_URLS.kariyer_kapisi.feedUrl ?? KARIYER_ORIGIN;
    try {
      const rssRes = await fetchWithTimeout(
        fetchFn,
        rssUrl,
        {
          method: 'GET',
          headers: {
            Accept: 'application/rss+xml, application/xml, text/xml',
            'User-Agent': USER_AGENT,
          },
        },
        timeoutMs
      );
      if (!rssRes.ok) {
        throw new Error(`RSS HTTP ${rssRes.status}`);
      }
      const xml = await rssRes.text();
      const rssItems = parseKariyerKapisiHtml(xml, refDate).map((item) =>
        finalizeConnectorAnnouncement({
          ...item,
          lastSeenAt: nowIso,
          enrichmentStatus: 'pending',
        })
      );
      const bodyHash = computeContentHash(xml);
      const changed = options?.previousCheckpoint?.bodyHash !== bodyHash;
      return {
        items: rssItems,
        error: null,
        usedFallback: true,
        checkpoint: {
          source: 'kariyer_kapisi',
          etag: rssRes.headers.get('etag'),
          lastModified: rssRes.headers.get('last-modified'),
          bodyHash,
          lastCheckedAt: nowIso,
          lastChangedAt: changed
            ? nowIso
            : options?.previousCheckpoint?.lastChangedAt ?? nowIso,
          activeCount: rssItems.length,
          lastError: `API fallback to RSS: ${apiError.message}`,
        },
      };
    } catch {
      return {
        items: [],
        error: apiError,
        usedFallback: true,
        checkpoint: {
          source: 'kariyer_kapisi',
          etag: null,
          lastModified: null,
          bodyHash: options?.previousCheckpoint?.bodyHash ?? null,
          lastCheckedAt: nowIso,
          lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
          activeCount: 0,
          lastError: apiError.message,
        },
      };
    }
  }
}

/**
 * Enriches a Kariyer Kapisi announcement by fetching preview metadata and per-position altilan rows.
 */
export async function enrichKariyerKapisiDetail(
  guid: string,
  baseAnnouncement: Announcement,
  fetcher?: typeof fetch,
  options?: { timeoutMs?: number }
): Promise<Announcement> {
  const fetchFn = resolveFetcher(fetcher);
  if (!fetchFn || !guid) {
    return { ...baseAnnouncement, enrichmentStatus: 'partial' };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ ilanGuid: guid });
  const headers = kariyerApiHeaders();

  const [previewOutcome, altilanOutcome] = await Promise.allSettled([
    fetchWithTimeout(
      fetchFn,
      `${KARIYER_API_BASE}/api/ilan/GetIlanPreviewPublic`,
      { method: 'POST', headers, body },
      timeoutMs
    ).then(async (res) => {
      if (!res.ok) throw new Error(`Preview HTTP ${res.status}`);
      return (await res.json()) as KariyerPreviewPayload;
    }),
    fetchWithTimeout(
      fetchFn,
      `${KARIYER_API_BASE}/api/altilan/GetAltIlanInfoByIlanIdPublic`,
      { method: 'POST', headers, body },
      timeoutMs
    ).then(async (res) => {
      if (!res.ok) throw new Error(`Altilan HTTP ${res.status}`);
      return (await res.json()) as KariyerAltilanRow[];
    }),
  ]);

  const preview =
    previewOutcome.status === 'fulfilled' ? previewOutcome.value : null;
  const altilanList =
    altilanOutcome.status === 'fulfilled' && Array.isArray(altilanOutcome.value)
      ? altilanOutcome.value
      : [];

  if (!preview && altilanOutcome.status === 'rejected') {
    return { ...baseAnnouncement, enrichmentStatus: 'partial' };
  }

  const cleanPreviewText = cleanBbCodeAndHtml(
    typeof preview?.ilanMetni === 'string' ? preview.ilanMetni : ''
  );

  const positions: AnnouncementPosition[] = [];
  const allEvaluationSteps: NonNullable<KariyerAltilanRow['degerlemeAsamaList']> = [];
  const combinedPositionTexts: string[] = [];

  for (let altIdx = 0; altIdx < altilanList.length; altIdx++) {
    const alt = altilanList[altIdx];
    const altTitle =
      nonEmptyString(alt.ilanBaslik) ??
      nonEmptyString(alt.unvan) ??
      baseAnnouncement.title;
    const unvan = nonEmptyString(alt.unvan);
    const cleanedAltText = cleanBbCodeAndHtml(
      typeof alt.ilanMetni === 'string' ? alt.ilanMetni : ''
    );
    combinedPositionTexts.push(cleanedAltText);

    const evalSteps = Array.isArray(alt.degerlemeAsamaList) ? alt.degerlemeAsamaList : [];
    allEvaluationSteps.push(...evalSteps);

    const evalParts = evalSteps
      .map((step) => {
        const label = nonEmptyString(step.asamaAdi) ?? nonEmptyString(step.turu);
        if (!label) return null;
        const weight =
          typeof step.agirlik === 'number' && Number.isFinite(step.agirlik)
            ? ` (%${Math.round(step.agirlik)})`
            : '';
        return `${label}${weight}`;
      })
      .filter((v): v is string => Boolean(v));
    const evaluationMethod = evalParts.length > 0 ? evalParts.join(', ') : null;

    const posClass = classifyAnnouncement({
      source: 'kariyer_kapisi',
      institution: baseAnnouncement.institution,
      title: altTitle,
      description: cleanedAltText,
      evaluationSteps: evalSteps.map((s) => ({
        asamaAdi: nonEmptyString(s.asamaAdi),
        turu: nonEmptyString(s.turu),
        sinavsizAsama: typeof s.sinavsizAsama === 'number' ? s.sinavsizAsama : null,
      })),
    });

    const posCriteria = extractCriteriaFromText(cleanedAltText, baseAnnouncement.city);
    const eduLevel =
      extractPrimaryEducationLevel(cleanedAltText) ??
      posCriteria.educationLevels[0] ??
      null;
    const maxAge = extractMaxAgeFromText(cleanedAltText);
    const requirementsSummary = (cleanedAltText || altTitle).slice(0, 320);
    const locations =
      Array.isArray(alt.kontenjanList) && alt.kontenjanList.length > 0
        ? alt.kontenjanList
        : [{ il: null, kontenjan: extractQuota(cleanedAltText) }];

    for (let kIdx = 0; kIdx < locations.length; kIdx++) {
      const loc = locations[kIdx];
      const { city, district } = parseCityAndDistrict(
        typeof loc.il === 'string' ? loc.il : null,
        baseAnnouncement.institution,
        cleanedAltText
      );
      const quota =
        typeof loc.kontenjan === 'number' && Number.isFinite(loc.kontenjan) && loc.kontenjan > 0
          ? loc.kontenjan
          : null;

      positions.push({
        id: `${baseAnnouncement.id}-pos-${altIdx + 1}-${kIdx + 1}`,
        announcementId: baseAnnouncement.id,
        title: altTitle,
        unvan,
        city,
        district,
        quota,
        educationLevel: eduLevel,
        kpssScoreType: posCriteria.kpssScoreTypes[0] ?? null,
        minKpssScore: posCriteria.minKpssScore,
        maxAge,
        militaryRequired: posCriteria.militaryRequired,
        qualificationCodes: posCriteria.qualificationCodes,
        evaluationMethod,
        isInterviewFree: posClass.examType === 'kpss_only',
        requirementsSummary,
      });
    }
  }

  const concretePositionCities = Array.from(
    new Set(
      positions
        .map((p) => p.city)
        .filter((c) => Boolean(c) && c !== 'TÜRKİYE GENELİ')
    )
  );

  const aggregatedCity =
    concretePositionCities.length === 1
      ? concretePositionCities[0]
      : concretePositionCities.length > 1
        ? 'TÜRKİYE GENELİ'
        : baseAnnouncement.city && baseAnnouncement.city !== 'TÜRKİYE GENELİ'
          ? baseAnnouncement.city
          : inferCityFromInstitutionOrText(
              baseAnnouncement.institution,
              `${baseAnnouncement.title} ${cleanPreviewText}`
            );

  const totalPositionQuota = positions.reduce((sum, p) => sum + (p.quota ?? 0), 0);
  const previewQuota =
    typeof preview?.kontenjan === 'number' && preview.kontenjan > 0
      ? preview.kontenjan
      : null;
  const quota =
    totalPositionQuota > 0
      ? totalPositionQuota
      : previewQuota ?? baseAnnouncement.quota;

  const fullAggregateText = [
    baseAnnouncement.title,
    cleanPreviewText,
    ...combinedPositionTexts,
  ]
    .filter(Boolean)
    .join('\n');

  const textCriteria = extractCriteriaFromText(fullAggregateText, aggregatedCity);
  const mergedEducation = Array.from(
    new Set([
      ...baseAnnouncement.criteria.educationLevels,
      ...textCriteria.educationLevels,
      ...positions
        .map((p) => p.educationLevel)
        .filter((e): e is 'lisans' | 'onlisans' | 'ortaogretim' => Boolean(e)),
    ])
  );
  const mergedScoreTypes = Array.from(
    new Set([
      ...baseAnnouncement.criteria.kpssScoreTypes,
      ...textCriteria.kpssScoreTypes,
      ...positions
        .map((p) => p.kpssScoreType)
        .filter((s): s is 'P3' | 'P93' | 'P94' => Boolean(s)),
    ])
  );
  const minScores = [
    baseAnnouncement.criteria.minKpssScore,
    textCriteria.minKpssScore,
    ...positions.map((p) => p.minKpssScore),
  ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const minKpssScore = minScores.length > 0 ? Math.min(...minScores) : null;

  const mergedCodes = Array.from(
    new Set([
      ...baseAnnouncement.criteria.qualificationCodes,
      ...textCriteria.qualificationCodes,
      ...positions.flatMap((p) => p.qualificationCodes),
    ])
  );
  const mergedCities =
    concretePositionCities.length > 0
      ? concretePositionCities
      : aggregatedCity
        ? [aggregatedCity]
        : ['TÜRKİYE GENELİ'];

  const classification = classifyAnnouncement({
    source: 'kariyer_kapisi',
    institution: nonEmptyString(preview?.kurumAdi) ?? baseAnnouncement.institution,
    title: nonEmptyString(preview?.ilanBaslik) ?? baseAnnouncement.title,
    rawType: nonEmptyString(preview?.ilanTuru),
    description: fullAggregateText,
    evaluationSteps: allEvaluationSteps.map((s) => ({
      asamaAdi: nonEmptyString(s.asamaAdi),
      turu: nonEmptyString(s.turu),
      sinavsizAsama: typeof s.sinavsizAsama === 'number' ? s.sinavsizAsama : null,
    })),
  });

  const applyUrl =
    nonEmptyString(preview?.basvuruLinki) ??
    nonEmptyString(preview?.eDevletServisURL) ??
    baseAnnouncement.applyUrl ??
    null;

  const organizationUnit =
    nonEmptyString(preview?.birimAdi) ?? baseAnnouncement.organizationUnit ?? null;

  const enrichmentStatus: EnrichmentStatus =
    preview && altilanOutcome.status === 'fulfilled' ? 'enriched' : 'partial';

  const summary = cleanPreviewText
    ? cleanPreviewText.slice(0, 320)
    : baseAnnouncement.summary;

  return {
    ...baseAnnouncement,
    city: aggregatedCity,
    quota,
    summary,
    category: classification.category,
    employmentType: classification.employmentType,
    noticeType: classification.noticeType,
    examType: classification.examType,
    organizationUnit,
    applyUrl,
    enrichmentStatus,
    positions,
    positionsCount: positions.length,
    criteria: {
      educationLevels: mergedEducation,
      kpssScoreTypes: mergedScoreTypes,
      minKpssScore,
      cities: mergedCities,
      militaryRequired:
        baseAnnouncement.criteria.militaryRequired ||
        textCriteria.militaryRequired ||
        positions.some((p) => p.militaryRequired),
      driverLicenses: Array.from(
        new Set([...baseAnnouncement.criteria.driverLicenses, ...textCriteria.driverLicenses])
      ),
      certificates: Array.from(
        new Set([...baseAnnouncement.criteria.certificates, ...textCriteria.certificates])
      ),
      qualificationCodes: mergedCodes,
      summaryLines:
        textCriteria.summaryLines.length > 0
          ? textCriteria.summaryLines
          : baseAnnouncement.criteria.summaryLines,
    },
    contentHash: computeContentHash({
      externalId: baseAnnouncement.externalId,
      quota,
      applyUrl,
      positionsCount: positions.length,
      summary,
    }),
  };
}

function extractTagContent(block: string, className: string): string | null {
  const regex = new RegExp(
    `<([a-z0-9]+)[^>]*class\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i'
  );
  const match = block.match(regex);
  return match ? match[2] : null;
}

/**
 * Parses SBB Kamu Ilan (`kamuilan.sbb.gov.tr`) timeline `#nav2` and `#manset` slider HTML.
 */
export function parseSbbKamuIlanHtml(
  html: string,
  referenceDate?: string
): Announcement[] {
  if (!html || typeof html !== 'string') return [];

  const refDate = getTodayIso(referenceDate);
  const fallbackYear = getReferenceYear(referenceDate);

  const nav2Match = html.match(/<ul\b[^>]*id\s*=\s*["']nav2["'][^>]*>[\s\S]*?<\/ul>/i);
  const mansetMatch = html.match(/<[^>]*id\s*=\s*["']manset["'][^>]*>[\s\S]*?<\/ul>/i);
  const sections = [nav2Match?.[0] ?? '', mansetMatch?.[0] ?? ''].filter(Boolean);
  const scopeHtml = sections.length > 0 ? sections.join('\n') : html;

  const anchorRegex =
    /<a\b([^>]*href\s*=\s*["']([^"']*ilanDetay\.aspx\?kod=[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  const results: Announcement[] = [];
  const seenKeys = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(scopeHtml)) !== null) {
    const rawHref = decodeHtmlEntities(match[2]).trim();
    const innerHtml = match[3];

    const kodMatch = rawHref.match(/[?&]kod=([^&#]+)/i);
    const dedupeKey = kodMatch ? decodeURIComponent(kodMatch[1]) : rawHref;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const institutionRaw =
      extractTagContent(innerHtml, 'alt_p1') ?? extractTagContent(innerHtml, 'black');
    const institution = institutionRaw ? stripTags(institutionRaw) : '';

    const rawP2 = extractTagContent(innerHtml, 'alt_p2');
    const rawTitleHtml = rawP2
      ? rawP2.replace(/<em\b[^>]*>[\s\S]*?<\/em>/gi, ' ')
      : extractTagContent(innerHtml, 'patrol');
    const title = rawTitleHtml ? stripTags(rawTitleHtml) : '';
    if (!institution || !title) continue;

    const emMatch = rawP2?.match(/<em\b[^>]*>([\s\S]*?)<\/em>/i);
    const h5DateRaw = extractTagContent(innerHtml, 'h5date');
    const dateRangeRaw = stripTags(emMatch?.[1] ?? h5DateRaw ?? '');

    const imgDateHint = innerHtml.match(/#(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const hintYear = imgDateHint ? Number(imgDateHint[3]) : fallbackYear;
    const hintDate = imgDateHint
      ? `${imgDateHint[3]}-${imgDateHint[2].padStart(2, '0')}-${imgDateHint[1].padStart(2, '0')}`
      : null;

    const range = parseTurkishDateRange(dateRangeRaw, hintYear);
    const publishedAt = range.startDate ?? hintDate ?? refDate;
    const deadlineAt = range.endDate ?? publishedAt;

    const sourceUrl = resolveUrl(rawHref, SBB_URL);
    const city = inferCityFromInstitutionOrText(institution, title);
    const classification = classifyAnnouncement({
      source: 'sbb',
      institution,
      title,
    });
    const quota = extractQuota(title);
    const criteria = extractCriteriaFromText(`${institution} ${title}`, city);

    const slugHash = computeContentHash(dedupeKey);
    const externalId = `SBB-${slugHash}`;
    const id = `sbb-${slugHash}`.toLowerCase();

    results.push({
      id,
      externalId,
      source: 'sbb',
      sourceName: OFFICIAL_SOURCE_URLS.sbb.name,
      sourceUrl,
      institution,
      title,
      category: classification.category,
      city,
      status: computeStatus(deadlineAt, refDate),
      publishedAt,
      deadlineAt,
      quota,
      summary: `${institution} - ${title}${dateRangeRaw ? ` (${dateRangeRaw})` : ''}`.slice(0, 220),
      criteria,
      employmentType: classification.employmentType,
      noticeType: classification.noticeType,
      examType: classification.examType,
      verifiedSources: [
        {
          source: 'sbb',
          sourceName: OFFICIAL_SOURCE_URLS.sbb.name,
          url: sourceUrl,
        },
      ],
      enrichmentStatus: 'enriched',
      contentHash: computeContentHash({ externalId, institution, title, deadlineAt, city }),
      isDemo: false,
    });
  }

  return results;
}

async function fetchSbbKamuIlan(
  fetcher?: typeof fetch,
  options?: {
    timeoutMs?: number;
    referenceDate?: string;
    previousCheckpoint?: SourceCheckpoint | null;
  }
): Promise<ConnectorFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const refDate = getTodayIso(options?.referenceDate);
  const nowIso = new Date().toISOString();
  const fetchFn = resolveFetcher(fetcher);

  if (!fetchFn) {
    const error: FetchErrorItem = {
      source: 'sbb',
      sourceName: OFFICIAL_SOURCE_URLS.sbb.name,
      url: SBB_URL,
      message: 'Fetch istemcisi kullanılabilir değil.',
    };
    return {
      items: [],
      error,
      checkpoint: {
        source: 'sbb',
        etag: null,
        lastModified: null,
        bodyHash: null,
        lastCheckedAt: nowIso,
        lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
        activeCount: 0,
        lastError: error.message,
      },
    };
  }

  try {
    const res = await fetchWithTimeout(
      fetchFn,
      SBB_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html, application/xhtml+xml;q=0.9',
          'User-Agent': USER_AGENT,
        },
      },
      timeoutMs
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} yanıtı alındı.`);
    }
    const html = await res.text();
    const items = parseSbbKamuIlanHtml(html, refDate).map((item) => ({
      ...item,
      lastSeenAt: nowIso,
    }));
    const bodyHash = computeContentHash(html);
    const changed = options?.previousCheckpoint?.bodyHash !== bodyHash;
    return {
      items,
      error: null,
      checkpoint: {
        source: 'sbb',
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        bodyHash,
        lastCheckedAt: nowIso,
        lastChangedAt: changed
          ? nowIso
          : options?.previousCheckpoint?.lastChangedAt ?? nowIso,
        activeCount: items.length,
        lastError: null,
      },
    };
  } catch (err) {
    const error = buildErrorItem('sbb', SBB_URL, err, timeoutMs);
    return {
      items: [],
      error,
      checkpoint: {
        source: 'sbb',
        etag: null,
        lastModified: null,
        bodyHash: options?.previousCheckpoint?.bodyHash ?? null,
        lastCheckedAt: nowIso,
        lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
        activeCount: 0,
        lastError: error.message,
      },
    };
  }
}

export interface IskurActiveCity {
  cityId: string;
  cityName: string;
  count: number;
}

/**
 * Extracts active provinces (`data-count > 0`) from ISKUR's Kamu Memur Alim map page.
 */
export function parseIskurCityMapHtml(html: string): IskurActiveCity[] {
  if (!html || typeof html !== 'string') return [];

  const cities: IskurActiveCity[] = [];
  const seenIds = new Set<string>();
  const tagRegex = /<[a-z0-9]+\b[^>]*data-plakakodu\s*=[^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const openTag = match[0];
    const cityId = extractAttr(openTag, 'data-plakakodu');
    const cityName = extractAttr(openTag, 'data-iladi');
    const countRaw = extractAttr(openTag, 'data-count');
    const count = countRaw ? Number(countRaw) : 0;

    if (!cityId || !cityName || !Number.isFinite(count) || count <= 0) continue;
    if (seenIds.has(cityId)) continue;
    seenIds.add(cityId);

    cities.push({ cityId, cityName, count });
  }

  return cities;
}

function splitIskurInstitutionAndTitle(rawTitle: string): {
  institution: string;
  title: string;
} {
  const withoutTrailingDate = rawTitle
    .replace(/\s+\d{1,2}\.\d{1,2}\.\d{4}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const instRegex =
    /^(.+?\b(?:Bakanlığı|Başkanlığı|Komutanlığı|Belediyesi|Üniversitesi|Rektörlüğü|Genel Müdürlüğü|İl Özel İdaresi|Özel İdaresi|Valiliği|Kaymakamlığı|Kurumu|Enstitüsü|Müdürlüğü|Hastanesi|Ajansı|Merkezi|Odası))\s+(.+)$/i;
  const match = withoutTrailingDate.match(instRegex);
  if (match && match[1] && match[2] && match[2].length >= 4) {
    return {
      institution: match[1].trim(),
      title: match[2].trim(),
    };
  }

  return {
    institution: 'İŞKUR Kamu İlanları',
    title: withoutTrailingDate || rawTitle.trim(),
  };
}

/**
 * Parses `<tr class="clickable-row" data-file-url="/medya/...pdf">` rows from an ISKUR city table.
 */
export function parseIskurCityTableHtml(
  html: string,
  cityName: string,
  referenceDate?: string
): Announcement[] {
  if (!html || typeof html !== 'string') return [];

  const refDate = getTodayIso(referenceDate);
  const canonicalCity = toTurkishUpper(cityName) || 'TÜRKİYE GENELİ';
  const rowRegex =
    /<tr\b[^>]*class\s*=\s*["'][^"']*\bclickable-row\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi;

  const results: Announcement[] = [];
  const seenIds = new Set<string>();

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[0];
    const openTagMatch = rowHtml.match(/^<tr\b[^>]*>/i);
    const openTag = openTagMatch?.[0] ?? '';

    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((c) =>
      stripTags(c[1])
    );
    if (cells.length < 2) continue;

    const dateMatch = cells[0].match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const deadlineAt = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`
      : refDate;

    const rawTitle = cells[1].trim();
    if (!rawTitle || rawTitle.length < 4) continue;

    const anchorMatch = rowHtml.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i);
    const fileUrlRaw =
      extractAttr(openTag, 'data-file-url') ??
      (anchorMatch ? decodeHtmlEntities(anchorMatch[1]).trim() : null);
    const sourceUrl = resolveUrl(fileUrlRaw, 'https://www.iskur.gov.tr/');

    const { institution, title } = splitIskurInstitutionAndTitle(rawTitle);
    const classification = classifyAnnouncement({
      source: 'iskur',
      institution,
      title,
    });
    const criteria = extractCriteriaFromText(`${institution} ${title}`, canonicalCity);
    const quota = extractQuota(title);

    const hashSlug = computeContentHash(`${sourceUrl}|${rawTitle}|${deadlineAt}`);
    const externalId = `ISKUR-${hashSlug}`;
    const id = `iskur-${hashSlug}`.toLowerCase();
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    results.push({
      id,
      externalId,
      source: 'iskur',
      sourceName: OFFICIAL_SOURCE_URLS.iskur.name,
      sourceUrl,
      institution,
      title,
      category: classification.category,
      city: canonicalCity,
      status: computeStatus(deadlineAt, refDate),
      publishedAt: refDate,
      deadlineAt,
      quota,
      summary: `${institution} - ${title} (Son başvuru: ${deadlineAt})`.slice(0, 220),
      criteria,
      employmentType: classification.employmentType,
      noticeType: classification.noticeType,
      examType: classification.examType,
      verifiedSources: [
        {
          source: 'iskur',
          sourceName: OFFICIAL_SOURCE_URLS.iskur.name,
          url: sourceUrl,
        },
      ],
      enrichmentStatus: 'enriched',
      contentHash: computeContentHash({ externalId, institution, title, deadlineAt, canonicalCity }),
      isDemo: false,
    });
  }

  return results;
}

export interface IskurFetchResult extends ConnectorFetchResult {
  errors: FetchErrorItem[];
  activeCitiesCount: number;
}

/**
 * Fetches official public memur/iscilik PDF recruitment notices from ISKUR's dedicated
 * Kamu Memur Alim Ilanlari endpoint with bounded concurrency and subrequest budget control.
 */
export async function fetchIskurKamuMemur(
  fetcher?: typeof fetch,
  options?: {
    timeoutMs?: number;
    referenceDate?: string;
    maxCities?: number;
    concurrency?: number;
    previousCheckpoint?: SourceCheckpoint | null;
  }
): Promise<IskurFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const refDate = getTodayIso(options?.referenceDate);
  const nowIso = new Date().toISOString();
  const maxCities = options?.maxCities ?? 30;
  const concurrency = Math.max(1, options?.concurrency ?? 6);
  const fetchFn = resolveFetcher(fetcher);

  if (!fetchFn) {
    const error: FetchErrorItem = {
      source: 'iskur',
      sourceName: OFFICIAL_SOURCE_URLS.iskur.name,
      url: ISKUR_MEMUR_URL,
      message: 'Fetch istemcisi kullanılabilir değil.',
    };
    return {
      items: [],
      error,
      errors: [error],
      activeCitiesCount: 0,
      checkpoint: {
        source: 'iskur',
        etag: null,
        lastModified: null,
        bodyHash: null,
        lastCheckedAt: nowIso,
        lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
        activeCount: 0,
        lastError: error.message,
      },
    };
  }

  try {
    const mapRes = await fetchWithTimeout(
      fetchFn,
      ISKUR_MEMUR_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html, application/xhtml+xml;q=0.9',
          'User-Agent': USER_AGENT,
        },
      },
      timeoutMs
    );
    if (!mapRes.ok) {
      throw new Error(`HTTP ${mapRes.status} yanıtı alındı.`);
    }

    const mapHtml = await mapRes.text();
    const activeCities = parseIskurCityMapHtml(mapHtml);
    const targetCities = activeCities.slice(0, maxCities);

    const items: Announcement[] = [];
    const seenIds = new Set<string>();
    const cityErrors: FetchErrorItem[] = [];

    for (let i = 0; i < targetCities.length; i += concurrency) {
      const batch = targetCities.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (cityInfo) => {
          const cityUrl = `${ISKUR_MEMUR_URL}?idId=${encodeURIComponent(cityInfo.cityId)}&il=${encodeURIComponent(cityInfo.cityName)}`;
          try {
            const res = await fetchWithTimeout(
              fetchFn,
              cityUrl,
              {
                method: 'GET',
                headers: {
                  Accept: 'text/html, application/xhtml+xml;q=0.9',
                  'User-Agent': USER_AGENT,
                },
              },
              timeoutMs
            );
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
            const tableHtml = await res.text();
            const parsed = parseIskurCityTableHtml(tableHtml, cityInfo.cityName, refDate);
            for (const item of parsed) {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                items.push({ ...item, lastSeenAt: nowIso });
              }
            }
          } catch (cityErr) {
            cityErrors.push(buildErrorItem('iskur', cityUrl, cityErr, timeoutMs));
          }
        })
      );
    }

    const bodyHash = computeContentHash(
      items.map((it) => `${it.id}:${it.deadlineAt}`).sort().join('|') || mapHtml
    );
    const changed = options?.previousCheckpoint?.bodyHash !== bodyHash;

    return {
      items,
      error: cityErrors[0] ?? null,
      errors: cityErrors,
      activeCitiesCount: activeCities.length,
      checkpoint: {
        source: 'iskur',
        etag: mapRes.headers.get('etag'),
        lastModified: mapRes.headers.get('last-modified'),
        bodyHash,
        lastCheckedAt: nowIso,
        lastChangedAt: changed
          ? nowIso
          : options?.previousCheckpoint?.lastChangedAt ?? nowIso,
        activeCount: items.length,
        lastError: cityErrors[0]?.message ?? null,
      },
    };
  } catch (err) {
    const error = buildErrorItem('iskur', ISKUR_MEMUR_URL, err, timeoutMs);
    return {
      items: [],
      error,
      errors: [error],
      activeCitiesCount: 0,
      checkpoint: {
        source: 'iskur',
        etag: null,
        lastModified: null,
        bodyHash: options?.previousCheckpoint?.bodyHash ?? null,
        lastCheckedAt: nowIso,
        lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
        activeCount: 0,
        lastError: error.message,
      },
    };
  }
}

async function fetchResmiGazeteRecruitment(
  fetcher?: typeof fetch,
  options?: {
    timeoutMs?: number;
    referenceDate?: string;
    previousCheckpoint?: SourceCheckpoint | null;
  }
): Promise<ConnectorFetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const refDate = getTodayIso(options?.referenceDate);
  const nowIso = new Date().toISOString();
  const rgUrl = OFFICIAL_SOURCE_URLS.resmi_gazete.url;
  const fetchFn = resolveFetcher(fetcher);

  if (!fetchFn) {
    const error: FetchErrorItem = {
      source: 'resmi_gazete',
      sourceName: OFFICIAL_SOURCE_URLS.resmi_gazete.name,
      url: rgUrl,
      message: 'Fetch istemcisi kullanılabilir değil.',
    };
    return {
      items: [],
      error,
      checkpoint: {
        source: 'resmi_gazete',
        etag: null,
        lastModified: null,
        bodyHash: null,
        lastCheckedAt: nowIso,
        lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
        activeCount: 0,
        lastError: error.message,
      },
    };
  }

  try {
    const res = await fetchWithTimeout(
      fetchFn,
      rgUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html, application/xhtml+xml;q=0.9',
          'User-Agent': USER_AGENT,
        },
      },
      timeoutMs
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} yanıtı alındı.`);
    }
    const html = await res.text();
    const rawItems = parseResmiGazeteHtml(html, refDate);
    const items = rawItems
      .filter((item) => isPublicRecruitmentResmiGazeteItem(item.title, item.summary))
      .map((item) =>
        finalizeConnectorAnnouncement(
          {
            ...item,
            enrichmentStatus: 'enriched',
            lastSeenAt: nowIso,
          },
          null,
          item.summary
        )
      );
    const bodyHash = computeContentHash(html);
    const changed = options?.previousCheckpoint?.bodyHash !== bodyHash;
    return {
      items,
      error: null,
      checkpoint: {
        source: 'resmi_gazete',
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        bodyHash,
        lastCheckedAt: nowIso,
        lastChangedAt: changed
          ? nowIso
          : options?.previousCheckpoint?.lastChangedAt ?? nowIso,
        activeCount: items.length,
        lastError: null,
      },
    };
  } catch (err) {
    const error = buildErrorItem('resmi_gazete', rgUrl, err, timeoutMs);
    return {
      items: [],
      error,
      checkpoint: {
        source: 'resmi_gazete',
        etag: null,
        lastModified: null,
        bodyHash: options?.previousCheckpoint?.bodyHash ?? null,
        lastCheckedAt: nowIso,
        lastChangedAt: options?.previousCheckpoint?.lastChangedAt ?? null,
        activeCount: 0,
        lastError: error.message,
      },
    };
  }
}

export interface FetchAllOfficialV2Options {
  timeoutMs?: number;
  referenceDate?: string;
  checkpoints?: Record<string, SourceCheckpoint | undefined>;
  maxIskurCities?: number;
  includeResmiGazete?: boolean;
}

export interface FetchAllOfficialV2Result {
  items: Announcement[];
  errors: FetchErrorItem[];
  sourceCheckpoints: SourceCheckpoint[];
  rawCount: number;
  dedupedCount: number;
}

/**
 * Fetches all Phase 7 official sources (Kariyer Kapisi API, SBB Kamu Ilan, ISKUR Kamu Memur,
 * and positively-filtered Resmi Gazete), computes source checkpoints, and deduplicates across sources.
 */
export async function fetchAllOfficialSourcesV2(
  fetcher?: typeof fetch,
  options?: FetchAllOfficialV2Options
): Promise<FetchAllOfficialV2Result> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const referenceDate = options?.referenceDate;
  const checkpoints = options?.checkpoints ?? {};
  const includeResmiGazete = options?.includeResmiGazete ?? true;

  const [kkRes, sbbRes, iskurRes, rgRes] = await Promise.all([
    fetchKariyerKapisiApi(fetcher, {
      timeoutMs,
      referenceDate,
      previousCheckpoint: checkpoints.kariyer_kapisi ?? null,
    }),
    fetchSbbKamuIlan(fetcher, {
      timeoutMs,
      referenceDate,
      previousCheckpoint: checkpoints.sbb ?? null,
    }),
    fetchIskurKamuMemur(fetcher, {
      timeoutMs,
      referenceDate,
      maxCities: options?.maxIskurCities,
      previousCheckpoint: checkpoints.iskur ?? null,
    }),
    includeResmiGazete
      ? fetchResmiGazeteRecruitment(fetcher, {
          timeoutMs,
          referenceDate,
          previousCheckpoint: checkpoints.resmi_gazete ?? null,
        })
      : Promise.resolve(null),
  ]);

  const rawItems: Announcement[] = [
    ...kkRes.items,
    ...sbbRes.items,
    ...iskurRes.items,
    ...(rgRes?.items ?? []),
  ];

  const errors: FetchErrorItem[] = [
    ...(kkRes.error ? [kkRes.error] : []),
    ...(sbbRes.error ? [sbbRes.error] : []),
    ...iskurRes.errors,
    ...(rgRes?.error ? [rgRes.error] : []),
  ];

  const sourceCheckpoints: SourceCheckpoint[] = [
    kkRes.checkpoint,
    sbbRes.checkpoint,
    iskurRes.checkpoint,
    ...(rgRes ? [rgRes.checkpoint] : []),
  ];

  const items = mergeCrossSourceAnnouncements(rawItems);

  return {
    items,
    errors,
    sourceCheckpoints,
    rawCount: rawItems.length,
    dedupedCount: items.length,
  };
}
