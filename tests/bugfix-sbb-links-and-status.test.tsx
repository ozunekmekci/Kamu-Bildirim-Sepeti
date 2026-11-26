import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnnouncementDetailClient from '@/components/AnnouncementDetailClient';
import {
  parseSbbKamuIlanHtml,
  resolveOfficialLink,
  resolveVerifiedSourceUrl,
} from '@/modules/announcements';
import type { Announcement } from '@/modules/announcements/types';
import { D1Adapter, MemoryDbAdapter } from '@/modules/db';
import type { D1DatabaseLike, D1PreparedStatementLike } from '@/modules/db/d1-adapter';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/ilan/sbb-test-1',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

function makeSbbAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'sbb-705765f975ed291c',
    externalId: 'SBB-705765F975ED291C',
    source: 'sbb',
    sourceName: 'SBB Kamu İlan',
    sourceUrl:
      'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=CkSaXwq1gFQ0KmBru%2bEs8EfSzn%2f2EdxE2LXhTzQ',
    institution: 'BOZKÖY BELEDİYE BAŞKANLIĞI',
    title: '1 İTFAİYE ERİ ALACAK',
    category: 'personel_alimi',
    city: 'DÜZCE',
    status: 'acik',
    publishedAt: '2026-12-21',
    deadlineAt: '2026-12-23',
    quota: 1,
    summary: 'BOZKÖY BELEDİYE BAŞKANLIĞI - 1 İTFAİYE ERİ ALACAK (21 Aralık - 23 Aralık)',
    criteria: {
      educationLevels: ['onlisans'],
      kpssScoreTypes: ['P93'],
      minKpssScore: 60,
      cities: ['DÜZCE'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: [],
      summaryLines: ['60 KPSS şartı'],
    },
    employmentType: 'memur_b',
    noticeType: 'ilan',
    examType: 'practice_exam',
    verifiedSources: [
      {
        source: 'sbb',
        sourceName: 'SBB Kamu İlan',
        url: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=CkSaXwq1gFQ0KmBru%2bEs8EfSzn%2f2EdxE2LXhTzQ',
      },
    ],
    ...overrides,
  };
}

describe('Bugfix: SBB Referer soft-404 links, SBB deterministic IDs, and RSS status preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves SBB ilanDetay.aspx links to SBB main portal unless a non-SBB verified source exists', () => {
    const sbbOnly = makeSbbAnnouncement();
    const resolvedFallback = resolveOfficialLink(sbbOnly);
    expect(resolvedFallback.href).toBe('https://kamuilan.sbb.gov.tr/');
    expect(resolvedFallback.label).toBe('SBB Kamu İlan Portalında Aç');
    expect(resolvedFallback.isPortalFallback).toBe(true);
    expect(resolvedFallback.helperNote).toContain('ana portalda');

    expect(
      resolveVerifiedSourceUrl(
        'sbb',
        'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=CkSaXwq1gFQ0KmBru%2bEs8EfSzn%2f2EdxE2LXhTzQ'
      )
    ).toBe('https://kamuilan.sbb.gov.tr/');

    const crossVerified = makeSbbAnnouncement({
      verifiedSources: [
        {
          source: 'sbb',
          sourceName: 'SBB Kamu İlan',
          url: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=CkSaXwq1gFQ0KmBru',
        },
        {
          source: 'kariyer_kapisi',
          sourceName: 'Kariyer Kapısı',
          url: 'https://kariyerkapisi.gov.tr/IlanDetay?i=abc-123',
        },
      ],
    });
    const resolvedDirect = resolveOfficialLink(crossVerified);
    expect(resolvedDirect.href).toBe('https://kariyerkapisi.gov.tr/IlanDetay?i=abc-123');
    expect(resolvedDirect.label).toBe('Resmî İlan Metnine Git');
    expect(resolvedDirect.isPortalFallback).toBe(false);
    expect(resolvedDirect.helperNote).toBeNull();

    const kkItem = makeSbbAnnouncement({
      id: 'kk-1',
      source: 'kariyer_kapisi',
      sourceName: 'Kariyer Kapısı',
      sourceUrl: 'https://kariyerkapisi.gov.tr/IlanDetay?i=abc-123',
    });
    expect(resolveOfficialLink(kkItem)).toEqual({
      href: 'https://kariyerkapisi.gov.tr/IlanDetay?i=abc-123',
      label: 'Resmî İlan Metnine Git',
      isPortalFallback: false,
      helperNote: null,
    });
  });

  it('produces deterministic SBB IDs across rotating encrypted kod tokens and deduplicates identical rows', () => {
    const html1 = `
      <ul id="nav2">
        <li>
          <a href="ilanDetay.aspx?kod=FIRST_ENCRYPTED_IV_TOKEN_111">
            <span class="alt_p1">BOZKÖY BELEDİYE BAŞKANLIĞI</span>
            <span class="alt_p2">1 İTFAİYE ERİ ALACAK <em>21 Aralık - 23 Aralık</em></span>
          </a>
        </li>
      </ul>
      <div id="manset"><ul>
        <li>
          <a href="ilanDetay.aspx?kod=DIFFERENT_ENCRYPTED_IV_TOKEN_222">
            <span class="black">BOZKÖY BELEDİYE BAŞKANLIĞI</span>
            <span class="patrol">1 İTFAİYE ERİ ALACAK</span>
            <span class="h5date">21 Aralık - 23 Aralık</span>
          </a>
        </li>
      </ul></div>
    `;
    const html2 = `
      <ul id="nav2">
        <li>
          <a href="ilanDetay.aspx?kod=THIRD_ROTATING_TOKEN_999">
            <span class="alt_p1">BOZKÖY BELEDİYE BAŞKANLIĞI</span>
            <span class="alt_p2">1 İTFAİYE ERİ ALACAK <em>21 Aralık - 23 Aralık</em></span>
          </a>
        </li>
      </ul>
    `;

    const parsed1 = parseSbbKamuIlanHtml(html1, '2026-11-26');
    const parsed2 = parseSbbKamuIlanHtml(html2, '2026-11-26');

    expect(parsed1).toHaveLength(1);
    expect(parsed2).toHaveLength(1);
    expect(parsed1[0].id).toBe(parsed2[0].id);
    expect(parsed1[0].externalId).toBe(parsed2[0].externalId);
  });

  it('preserves status=acik when an enriched future-deadline row is upserted by a stale pending RSS row', async () => {
    const db = new MemoryDbAdapter();
    const futureDeadline = '2099-12-31';

    await db.upsertAnnouncements([
      makeSbbAnnouncement({
        id: 'kariyer_kapisi-kariyer_kapisi-guid-status-1',
        externalId: 'KARIYER_KAPISI-guid-status-1',
        source: 'kariyer_kapisi',
        sourceName: 'Kariyer Kapısı',
        sourceUrl: 'https://kariyerkapisi.gov.tr/IlanDetay?i=guid-status-1',
        publishedAt: '2026-11-20',
        deadlineAt: futureDeadline,
        status: 'acik',
        enrichmentStatus: 'enriched',
      }),
    ]);

    await db.upsertAnnouncements([
      makeSbbAnnouncement({
        id: 'kariyer_kapisi-kariyer_kapisi-guid-status-1',
        externalId: 'KARIYER_KAPISI-guid-status-1',
        source: 'kariyer_kapisi',
        sourceName: 'Kariyer Kapısı',
        sourceUrl: 'https://kariyerkapisi.gov.tr/IlanDetay?i=guid-status-1',
        publishedAt: '2026-11-20',
        deadlineAt: '2026-11-20',
        status: 'kapali',
        enrichmentStatus: 'pending',
      }),
    ]);

    const stored = await db.getAnnouncementById('kariyer_kapisi-kariyer_kapisi-guid-status-1');
    expect(stored?.enrichmentStatus).toBe('enriched');
    expect(stored?.deadlineAt).toBe(futureDeadline);
    expect(stored?.status).toBe('acik');

    // Verify D1Adapter upsert SQL contains monotonic status preservation guard
    const capturedSql: string[] = [];
    const makeStmt = (query: string): D1PreparedStatementLike => ({
      bind: () => makeStmt(query),
      first: async <T = Record<string, unknown>>() => ({ total: 1 } as T),
      all: async <T = Record<string, unknown>>() => ({ results: [] as T[] }),
      run: async () => {
        capturedSql.push(query);
        return { success: true, meta: { changes: 1 } };
      },
    });
    const mockD1: D1DatabaseLike = {
      prepare: (q) => {
        capturedSql.push(q);
        return makeStmt(q);
      },
      async batch(stmts) {
        for (const s of stmts) await s.run();
        return [];
      },
    };
    const d1 = new D1Adapter(mockD1);
    await d1.upsertAnnouncements([
      makeSbbAnnouncement({
        id: 'kariyer_kapisi-kariyer_kapisi-guid-status-1',
        externalId: 'KARIYER_KAPISI-guid-status-1',
        source: 'kariyer_kapisi',
        status: 'kapali',
        enrichmentStatus: 'pending',
      }),
    ]);
    const upsertQuery = capturedSql.find((q) => q.includes('ON CONFLICT(id) DO UPDATE SET'));
    expect(upsertQuery).toBeDefined();
    expect(upsertQuery).toContain("WHEN announcements.deadline_at >= substr(excluded.updated_at, 1, 10) THEN 'acik'");
  });

  it('renders SBB portal link and copy-institution action in AnnouncementDetailClient for SBB ilanDetay URLs', () => {
    const sbbDetail = makeSbbAnnouncement();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }))
    );

    render(<AnnouncementDetailClient announcement={sbbDetail} />);

    const link = screen.getByRole('link', { name: /SBB Kamu İlan Portalında Aç/i });
    expect(link).toHaveAttribute('href', 'https://kamuilan.sbb.gov.tr/');
    expect(screen.getByRole('button', { name: /Kurum Adını Kopyala/i })).toBeInTheDocument();
  });
});
