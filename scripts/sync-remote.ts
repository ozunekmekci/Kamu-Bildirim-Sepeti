import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enrichKariyerKapisiDetail,
  fetchAllOfficialSourcesV2,
} from '../src/modules/announcements/connectors';
import { enrichAnnouncementFromPdfText } from '../src/modules/announcements/pdf-criteria';
import { extractKariyerGuid } from '../src/modules/announcements/service';
import type { Announcement, AnnouncementPosition } from '../src/modules/announcements/types';
import {
  extractTextFromPdfBuffer,
  fetchPdfBuffer,
  type ExtractPdfTextOptions,
  type PdfTextExtractionResult,
} from './pdf-extract';

export interface SyncRemoteCliOptions {
  target: string;
  enrichLimit: number;
  pdfLimit: number;
  ocrLimit: number;
  dryRun: boolean;
}

export type PdfTextExtractorFn = (
  pdfBuffer: Buffer,
  options?: ExtractPdfTextOptions,
) => Promise<PdfTextExtractionResult>;

export interface EnrichPdfBatchOptions {
  pdfLimit: number;
  ocrLimit: number;
  skipIds?: ReadonlySet<string>;
  fetcher?: typeof fetch;
  pdfExtractor?: PdfTextExtractorFn;
}

export interface EnrichPdfBatchResult {
  items: Announcement[];
  positionsByAnnouncementId: Record<string, AnnouncementPosition[]>;
  pdfEnrichedCount: number;
  ocrUsedCount: number;
  skippedCount: number;
}

export interface RunSyncRemoteDeps {
  alreadyEnrichedIds?: ReadonlySet<string>;
  pdfExtractor?: PdfTextExtractorFn;
}

const DEFAULT_TARGET_URL = 'https://kpssportal.ozunekmekci.workers.dev';
const DEFAULT_ENRICH_LIMIT = 25;
const DEFAULT_PDF_LIMIT = 35;
const DEFAULT_OCR_LIMIT = 8;
const DETAIL_CONCURRENCY = 4;
const PDF_CONCURRENCY = 4;
const MIN_PDF_ENRICH_CHARS = 50;
const INGEST_CHUNK_SIZE = 80;

function parseNonNegativeInt(raw: string): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export function parseSyncRemoteArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): SyncRemoteCliOptions {
  let target = env.SYNC_TARGET_URL?.trim() || DEFAULT_TARGET_URL;
  let enrichLimit = DEFAULT_ENRICH_LIMIT;
  let pdfLimit = DEFAULT_PDF_LIMIT;
  let ocrLimit = DEFAULT_OCR_LIMIT;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length).trim();
      if (value) target = value;
      continue;
    }
    if (arg === '--target' && argv[i + 1]) {
      target = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--enrich-limit=')) {
      const parsed = parseNonNegativeInt(arg.slice('--enrich-limit='.length));
      if (parsed !== null) enrichLimit = parsed;
      continue;
    }
    if (arg === '--enrich-limit' && argv[i + 1]) {
      const parsed = parseNonNegativeInt(argv[i + 1]);
      if (parsed !== null) enrichLimit = parsed;
      i += 1;
      continue;
    }
    if (arg.startsWith('--pdf-limit=')) {
      const parsed = parseNonNegativeInt(arg.slice('--pdf-limit='.length));
      if (parsed !== null) pdfLimit = parsed;
      continue;
    }
    if (arg === '--pdf-limit' && argv[i + 1]) {
      const parsed = parseNonNegativeInt(argv[i + 1]);
      if (parsed !== null) pdfLimit = parsed;
      i += 1;
      continue;
    }
    if (arg.startsWith('--ocr-limit=')) {
      const parsed = parseNonNegativeInt(arg.slice('--ocr-limit='.length));
      if (parsed !== null) ocrLimit = parsed;
      continue;
    }
    if (arg === '--ocr-limit' && argv[i + 1]) {
      const parsed = parseNonNegativeInt(argv[i + 1]);
      if (parsed !== null) ocrLimit = parsed;
      i += 1;
    }
  }

  return {
    target: target.replace(/\/+$/, ''),
    enrichLimit,
    pdfLimit,
    ocrLimit,
    dryRun,
  };
}

function redactSecret(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join('[REDACTED]');
}

function resolveFetchFn(fetcher?: typeof fetch): typeof fetch | null {
  return (
    fetcher ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null)
  );
}

/**
 * Fetches IDs of already-enriched announcements from the remote ingest endpoint.
 * Fail-open: returns an empty set if the endpoint is unavailable or returns non-200.
 */
export async function fetchAlreadyEnrichedIds(
  target: string,
  cronSecret: string,
  fetcher?: typeof fetch,
): Promise<Set<string>> {
  const fetchFn = resolveFetchFn(fetcher);
  if (!fetchFn || !cronSecret) return new Set();

  const endpoint = `${target.replace(/\/+$/, '')}/api/cron/ingest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return new Set();

    const payload = (await response.json()) as { enrichedIds?: unknown };
    if (!Array.isArray(payload?.enrichedIds)) return new Set();

    return new Set(
      payload.enrichedIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
  } catch {
    return new Set();
  } finally {
    clearTimeout(timer);
  }
}

async function enrichKariyerBatch(
  items: Announcement[],
  enrichLimit: number,
  fetcher?: typeof fetch,
): Promise<{
  items: Announcement[];
  positionsByAnnouncementId: Record<string, AnnouncementPosition[]>;
  enrichedCount: number;
}> {
  const updatedItems = [...items];
  const positionsByAnnouncementId: Record<string, AnnouncementPosition[]> = {};
  if (enrichLimit <= 0) {
    return { items: updatedItems, positionsByAnnouncementId, enrichedCount: 0 };
  }

  const candidateIndices: number[] = [];
  for (let i = 0; i < updatedItems.length; i += 1) {
    const item = updatedItems[i];
    if (item.source === 'kariyer_kapisi' && extractKariyerGuid(item)) {
      candidateIndices.push(i);
      if (candidateIndices.length >= enrichLimit) break;
    }
  }

  let cursor = 0;
  let enrichedCount = 0;

  async function worker(): Promise<void> {
    while (cursor < candidateIndices.length) {
      const idx = candidateIndices[cursor];
      cursor += 1;
      const base = updatedItems[idx];
      const guid = extractKariyerGuid(base);
      if (!guid) continue;
      try {
        const enriched = await enrichKariyerKapisiDetail(guid, base, fetcher, {
          timeoutMs: 12_000,
        });
        updatedItems[idx] = enriched;
        if (enriched.enrichmentStatus === 'enriched') {
          enrichedCount += 1;
        }
        if (enriched.positions && enriched.positions.length > 0) {
          positionsByAnnouncementId[enriched.id] = enriched.positions;
        }
      } catch {
        // Keep base listing item if detail fetch fails
      }
    }
  }

  const workerCount = Math.min(DETAIL_CONCURRENCY, candidateIndices.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { items: updatedItems, positionsByAnnouncementId, enrichedCount };
}

/**
 * Enriches SBB and ISKUR announcements by fetching their official PDF notices,
 * running fast concurrent `pdftotext` extraction first and sequential OCR up to `ocrLimit`
 * for scanned PDFs.
 */
export async function enrichPdfBatch(
  items: Announcement[],
  options: EnrichPdfBatchOptions,
): Promise<EnrichPdfBatchResult> {
  const updatedItems = [...items];
  const positionsByAnnouncementId: Record<string, AnnouncementPosition[]> = {};
  const pdfLimit = Math.max(0, Math.floor(options.pdfLimit));
  const ocrLimit = Math.max(0, Math.floor(options.ocrLimit));
  const skipIds = options.skipIds;
  const extractor = options.pdfExtractor ?? extractTextFromPdfBuffer;

  if (pdfLimit <= 0) {
    return {
      items: updatedItems,
      positionsByAnnouncementId,
      pdfEnrichedCount: 0,
      ocrUsedCount: 0,
      skippedCount: 0,
    };
  }

  const openIndices: number[] = [];
  const closedIndices: number[] = [];
  let skippedCount = 0;

  for (let i = 0; i < updatedItems.length; i += 1) {
    const item = updatedItems[i];
    if (item.source !== 'sbb' && item.source !== 'iskur') continue;
    if (skipIds?.has(item.id)) {
      skippedCount += 1;
      continue;
    }
    if (!item.sourceUrl) continue;
    if (item.status === 'acik') {
      openIndices.push(i);
    } else {
      closedIndices.push(i);
    }
  }

  const candidateIndices = [...openIndices, ...closedIndices].slice(0, pdfLimit);
  if (candidateIndices.length === 0) {
    return {
      items: updatedItems,
      positionsByAnnouncementId,
      pdfEnrichedCount: 0,
      ocrUsedCount: 0,
      skippedCount,
    };
  }

  let cursor = 0;
  let pdfEnrichedCount = 0;
  let ocrUsedCount = 0;
  const ocrQueue: Array<{ idx: number; buffer: Buffer }> = [];

  async function textWorker(): Promise<void> {
    while (cursor < candidateIndices.length) {
      const idx = candidateIndices[cursor];
      cursor += 1;
      const base = updatedItems[idx];

      try {
        const buffer = await fetchPdfBuffer(base.sourceUrl, {
          source: base.source,
          timeoutMs: 15_000,
          fetcher: options.fetcher,
        });
        if (!buffer) continue;

        const direct = await extractor(buffer, { enableOcr: false });
        if (direct.text.trim().length >= MIN_PDF_ENRICH_CHARS) {
          const enriched = enrichAnnouncementFromPdfText(base, direct.text);
          updatedItems[idx] = enriched;
          pdfEnrichedCount += 1;
          if (enriched.positions && enriched.positions.length > 0) {
            positionsByAnnouncementId[enriched.id] = enriched.positions;
          }
          continue;
        }

        if (ocrLimit > 0 && ocrQueue.length < ocrLimit) {
          ocrQueue.push({ idx, buffer });
        }
      } catch {
        // Keep base listing item if PDF fetch or extraction fails
      }
    }
  }

  const workerCount = Math.min(PDF_CONCURRENCY, candidateIndices.length);
  await Promise.all(Array.from({ length: workerCount }, () => textWorker()));

  // Run scanned-PDF OCR sequentially and strictly bounded by ocrLimit
  for (const entry of ocrQueue.slice(0, ocrLimit)) {
    const base = updatedItems[entry.idx];
    try {
      const ocrResult = await extractor(entry.buffer, { enableOcr: true });
      if (ocrResult.method === 'ocr') {
        ocrUsedCount += 1;
      }
      if (ocrResult.text.trim().length >= MIN_PDF_ENRICH_CHARS) {
        const enriched = enrichAnnouncementFromPdfText(base, ocrResult.text);
        updatedItems[entry.idx] = enriched;
        pdfEnrichedCount += 1;
        if (enriched.positions && enriched.positions.length > 0) {
          positionsByAnnouncementId[enriched.id] = enriched.positions;
        }
      }
    } catch {
      // Keep base listing item if OCR fails
    }
  }

  return {
    items: updatedItems,
    positionsByAnnouncementId,
    pdfEnrichedCount,
    ocrUsedCount,
    skippedCount,
  };
}

export async function runSyncRemote(
  options: SyncRemoteCliOptions,
  env: Record<string, string | undefined> = process.env,
  fetcher?: typeof fetch,
  deps?: RunSyncRemoteDeps,
): Promise<void> {
  const v2 = await fetchAllOfficialSourcesV2(fetcher, {
    timeoutMs: 12_000,
  });

  const kkEnriched = await enrichKariyerBatch(v2.items, options.enrichLimit, fetcher);

  const cronSecret = env.CRON_SECRET?.trim();
  const skipIds =
    deps?.alreadyEnrichedIds ??
    (!options.dryRun && cronSecret && options.pdfLimit > 0
      ? await fetchAlreadyEnrichedIds(options.target, cronSecret, fetcher)
      : new Set<string>());

  const pdfEnriched = await enrichPdfBatch(kkEnriched.items, {
    pdfLimit: options.pdfLimit,
    ocrLimit: options.ocrLimit,
    skipIds,
    fetcher,
    pdfExtractor: deps?.pdfExtractor,
  });

  const positionsByAnnouncementId: Record<string, AnnouncementPosition[]> = {
    ...kkEnriched.positionsByAnnouncementId,
    ...pdfEnriched.positionsByAnnouncementId,
  };

  const totalPositions = Object.values(positionsByAnnouncementId).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          target: options.target,
          rawCount: v2.rawCount,
          dedupedCount: v2.dedupedCount,
          enrichedCount: kkEnriched.enrichedCount,
          pdfEnrichedCount: pdfEnriched.pdfEnrichedCount,
          ocrUsedCount: pdfEnriched.ocrUsedCount,
          pdfSkippedCount: pdfEnriched.skippedCount,
          positionsCount: totalPositions,
          errorsCount: v2.errors.length,
          checkpoints: v2.sourceCheckpoints.map((cp) => ({
            source: cp.source,
            activeCount: cp.activeCount,
            lastError: cp.lastError,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!cronSecret) {
    throw new Error('CRON_SECRET environment variable is required for remote ingest.');
  }

  const fetchFn = resolveFetchFn(fetcher);
  if (!fetchFn) {
    throw new Error('Global fetch is unavailable in this runtime.');
  }

  const endpoint = `${options.target}/api/cron/ingest`;
  const chunks: Announcement[][] = [];
  if (pdfEnriched.items.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < pdfEnriched.items.length; i += INGEST_CHUNK_SIZE) {
      chunks.push(pdfEnriched.items.slice(i, i + INGEST_CHUNK_SIZE));
    }
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalPositionsSaved = 0;

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx += 1) {
    const chunkItems = chunks[chunkIdx];
    const chunkPositions: Record<string, AnnouncementPosition[]> = {};
    for (const item of chunkItems) {
      const pos = positionsByAnnouncementId[item.id];
      if (pos) {
        chunkPositions[item.id] = pos;
      }
    }

    const isLastChunk = chunkIdx === chunks.length - 1;
    const payload = {
      items: chunkItems,
      positionsByAnnouncementId: chunkPositions,
      checkpoints: isLastChunk ? v2.sourceCheckpoints : [],
      triggeredBy: 'github_actions_sync_remote',
    };

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const rawBody = await response.text().catch(() => '');
      const safeSnippet = redactSecret(rawBody, cronSecret).slice(0, 240);
      throw new Error(
        `Remote ingest failed with HTTP ${response.status}${safeSnippet ? `: ${safeSnippet}` : ''}`,
      );
    }

    const resJson = (await response.json()) as {
      inserted?: number;
      updated?: number;
      positionsSaved?: number;
    };
    totalInserted += resJson.inserted ?? 0;
    totalUpdated += resJson.updated ?? 0;
    totalPositionsSaved += resJson.positionsSaved ?? 0;
  }

  console.log(
    JSON.stringify(
      {
        mode: 'live',
        target: options.target,
        chunks: chunks.length,
        dedupedCount: v2.dedupedCount,
        enrichedCount: kkEnriched.enrichedCount,
        pdfEnrichedCount: pdfEnriched.pdfEnrichedCount,
        ocrUsedCount: pdfEnriched.ocrUsedCount,
        pdfSkippedCount: pdfEnriched.skippedCount,
        inserted: totalInserted,
        updated: totalUpdated,
        positionsSaved: totalPositionsSaved,
        errorsCount: v2.errors.length,
      },
      null,
      2,
    ),
  );
}

const isDirectEntry =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectEntry) {
  const options = parseSyncRemoteArgs(process.argv.slice(2));
  runSyncRemote(options).catch((err) => {
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.error('sync-remote failed:', redactSecret(rawMsg, process.env.CRON_SECRET?.trim()));
    process.exitCode = 1;
  });
}
