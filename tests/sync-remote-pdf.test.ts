import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Announcement, AnnouncementPosition } from '@/modules/announcements/types';
import { parseSbbKamuIlanHtml } from '@/modules/announcements/connectors';
import {
  enrichPdfBatch,
  fetchAlreadyEnrichedIds,
  parseSyncRemoteArgs,
  runSyncRemote,
  type PdfTextExtractorFn,
} from '../scripts/sync-remote';

const BOZKOY_PDF_TEXT = `
T.C.
NİĞDE İLİ BOZKÖY BELEDİYE BAŞKANLIĞI
İLK DEFA ATANMAK ÜZERE İTFAİYE ERİ ALIM İLANI

Kadro Unvanı: İtfaiye Eri
Sınıfı: GİH
Derecesi: 10
Adedi: 1
Cinsiyeti: Kadın/Erkek
KPSS Puan Türü: KPSS P3
KPSS Taban Puanı: En az 65 puan

ÖZEL ŞARTLAR:
1. Lisans düzeyinde eğitim veren fakültelerin Egzersiz ve Spor Bilimleri, Spor Yöneticiliği, Antrenörlük Eğitimi bölümlerinin birinden mezun olmak.
2. En az (C) sınıfı sürücü belgesine sahip olmak.
3. Sınavın yapıldığı tarihte 30 yaşını doldurmamış olmak.
4. Başvurular www.bozkoy.bel.tr internet adresinden indirilecek form ile yapılacaktır.
`;

function makeSbbItem(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'sbb-bozkoy-1',
    externalId: 'SBB-BOZKOY-1',
    source: 'sbb',
    sourceName: 'SBB Kamu İlan',
    sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=BOZKOY1',
    institution: 'BOZKÖY BELEDİYE BAŞKANLIĞI',
    title: '1 İTFAİYE ERİ ALACAK',
    category: 'personel_alimi',
    city: 'TÜRKİYE GENELİ',
    status: 'acik',
    publishedAt: '2026-12-21',
    deadlineAt: '2026-12-23',
    quota: 1,
    summary: 'BOZKÖY BELEDİYE BAŞKANLIĞI - 1 İTFAİYE ERİ ALACAK',
    criteria: {
      educationLevels: [],
      kpssScoreTypes: [],
      minKpssScore: null,
      cities: ['TÜRKİYE GENELİ'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: [],
      summaryLines: [],
    },
    employmentType: 'memur_b',
    noticeType: 'ilan',
    examType: 'unspecified',
    enrichmentStatus: 'pending',
    isDemo: false,
    ...overrides,
  };
}

describe('sync-remote incremental PDF & OCR enrichment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses --pdf-limit and --ocr-limit CLI arguments alongside defaults', () => {
    const defaults = parseSyncRemoteArgs([], {});
    expect(defaults.pdfLimit).toBe(35);
    expect(defaults.ocrLimit).toBe(8);
    expect(defaults.enrichLimit).toBe(25);
    expect(defaults.dryRun).toBe(false);

    const equalsStyle = parseSyncRemoteArgs([
      '--dry-run',
      '--pdf-limit=12',
      '--ocr-limit=3',
      '--enrich-limit=10',
      '--target=https://example.workers.dev/',
    ]);
    expect(equalsStyle).toEqual({
      target: 'https://example.workers.dev',
      enrichLimit: 10,
      pdfLimit: 12,
      ocrLimit: 3,
      dryRun: true,
    });

    const spaceStyle = parseSyncRemoteArgs(['--pdf-limit', '0', '--ocr-limit', '0']);
    expect(spaceStyle.pdfLimit).toBe(0);
    expect(spaceStyle.ocrLimit).toBe(0);
  });

  it('fetches enrichedIds from GET /api/cron/ingest and fails open on error', async () => {
    const okFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.workers.dev/api/cron/ingest');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-1');
      return new Response(JSON.stringify({ enrichedIds: ['sbb-1', 'iskur-2'], total: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const ids = await fetchAlreadyEnrichedIds('https://example.workers.dev', 'secret-1', okFetch);
    expect(Array.from(ids)).toEqual(['sbb-1', 'iskur-2']);

    const failFetch = vi.fn(async () => new Response('Method Not Allowed', { status: 405 })) as unknown as typeof fetch;
    const emptyIds = await fetchAlreadyEnrichedIds('https://example.workers.dev', 'secret-1', failFetch);
    expect(emptyIds.size).toBe(0);
  });

  it('enrichPdfBatch skips already-enriched IDs, prioritizes open notices, and respects ocrLimit', async () => {
    const skipped = makeSbbItem({
      id: 'sbb-already-enriched',
      sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=SKIP',
    });
    const textPdf = makeSbbItem({
      id: 'sbb-bozkoy-text',
      sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=TEXT1',
    });
    const scannedPdf1 = makeSbbItem({
      id: 'sbb-scanned-1',
      sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=SCAN1',
    });
    const scannedPdf2 = makeSbbItem({
      id: 'sbb-scanned-2',
      sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=SCAN2',
    });

    const fetchedUrls: string[] = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchedUrls.push(url);
      expect((init?.headers as Record<string, string>).Referer).toBe('https://kamuilan.sbb.gov.tr/');
      if (url.includes('TEXT1')) {
        return new Response(Buffer.from('%PDF-1.4\nTEXT1', 'ascii'), { status: 200 });
      }
      if (url.includes('SCAN1')) {
        return new Response(Buffer.from('%PDF-1.4\nSCAN1', 'ascii'), { status: 200 });
      }
      if (url.includes('SCAN2')) {
        return new Response(Buffer.from('%PDF-1.4\nSCAN2', 'ascii'), { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const mockExtractor: PdfTextExtractorFn = vi.fn<PdfTextExtractorFn>(async (buf, opts) => {
      const tag = buf.toString('ascii');
      if (tag.includes('TEXT1')) {
        return { text: BOZKOY_PDF_TEXT, method: 'pdftotext' };
      }
      if (opts?.enableOcr) {
        return { text: BOZKOY_PDF_TEXT, method: 'ocr' };
      }
      return { text: '', method: 'none' };
    });

    const result = await enrichPdfBatch([skipped, textPdf, scannedPdf1, scannedPdf2], {
      pdfLimit: 10,
      ocrLimit: 1,
      skipIds: new Set(['sbb-already-enriched']),
      fetcher: mockFetch,
      pdfExtractor: mockExtractor,
    });

    expect(result.skippedCount).toBe(1);
    expect(fetchedUrls.some((u) => u.includes('SKIP'))).toBe(false);
    expect(result.ocrUsedCount).toBe(1);
    expect(result.pdfEnrichedCount).toBe(2);

    const enrichedText = result.items.find((i) => i.id === 'sbb-bozkoy-text');
    expect(enrichedText?.enrichmentStatus).toBe('enriched');
    expect(enrichedText?.city).toBe('NİĞDE');
    expect(enrichedText?.criteria.minKpssScore).toBe(65);
    expect(enrichedText?.criteria.driverLicenses).toContain('C');
    expect(enrichedText?.criteria.maxAge).toBe(30);
    expect(result.positionsByAnnouncementId['sbb-bozkoy-text']?.length).toBeGreaterThanOrEqual(1);
  });

  it('runSyncRemote skips enrichedIds from GET /api/cron/ingest and posts newly enriched SBB PDF criteria + positions', async () => {
    const sbbHtml = `
      <ul id="nav2">
        <li>
          <a href="ilanDetay.aspx?kod=ALREADY_DONE">
            <p class="alt_p1">ESKİ BELEDİYE BAŞKANLIĞI</p>
            <p class="alt_p2">1 ZABITA MEMURU ALACAK<em> ( 20 Aralık - 28 Aralık) </em></p>
          </a>
          <a href="ilanDetay.aspx?kod=NEW_BOZKOY">
            <p class="alt_p1">BOZKÖY BELEDİYE BAŞKANLIĞI</p>
            <p class="alt_p2">1 İTFAİYE ERİ ALACAK<em> ( 21 Aralık - 23 Aralık) </em></p>
          </a>
        </li>
      </ul>
    `;

    const parsedPreview = parseSbbKamuIlanHtml(sbbHtml);
    const alreadyDoneItem = parsedPreview.find((item) => item.institution.includes('ESKİ'))!;
    const newBozkoyItem = parsedPreview.find((item) => item.institution.includes('BOZKÖY'))!;
    expect(alreadyDoneItem).toBeDefined();
    expect(newBozkoyItem).toBeDefined();

    const pdfFetchUrls: string[] = [];
    let postedPayload: {
      items: Announcement[];
      positionsByAnnouncementId: Record<string, AnnouncementPosition[]>;
    } | null = null;

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/ilan/GetIseAlimPage')) {
        return new Response(JSON.stringify({ searchIlan: [] }), { status: 200 });
      }
      if (url === 'https://kamuilan.sbb.gov.tr/') {
        return new Response(sbbHtml, { status: 200 });
      }
      if (url.includes('ilanDetay.aspx?kod=')) {
        pdfFetchUrls.push(url);
        expect((init?.headers as Record<string, string>).Referer).toBe('https://kamuilan.sbb.gov.tr/');
        return new Response(Buffer.from('%PDF-1.4\nBOZKOY_BYTES', 'ascii'), {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        });
      }
      if (url.includes('iskur.gov.tr')) {
        return new Response('<svg></svg>', { status: 200 });
      }
      if (url.includes('resmigazete.gov.tr')) {
        return new Response('<html><body></body></html>', { status: 200 });
      }
      if (url === 'https://target.workers.dev/api/cron/ingest' && method === 'GET') {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer cron-secret-xyz');
        return new Response(
          JSON.stringify({ enrichedIds: [alreadyDoneItem.id], total: 1 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === 'https://target.workers.dev/api/cron/ingest' && method === 'POST') {
        postedPayload = JSON.parse(String(init?.body ?? '{}'));
        return new Response(
          JSON.stringify({ inserted: 1, updated: 1, positionsSaved: 1 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const mockExtractor: PdfTextExtractorFn = vi.fn<PdfTextExtractorFn>(async (_buf, opts) => {
      if (!opts?.enableOcr) {
        return { text: '', method: 'none' };
      }
      return { text: BOZKOY_PDF_TEXT, method: 'ocr' };
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runSyncRemote(
      {
        target: 'https://target.workers.dev',
        enrichLimit: 0,
        pdfLimit: 10,
        ocrLimit: 4,
        dryRun: false,
      },
      { CRON_SECRET: 'cron-secret-xyz' },
      mockFetch,
      { pdfExtractor: mockExtractor },
    );

    // Only the new Bozköy PDF should have been fetched; alreadyDoneItem was skipped
    expect(pdfFetchUrls).toEqual(['https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=NEW_BOZKOY']);

    expect(postedPayload).not.toBeNull();
    const sentBozkoy = postedPayload!.items.find((i) => i.id === newBozkoyItem.id);
    expect(sentBozkoy?.enrichmentStatus).toBe('enriched');
    expect(sentBozkoy?.city).toBe('NİĞDE');
    expect(sentBozkoy?.criteria.kpssScoreTypes).toContain('P3');
    expect(sentBozkoy?.criteria.minKpssScore).toBe(65);
    expect(sentBozkoy?.criteria.driverLicenses).toContain('C');
    expect(sentBozkoy?.criteria.maxAge).toBe(30);
    expect(sentBozkoy?.criteria.departments).toEqual(
      expect.arrayContaining(['Egzersiz ve Spor Bilimleri', 'Spor Yöneticiliği']),
    );
    expect(sentBozkoy?.applyUrl).toBe('https://www.bozkoy.bel.tr');
    expect(postedPayload!.positionsByAnnouncementId[newBozkoyItem.id]?.length).toBeGreaterThanOrEqual(1);

    const logJson = JSON.parse(String(logSpy.mock.calls[0]?.[0] ?? '{}')) as {
      pdfEnrichedCount?: number;
      ocrUsedCount?: number;
      pdfSkippedCount?: number;
    };
    expect(logJson.pdfEnrichedCount).toBe(1);
    expect(logJson.ocrUsedCount).toBe(1);
    expect(logJson.pdfSkippedCount).toBe(1);
  });
});
