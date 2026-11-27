import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnnouncementFeed from '@/components/AnnouncementFeed';
import PublicInsightsClient from '@/components/PublicInsightsClient';
import { GET as getAnnouncementsHandler } from '@/app/api/announcements/route';
import { GET as getSyncStatusHandler } from '@/app/api/sync/status/route';
import { parseSbbKamuIlanHtml } from '@/modules/announcements/connectors';
import type { Announcement } from '@/modules/announcements/types';
import { resetMemoryDb } from '@/modules/db';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

const dbRef = vi.hoisted(() => ({ current: null as ReturnType<typeof resetMemoryDb> | null }));
vi.mock('@/modules/db', async () => {
  const actual = await vi.importActual<typeof import('@/modules/db')>('@/modules/db');
  return {
    ...actual,
    getDb: async () => {
      if (!dbRef.current) {
        dbRef.current = actual.resetMemoryDb();
      }
      return dbRef.current;
    },
  };
});

function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'sbb-sample-1',
    externalId: 'SBB-SAMPLE-1',
    source: 'sbb',
    sourceName: 'SBB Kamu İlan',
    sourceUrl: 'https://kamuilan.sbb.gov.tr/',
    institution: 'SELÇUK ÜNİVERSİTESİ',
    title: '2 MEMUR ALACAK',
    category: 'personel_alimi',
    city: 'KONYA',
    status: 'acik',
    publishedAt: '2026-11-27',
    deadlineAt: '2026-12-14',
    quota: 2,
    summary: 'SELÇUK ÜNİVERSİTESİ - 2 MEMUR ALACAK (27 Kasım - 14 Aralık)',
    criteria: {
      educationLevels: ['lisans'],
      kpssScoreTypes: ['P3'],
      minKpssScore: 70,
      cities: ['KONYA'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: ['4001'],
      summaryLines: ['Lisans 4001'],
    },
    employmentType: 'memur_b',
    noticeType: 'ilan',
    examType: 'kpss_only',
    isDemo: false,
    ...overrides,
  };
}

describe('Field Polish: SBB summary formatting, API alignment, live Analiz count, and debounced filter', () => {
  beforeEach(() => {
    dbRef.current = resetMemoryDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips double parentheses around date ranges in parseSbbKamuIlanHtml summary', () => {
    const html = `
      <ul id="nav2">
        <li>
          <a href="ilanDetay.aspx?kod=TOK123">
            <span class="alt_p1">SELÇUK ÜNİVERSİTESİ</span>
            <span class="alt_p2">2 MEMUR ALACAK <em>( 27 Kasım - 14 Aralık )</em></span>
          </a>
        </li>
      </ul>
    `;
    const parsed = parseSbbKamuIlanHtml(html, '2026-11-27');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].summary).not.toContain('((');
    expect(parsed[0].summary).not.toContain('))');
    expect(parsed[0].summary).toContain('(27 Kasım - 14 Aralık)');
  });

  it('supports employmentType=memur_ab and aligns checkpoint activeCount with live D1 counts', async () => {
    const db = dbRef.current!;
    await db.upsertAnnouncements([
      makeAnnouncement({ id: 'sbb-a', externalId: 'SBB-A', employmentType: 'memur_a' }),
      makeAnnouncement({ id: 'sbb-b', externalId: 'SBB-B', employmentType: 'memur_b' }),
      makeAnnouncement({
        id: 'iskur-w',
        externalId: 'ISKUR-W',
        source: 'iskur',
        sourceName: 'İŞKUR',
        employmentType: 'isci',
      }),
    ]);
    await db.upsertSourceCheckpoint({
      source: 'sbb',
      etag: null,
      lastModified: null,
      bodyHash: null,
      lastCheckedAt: '2026-11-27T01:00:00.000Z',
      lastChangedAt: null,
      activeCount: 0,
      lastError: 'HTTP 403 yanıtı alındı.',
    });

    const annRes = await getAnnouncementsHandler(
      new Request('http://localhost/api/announcements?employmentType=memur_ab')
    );
    expect(annRes.status).toBe(200);
    const annBody = (await annRes.json()) as {
      items: Announcement[];
      total: number;
      openTotal: number;
      closedTotal: number;
      freshness: { checkpoints: Array<{ source: string; activeCount: number }> };
    };
    expect(annBody.total).toBe(2);
    expect(annBody.openTotal).toBe(3);
    expect(annBody.closedTotal).toBe(0);
    expect(annBody.freshness.checkpoints.find((c) => c.source === 'sbb')?.activeCount).toBe(2);

    const statusRes = await getSyncStatusHandler();
    expect(statusRes.status).toBe(200);
    const statusBody = (await statusRes.json()) as {
      checkpoints: Array<{ source: string; activeCount: number }>;
      liveSummary: { openCount: number; totalCount: number };
    };
    expect(statusBody.liveSummary).toEqual({ openCount: 3, totalCount: 3 });
    expect(statusBody.checkpoints.find((c) => c.source === 'sbb')?.activeCount).toBe(2);
  });

  it('updates PublicInsightsClient open/total cards from /api/sync/status liveSummary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/sync/status')) {
          return new Response(
            JSON.stringify({
              checkpoints: [],
              liveSummary: { openCount: 160, totalCount: 164 },
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(<PublicInsightsClient />);

    await waitFor(() => {
      expect(screen.getByText('160')).toBeInTheDocument();
      expect(screen.getByText(/Toplam 164 kayıtlı ilan içinde/i)).toBeInTheDocument();
    });
  });

  it('triggers debounced server filter fetch when guest feed is truncated (limitApplied !== null)', async () => {
    const requestedUrls: string[] = [];
    const sbbItem = makeAnnouncement({ id: 'sbb-1', title: 'SBB Memur Alımı' });
    const iskurItem = makeAnnouncement({
      id: 'iskur-1',
      externalId: 'ISKUR-1',
      source: 'iskur',
      sourceName: 'İŞKUR',
      title: 'İŞKUR Uzman Alımı',
      employmentType: 'memur_a',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        requestedUrls.push(url);
        if (url.startsWith('/api/auth/me')) {
          return new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 });
        }
        if (url.includes('source=iskur')) {
          return new Response(
            JSON.stringify({
              items: [iskurItem],
              total: 1,
              openTotal: 2,
              closedTotal: 0,
              limited: false,
              limit: 15,
            }),
            { status: 200 }
          );
        }
        if (url.startsWith('/api/announcements')) {
          return new Response(
            JSON.stringify({
              items: [sbbItem],
              total: 160,
              openTotal: 160,
              closedTotal: 0,
              limited: true,
              limit: 15,
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(<AnnouncementFeed initialAnnouncements={[sbbItem]} />);

    await waitFor(() => {
      expect(screen.getByText(/Açık İlanlar \(160\)/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Resmî Kaynak/i), { target: { value: 'iskur' } });

    await waitFor(
      () => {
        expect(requestedUrls.some((u) => u.includes('/api/announcements?') && u.includes('source=iskur'))).toBe(true);
        expect(screen.getByText(/İŞKUR Uzman Alımı/i)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });
});
