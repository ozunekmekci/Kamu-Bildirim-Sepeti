import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

export interface ProbeSummary {
  app: string;
  mode: 'live' | 'offline';
  strict: boolean;
  checkedAt: string;
  totalParsed: number;
  hasFailures: boolean;
  sources: ProbeSourceResult[];
}

export interface ProbeCliFlags {
  offline: boolean;
  strict: boolean;
  json: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = 'KamuBildirimSepeti/1.0 (+https://kamubildirimsepeti.example)';

const SOURCE_PARSERS: Record<
  OfficialLiveSource,
  (html: string, referenceDate?: string) => Announcement[]
> = {
  kariyer_kapisi: parseKariyerKapisiHtml,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(meta.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
        url: meta.url,
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
      url: meta.url,
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
      url: meta.url,
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
  const sources = Object.keys(OFFICIAL_SOURCE_URLS) as OfficialLiveSource[];
  const results = await Promise.all(
    sources.map((source) =>
      probeSingleSource(source, {
        offline: options?.offline,
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
    mode: options?.offline ? 'offline' : 'live',
    strict: Boolean(options?.strict),
    checkedAt: new Date().toISOString(),
    totalParsed,
    hasFailures,
    sources: results,
  };
}

function formatTextReport(summary: ProbeSummary): string {
  const lines: string[] = [
    `Kamu Bildirim Sepeti - Official Source Probe (${summary.mode})`,
    `Checked at: ${summary.checkedAt}`,
    `Total parsed announcements: ${summary.totalParsed}`,
    '',
  ];

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
