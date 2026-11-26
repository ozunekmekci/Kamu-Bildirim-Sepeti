import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enrichKariyerKapisiDetail,
  fetchAllOfficialSourcesV2,
} from '../src/modules/announcements/connectors';
import { extractKariyerGuid } from '../src/modules/announcements/service';
import type { Announcement, AnnouncementPosition } from '../src/modules/announcements/types';

export interface SyncRemoteCliOptions {
  target: string;
  enrichLimit: number;
  dryRun: boolean;
}

const DEFAULT_TARGET_URL = 'https://kpssportal.ozunekmekci.workers.dev';
const DEFAULT_ENRICH_LIMIT = 25;
const DETAIL_CONCURRENCY = 4;
const INGEST_CHUNK_SIZE = 80;

export function parseSyncRemoteArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): SyncRemoteCliOptions {
  let target = env.SYNC_TARGET_URL?.trim() || DEFAULT_TARGET_URL;
  let enrichLimit = DEFAULT_ENRICH_LIMIT;
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
      const parsed = Number(arg.slice('--enrich-limit='.length));
      if (Number.isFinite(parsed) && parsed >= 0) {
        enrichLimit = Math.floor(parsed);
      }
      continue;
    }
    if (arg === '--enrich-limit' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        enrichLimit = Math.floor(parsed);
      }
      i += 1;
    }
  }

  return {
    target: target.replace(/\/+$/, ''),
    enrichLimit,
    dryRun,
  };
}

function redactSecret(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join('[REDACTED]');
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

export async function runSyncRemote(
  options: SyncRemoteCliOptions,
  env: Record<string, string | undefined> = process.env,
  fetcher?: typeof fetch,
): Promise<void> {
  const v2 = await fetchAllOfficialSourcesV2(fetcher, {
    timeoutMs: 12_000,
  });

  const enriched = await enrichKariyerBatch(v2.items, options.enrichLimit, fetcher);
  const totalPositions = Object.values(enriched.positionsByAnnouncementId).reduce(
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
          enrichedCount: enriched.enrichedCount,
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

  const cronSecret = env.CRON_SECRET?.trim();
  if (!cronSecret) {
    throw new Error('CRON_SECRET environment variable is required for remote ingest.');
  }

  const fetchFn =
    fetcher ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (!fetchFn) {
    throw new Error('Global fetch is unavailable in this runtime.');
  }

  const endpoint = `${options.target}/api/cron/ingest`;
  const chunks: Announcement[][] = [];
  if (enriched.items.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < enriched.items.length; i += INGEST_CHUNK_SIZE) {
      chunks.push(enriched.items.slice(i, i + INGEST_CHUNK_SIZE));
    }
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalPositionsSaved = 0;

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx += 1) {
    const chunkItems = chunks[chunkIdx];
    const chunkPositions: Record<string, AnnouncementPosition[]> = {};
    for (const item of chunkItems) {
      const pos = enriched.positionsByAnnouncementId[item.id];
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
        enrichedCount: enriched.enrichedCount,
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
