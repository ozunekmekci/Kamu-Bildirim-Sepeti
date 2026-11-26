import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AnnouncementSource } from '../src/modules/announcements/types';

const execFileAsync = promisify(execFile);

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_PDF_BYTES = 15 * 1024 * 1024;
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OCR_PAGES = 3;
const MIN_PDFTOTEXT_CHARS = 100;
const EXEC_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const SBB_REFERER = 'https://kamuilan.sbb.gov.tr/';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface FetchPdfOptions {
  source?: AnnouncementSource;
  timeoutMs?: number;
  maxBytes?: number;
  fetcher?: typeof fetch;
}

export interface ExtractPdfTextOptions {
  enableOcr?: boolean;
  maxOcrPages?: number;
  timeoutMs?: number;
}

export interface FetchAndExtractPdfOptions extends FetchPdfOptions, ExtractPdfTextOptions {}

export interface PdfTextExtractionResult {
  text: string;
  method: 'pdftotext' | 'ocr' | 'none';
}

function isSbbUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.toLowerCase() === 'kamuilan.sbb.gov.tr' ||
      parsed.hostname.toLowerCase().endsWith('.kamuilan.sbb.gov.tr')
    );
  } catch {
    return false;
  }
}

function isPdfMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === '%PDF';
}

async function readResponseWithLimit(res: Response, maxBytes: number): Promise<Buffer | null> {
  const contentLengthHeader = res.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
  }

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    return null;
  }
  return Buffer.from(arrayBuffer);
}

/**
 * Fetches an official announcement PDF into memory with SBB Referer support,
 * timeout protection, max-size guard, and `%PDF` magic byte validation.
 */
export async function fetchPdfBuffer(
  url: string,
  options?: FetchPdfOptions,
): Promise<Buffer | null> {
  if (!url || typeof url !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const fetchFn =
    options?.fetcher ??
    (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (!fetchFn) return null;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_PDF_BYTES;
  const requiresSbbReferer = options?.source === 'sbb' || isSbbUrl(url);

  const headers: Record<string, string> = {
    Accept: 'application/pdf, application/octet-stream;q=0.9, */*;q=0.8',
    'User-Agent': BROWSER_USER_AGENT,
  };
  if (requiresSbbReferer) {
    headers.Referer = SBB_REFERER;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }

    const buffer = await readResponseWithLimit(res, maxBytes);
    if (!buffer || !isPdfMagic(buffer)) {
      return null;
    }
    return buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeExtractedText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function isBinaryMissingError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}

async function runPdftotext(pdfPath: string, timeoutMs: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-'], {
      timeout: timeoutMs,
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
      encoding: 'utf8',
    });
    return normalizeExtractedText(stdout);
  } catch {
    return null;
  }
}

async function runTesseractOnPng(pngPath: string, timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'tesseract',
      [pngPath, 'stdout', '-l', 'tur', '--psm', '6'],
      {
        timeout: timeoutMs,
        maxBuffer: EXEC_MAX_BUFFER_BYTES,
        encoding: 'utf8',
      },
    );
    return normalizeExtractedText(stdout);
  } catch (err) {
    if (isBinaryMissingError(err)) {
      return '';
    }
    try {
      const { stdout } = await execFileAsync(
        'tesseract',
        [pngPath, 'stdout', '-l', 'eng', '--psm', '6'],
        {
          timeout: timeoutMs,
          maxBuffer: EXEC_MAX_BUFFER_BYTES,
          encoding: 'utf8',
        },
      );
      return normalizeExtractedText(stdout);
    } catch {
      return '';
    }
  }
}

function extractPageIndex(filename: string): number {
  const match = filename.match(/-(\d+)\.png$/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Extracts text from a PDF buffer using `pdftotext -layout` first and falling back
 * to `pdftoppm` + `tesseract` (`tur`, fallback `eng`) for scanned/image PDFs.
 * Never throws if PDF data is corrupt or CLI binaries are unavailable.
 */
export async function extractTextFromPdfBuffer(
  pdfBuffer: Buffer,
  options?: ExtractPdfTextOptions,
): Promise<PdfTextExtractionResult> {
  if (!Buffer.isBuffer(pdfBuffer) || !isPdfMagic(pdfBuffer)) {
    return { text: '', method: 'none' };
  }

  const enableOcr = options?.enableOcr !== false;
  const maxOcrPages = Math.max(1, Math.min(20, Math.floor(options?.maxOcrPages ?? DEFAULT_MAX_OCR_PAGES)));
  const timeoutMs = options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;

  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'kbs-pdf-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');
    await writeFile(pdfPath, pdfBuffer);

    const directText = await runPdftotext(pdfPath, timeoutMs);
    if (directText && directText.length >= MIN_PDFTOTEXT_CHARS) {
      return { text: directText, method: 'pdftotext' };
    }

    if (enableOcr) {
      const pagePrefix = path.join(tmpDir, 'page');
      let renderedOk = false;
      try {
        await execFileAsync(
          'pdftoppm',
          ['-png', '-r', '200', '-f', '1', '-l', String(maxOcrPages), pdfPath, pagePrefix],
          {
            timeout: timeoutMs,
            maxBuffer: EXEC_MAX_BUFFER_BYTES,
          },
        );
        renderedOk = true;
      } catch {
        renderedOk = false;
      }

      if (renderedOk) {
        const entries = await readdir(tmpDir);
        const pngFiles = entries
          .filter((name) => /^page-\d+\.png$/i.test(name))
          .sort((a, b) => extractPageIndex(a) - extractPageIndex(b));

        const pageTexts: string[] = [];
        for (const fileName of pngFiles) {
          const ocrText = await runTesseractOnPng(path.join(tmpDir, fileName), timeoutMs);
          if (ocrText) {
            pageTexts.push(ocrText);
          }
        }

        const combinedOcr = normalizeExtractedText(pageTexts.join('\n\n'));
        if (combinedOcr.length > 0) {
          return { text: combinedOcr, method: 'ocr' };
        }
      }
    }

    if (directText && directText.length > 0) {
      return { text: directText, method: 'pdftotext' };
    }

    return { text: '', method: 'none' };
  } catch {
    return { text: '', method: 'none' };
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Fetches an official announcement PDF and extracts its text via pdftotext / OCR.
 */
export async function fetchAndExtractPdfText(
  url: string,
  options?: FetchAndExtractPdfOptions,
): Promise<PdfTextExtractionResult> {
  const buffer = await fetchPdfBuffer(url, options);
  if (!buffer) {
    return { text: '', method: 'none' };
  }
  return extractTextFromPdfBuffer(buffer, options);
}
