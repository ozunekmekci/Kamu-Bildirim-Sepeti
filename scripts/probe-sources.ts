import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enrichKariyerKapisiDetail,
  fetchAllOfficialSourcesV2,
  parseSbbKamuIlanHtml,
} from '../src/modules/announcements/connectors';
import {
  OFFICIAL_SOURCE_URLS,
  parseIskurHtml,
  parseKariyerKapisiHtml,
  parseResmiGazeteHtml,
} from '../src/modules/announcements/parsers';
import type { Announcement, AnnouncementSource } from '../src/modules/announcements/types';

export type OfficialLiveSource = Exclude<AnnouncementSource, 'osym_kpss'>;

export interface ProbeSample {
  title: string;
  url: string;
}

export interface ProbeSourceResult {
  source: OfficialLiveSource;
  sourceName: string;
  url: string;
  mode: 'live' | 'offline';
  status: number | null;
  contentType: string | null;
  byteLength: number;
  parsedCount: number;
  samples: ProbeSample[];
  error: string | null;
}

export interface ProbeV2Metrics {
  rawCount: number;
  dedupedCount: number;
  cityFillRatePct: number;
  categoryCounts: Record<string, number>;
  employmentTypeCounts: Record<string, number>;
  sampleEnriched?: {
    id: string;
    title: string;
    positionsCount: number;
    examType: string | undefined;
    applyUrl: string | null | undefined;
    enrichmentStatus: string | undefined;
  } | null;
}

export interface ProbeSummary {
  app: string;
  mode: 'live' | 'offline';
  strict: boolean;
  checkedAt: string;
  totalParsed: number;
  hasFailures: boolean;
  sources: ProbeSourceResult[];
  v2Metrics?: ProbeV2Metrics;
}

export interface ProbeCliFlags {
  offline: boolean;
  strict: boolean;
  json: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = 'KamuBildirimSepeti/1.0 (+https://kamubildirimsepeti.example)';

const OFFLINE_SOURCES: OfficialLiveSource[] = [
  'kariyer_kapisi',
  'iskur',
  'resmi_gazete',
];

const ALL_LIVE_SOURCES: OfficialLiveSource[] = [
  'kariyer_kapisi',
  'sbb',
  'iskur',
  'resmi_gazete',
];

const SOURCE_PARSERS: Record<
  OfficialLiveSource,
  (html: string, referenceDate?: string) => Announcement[]
> = {
  kariyer_kapisi: parseKariyerKapisiHtml,
  sbb: parseSbbKamuIlanHtml,
  iskur: parseIskurHtml,
  resmi_gazete: parseResmiGazeteHtml,
};

const OFFLINE_SANITY_FIXTURES: Record<OfficialLiveSource, string> = {
  kariyer_kapisi: `
    <article data-id="KK-OFFLINE-1" data-city="ANKARA" data-deadline="2026-12-30">
      <span class="institution">T.C. Hazine ve Maliye Bakanlığı</span>
      <a href="/ilan/kk-offline-1">Sözleşmeli Bilişim Personeli Alımı</a>
      <p class="summary">KPSS P3 en az 70 puan. Lisans mezunları başvurabilir.</p>
    </article>
  `,
  sbb: `
    <ul id="nav2" class="cbp_tmtimeline">
      <li>
        <div class="cbp_tmlabel">
          <a href="ilanDetay.aspx?kod=SBB-OFFLINE-1">
            <div>
              <img src="./ilan_dosyalar/logolar/425.png#26.11.2026 00:00:00" />
              <p class="alt_p1">BOĞAZİÇİ ÜNİVERSİTESİ</p>
              <p class="alt_p2">4 ÖĞRETİM ELEMANI ALACAK<em> ( 26 Kasım - 10 Aralık) </em></p>
            </div>
          </a>
        </div>
      </li>
    </ul>
  `,
  iskur: `
    <table>
      <tr><th>Kurum</th><th>Pozisyon</th><th>Detay</th></tr>
      <tr data-id="ISK-OFFLINE-1" data-city="İSTANBUL" data-deadline="2026-12-28">
        <td>Devlet Su İşleri Genel Müdürlüğü</td>
        <td><a href="/duyuru/isk-offline-1">Elektrik Teknisyeni İşçi Alımı</a></td>
        <td>Ortaöğretim mezunu, 10 kişi alınacaktır.</td>
      </tr>
    </table>
  `,
  resmi_gazete: `
    <div class="fihrist-item" data-id="RG-OFFLINE-1" data-deadline="2026-12-25">
      <a href="/ilanlar/2026/11/20261126-4-1.pdf">
        T.C. Adalet Bakanlığı - Sözleşmeli Personel Alım İlanı
      </a>
      <span class="summary">Lisans mezunu, KPSS P3 en az 70 puan.</span>
    </div>
  `,
};

export function parseCliFlags(argv: string[]): ProbeCliFlags {
  return {
    offline: argv.includes('--offline'),
    strict: argv.includes('--strict'),
    json: argv.includes('--json'),
  };
}

function decodeBody(buffer: ArrayBuffer, contentType: string | null): string {
  const charsetMatch = contentType?.match(/charset\s*=\s*["']?([a-z0-9._-]+)["']?/i);
  const charset = charsetMatch?.[1]?.toLowerCase() ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export async function probeSingleSource(
  source: OfficialLiveSource,
  options?: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    offline?: boolean;
    referenceDate?: string;
  }
): Promise<ProbeSourceResult> {
  const meta = OFFICIAL_SOURCE_URLS[source];
  const parser = SOURCE_PARSERS[source];
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (options?.offline) {
    const html = OFFLINE_SANITY_FIXTURES[source];
    const items = parser(html, options?.referenceDate);
    return {
      source,
      sourceName: meta.name,
      url: meta.url,
      mode: 'offline',
      status: null,
      contentType: 'text/html; charset=utf-8 (offline sanity fixture)',
      byteLength: Buffer.byteLength(html, 'utf8'),
      parsedCount: items.length,
      samples: items.slice(0, 3).map((item) => ({
        title: item.title,
        url: item.sourceUrl,
      })),
      error: items.length === 0 ? 'Offline sanity fixture produced 0 announcements.' : null,
    };
  }

  const fetchFn =
    options?.fetcher ??
    (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

  if (!fetchFn) {
    return {
      source,
      sourceName: meta.name,
      url: meta.url,
      mode: 'live',
      status: null,
      contentType: null,
      byteLength: 0,
      parsedCount: 0,
      samples: [],
      error: 'Global fetch is unavailable in this runtime.',
    };
  }

  const targetUrl = (meta as { feedUrl?: string }).feedUrl ?? meta.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, text/html, application/xhtml+xml;q=0.9, */*;q=0.8',
        'User-Agent': USER_AGENT,
      },
    });

    const contentType = res.headers.get('content-type');
    const rawBuffer = await res.arrayBuffer();
    const byteLength = rawBuffer.byteLength;

    if (!res.ok) {
      return {
        source,
        sourceName: meta.name,
        url: targetUrl,
        mode: 'live',
        status: res.status,
        contentType,
        byteLength,
        parsedCount: 0,
        samples: [],
        error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
      };
    }

    const html = decodeBody(rawBuffer, contentType);
    const items = parser(html, options?.referenceDate);

    return {
      source,
      sourceName: meta.name,
      url: targetUrl,
      mode: 'live',
      status: res.status,
      contentType,
      byteLength,
      parsedCount: items.length,
      samples: items.slice(0, 3).map((item) => ({
        title: item.title,
        url: item.sourceUrl,
      })),
      error: null,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
    const message = isTimeout
      ? `Request timed out after ${timeoutMs} ms`
      : err instanceof Error
        ? err.message
        : 'Unknown network error';

    return {
      source,
      sourceName: meta.name,
      url: targetUrl,
      mode: 'live',
      status: null,
      contentType: null,
      byteLength: 0,
      parsedCount: 0,
      samples: [],
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runProbe(options?: {
  offline?: boolean;
  strict?: boolean;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  referenceDate?: string;
}): Promise<ProbeSummary> {
  if (options?.offline) {
    const results = await Promise.all(
      OFFLINE_SOURCES.map((source) =>
        probeSingleSource(source, {
          offline: true,
          fetcher: options?.fetcher,
          timeoutMs: options?.timeoutMs,
          referenceDate: options?.referenceDate,
        })
      )
    );

    const totalParsed = results.reduce((sum, item) => sum + item.parsedCount, 0);
    const hasFailures = results.some((item) => item.error !== null || item.parsedCount === 0);

    return {
      app: 'Kamu Bildirim Sepeti',
      mode: 'offline',
      strict: Boolean(options?.strict),
      checkedAt: new Date().toISOString(),
      totalParsed,
      hasFailures,
      sources: results,
    };
  }

  const v2 = await fetchAllOfficialSourcesV2(options?.fetcher, {
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    referenceDate: options?.referenceDate,
    maxIskurCities: 25,
    includeResmiGazete: true,
  });

  const liveUrls: Record<OfficialLiveSource, string> = {
    kariyer_kapisi: 'https://api.kariyerkapisi.gov.tr/api/ilan/GetIseAlimPage',
    sbb: 'https://kamuilan.sbb.gov.tr/',
    iskur: 'https://www.iskur.gov.tr/ilanlar/kamu-memur-alim-ilanlari/',
    resmi_gazete: 'https://www.resmigazete.gov.tr/',
  };

  const checkpointBySource = new Map(v2.sourceCheckpoints.map((cp) => [cp.source, cp]));
  const errorBySource = new Map<OfficialLiveSource, string>();
  for (const err of v2.errors) {
    if (err.source !== 'osym_kpss' && !errorBySource.has(err.source)) {
      errorBySource.set(err.source, err.message);
    }
  }

  const itemsBySource = new Map<OfficialLiveSource, Announcement[]>();
  const seenPerSource = new Map<OfficialLiveSource, Set<string>>();
  for (const src of ALL_LIVE_SOURCES) {
    itemsBySource.set(src, []);
    seenPerSource.set(src, new Set<string>());
  }
  for (const item of v2.items) {
    const refs = item.verifiedSources?.length
      ? item.verifiedSources.map((r) => r.source)
      : [item.source];
    for (const refSrc of refs) {
      if (refSrc !== 'osym_kpss') {
        const seen = seenPerSource.get(refSrc);
        if (seen && !seen.has(item.id)) {
          seen.add(item.id);
          itemsBySource.get(refSrc)?.push(item);
        }
      }
    }
  }

  const results: ProbeSourceResult[] = ALL_LIVE_SOURCES.map((source) => {
    const cp = checkpointBySource.get(source);
    const srcItems = itemsBySource.get(source) ?? [];
    const errMsg = cp?.lastError ?? errorBySource.get(source) ?? null;
    const count = cp?.activeCount ?? srcItems.length;
    return {
      source,
      sourceName: OFFICIAL_SOURCE_URLS[source].name,
      url: liveUrls[source],
      mode: 'live',
      status: errMsg ? null : 200,
      contentType: source === 'kariyer_kapisi' ? 'application/json' : 'text/html',
      byteLength: 0,
      parsedCount: count,
      samples: srcItems.slice(0, 3).map((item) => ({
        title: `${item.institution} - ${item.title} [${item.city}]`,
        url: item.verifiedSources?.find((r) => r.source === source)?.url ?? item.sourceUrl,
      })),
      error: errMsg,
    };
  });

  const kkFirst = v2.items.find((item) => item.source === 'kariyer_kapisi');
  let sampleEnriched: ProbeV2Metrics['sampleEnriched'] = null;
  if (kkFirst) {
    const guid = kkFirst.externalId.replace(/^KARIYER_KAPISI-/, '');
    const enriched = await enrichKariyerKapisiDetail(guid, kkFirst, options?.fetcher, {
      timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    sampleEnriched = {
      id: enriched.id,
      title: enriched.title,
      positionsCount: enriched.positionsCount ?? enriched.positions?.length ?? 0,
      examType: enriched.examType,
      applyUrl: enriched.applyUrl,
      enrichmentStatus: enriched.enrichmentStatus,
    };
  }

  const concreteCityCount = v2.items.filter(
    (item) => item.city && item.city !== 'TÜRKİYE GENELİ'
  ).length;
  const cityFillRatePct =
    v2.items.length > 0 ? Math.round((concreteCityCount / v2.items.length) * 100) : 0;

  const categoryCounts: Record<string, number> = {};
  const employmentTypeCounts: Record<string, number> = {};
  for (const item of v2.items) {
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
    const emp = item.employmentType ?? 'diger';
    employmentTypeCounts[emp] = (employmentTypeCounts[emp] ?? 0) + 1;
  }

  const totalParsed = v2.dedupedCount;
  const hasFailures = results.some((item) => item.error !== null);

  return {
    app: 'Kamu Bildirim Sepeti',
    mode: 'live',
    strict: Boolean(options?.strict),
    checkedAt: new Date().toISOString(),
    totalParsed,
    hasFailures,
    sources: results,
    v2Metrics: {
      rawCount: v2.rawCount,
      dedupedCount: v2.dedupedCount,
      cityFillRatePct,
      categoryCounts,
      employmentTypeCounts,
      sampleEnriched,
    },
  };
}

function formatTextReport(summary: ProbeSummary): string {
  const lines: string[] = [
    `Kamu Bildirim Sepeti - Official Source Probe (${summary.mode})`,
    `Checked at: ${summary.checkedAt}`,
    `Total parsed announcements: ${summary.totalParsed}`,
    '',
  ];

  if (summary.v2Metrics) {
    const m = summary.v2Metrics;
    lines.push(
      `V2 Pipeline: raw=${m.rawCount}, deduped=${m.dedupedCount}, cityFillRate=${m.cityFillRatePct}%`
    );
    lines.push(`Categories: ${JSON.stringify(m.categoryCounts)}`);
    lines.push(`EmploymentTypes: ${JSON.stringify(m.employmentTypeCounts)}`);
    if (m.sampleEnriched) {
      lines.push(
        `Sample Enriched KK: ${m.sampleEnriched.title} | positions=${m.sampleEnriched.positionsCount} | examType=${m.sampleEnriched.examType} | status=${m.sampleEnriched.enrichmentStatus}`
      );
    }
    lines.push('');
  }

  for (const item of summary.sources) {
    const statusLabel = item.status !== null ? `HTTP ${item.status}` : item.error ? 'ERROR' : 'OFFLINE';
    lines.push(`[${item.sourceName}] (${item.source})`);
    lines.push(`  URL: ${item.url}`);
    lines.push(`  Status: ${statusLabel}${item.error ? ` (${item.error})` : ''}`);
    lines.push(`  Content-Type: ${item.contentType ?? 'none'}`);
    lines.push(`  Bytes: ${item.byteLength}`);
    lines.push(`  Parsed Count: ${item.parsedCount}`);
    if (item.samples.length > 0) {
      lines.push('  Samples:');
      for (let i = 0; i < item.samples.length; i++) {
        const sample = item.samples[i];
        lines.push(`    ${i + 1}. ${sample.title} -> ${sample.url}`);
      }
    } else {
      lines.push('  Samples: none');
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const flags = parseCliFlags(process.argv.slice(2));
  const summary = await runProbe({
    offline: flags.offline,
    strict: flags.strict,
  });

  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatTextReport(summary));
  }

  if (flags.strict && summary.hasFailures) {
    process.exitCode = 1;
  }
}

const isDirectEntry =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectEntry) {
  main().catch((err) => {
    console.error('Probe execution failed:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
