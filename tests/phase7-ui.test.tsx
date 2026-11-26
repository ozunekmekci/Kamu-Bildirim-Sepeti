import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnnouncementFeed from '@/components/AnnouncementFeed';
import AnnouncementDetailClient from '@/components/AnnouncementDetailClient';
import AyarlarPage from '@/app/ayarlar/page';
import KaynakLandingPage, { generateMetadata as generateKaynakMetadata } from '@/app/kaynak/[slug]/page';
import { getSourceLandingData } from '@/modules/analytics';
import type { Announcement, AnnouncementPosition } from '@/modules/announcements/types';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  notFound: () => mockNotFound(),
}));

function mockFetchImplementation(
  handlers: Record<string, (url: string, init?: RequestInit) => Response | Promise<Response>>
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, fn] of Object.entries(handlers)) {
      if (url.startsWith(pattern)) {
        return fn(url, init);
      }
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

const SAMPLE_POSITIONS: AnnouncementPosition[] = [
  {
    id: 'pos-1',
    announcementId: 'sbb-live-1',
    title: 'Uzman Yardımcısı',
    unvan: 'Hazine ve Maliye Uzman Yardımcısı',
    city: 'ANKARA',
    district: 'ÇANKAYA',
    quota: 10,
    educationLevel: 'lisans',
    kpssScoreType: 'P3',
    minKpssScore: 80,
    maxAge: 35,
    militaryRequired: false,
    qualificationCodes: ['4001'],
    evaluationMethod: 'KPSS Puan Sıralaması',
    isInterviewFree: true,
    requirementsSummary: 'Lisans mezunu, KPSS P3 en az 80 puan.',
  },
  {
    id: 'pos-2',
    announcementId: 'sbb-live-1',
    title: 'Mühendis',
    unvan: 'Bilgisayar Mühendisi',
    city: 'İSTANBUL',
    district: 'BEŞİKTAŞ',
    quota: 5,
    educationLevel: 'lisans',
    kpssScoreType: 'P3',
    minKpssScore: 75,
    maxAge: null,
    militaryRequired: true,
    qualificationCodes: ['4531'],
    evaluationMethod: 'Sözlü Sınav',
    isInterviewFree: false,
    requirementsSummary: 'Bilgisayar Mühendisliği mezunu.',
  },
];

const SAMPLE_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'sbb-live-1',
    externalId: 'SBB-LIVE-1',
    source: 'sbb',
    sourceName: 'SBB Kamu İlan',
    sourceUrl: 'https://kamuilan.sbb.gov.tr/ilan/1',
    applyUrl: 'https://isealimkariyerkapisi.cbiko.gov.tr/basvuru/1',
    institution: 'T.C. Hazine ve Maliye Bakanlığı',
    organizationUnit: 'Personel Genel Müdürlüğü',
    title: '4/B Sözleşmeli Uzman ve Mühendis Alımı',
    category: 'personel_alimi',
    city: 'ANKARA',
    status: 'acik',
    publishedAt: '2026-11-24',
    deadlineAt: '2026-12-18',
    quota: 15,
    summary: 'Mülakatsız KPSS sıralaması ile sözleşmeli alım.',
    employmentType: 'sozlesmeli_4b',
    examType: 'kpss_only',
    noticeType: 'ilan',
    positionsCount: 2,
    verifiedSources: [
      { source: 'kariyer_kapisi', sourceName: 'Kariyer Kapısı', url: 'https://kariyerkapisi.gov.tr/1' },
      { source: 'sbb', sourceName: 'SBB Kamu İlan', url: 'https://kamuilan.sbb.gov.tr/ilan/1' },
    ],
    criteria: {
      educationLevels: ['lisans'],
      kpssScoreTypes: ['P3'],
      minKpssScore: 80,
      cities: ['ANKARA', 'İSTANBUL'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: ['4001', '4531'],
      summaryLines: ['2026 KPSS P3 puanından en az 80 almış olmak'],
    },
  },
  {
    id: 'kk-iptal-2',
    externalId: 'KK-IPTAL-2',
    source: 'kariyer_kapisi',
    sourceName: 'Kariyer Kapısı',
    sourceUrl: 'https://kariyerkapisi.gov.tr/ilan/2',
    institution: 'T.C. Tarım ve Orman Bakanlığı',
    title: 'Taşra Teşkilatı Memur Alımı İptal Duyurusu',
    category: 'atama',
    city: 'İZMİR',
    status: 'acik',
    publishedAt: '2026-11-25',
    deadlineAt: '2026-12-20',
    quota: 40,
    summary: 'İlan iptal edilmiştir.',
    employmentType: 'memur_b',
    examType: 'oral_exam',
    noticeType: 'iptal',
    positionsCount: 0,
    criteria: {
      educationLevels: ['lisans'],
      kpssScoreTypes: ['P3'],
      minKpssScore: 70,
      cities: ['İZMİR'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: ['4001'],
      summaryLines: ['İptal duyurusudur.'],
    },
  },
  {
    id: 'sbb-acad-3',
    externalId: 'SBB-ACAD-3',
    source: 'sbb',
    sourceName: 'SBB Kamu İlan',
    sourceUrl: 'https://kamuilan.sbb.gov.tr/ilan/3',
    institution: 'Ankara Üniversitesi',
    title: 'Öğretim Görevlisi Alım İlanı',
    category: 'personel_alimi',
    city: 'ANKARA',
    status: 'acik',
    publishedAt: '2026-11-26',
    deadlineAt: '2026-12-25',
    quota: 4,
    summary: 'Akademik personel alımı.',
    employmentType: 'akademik',
    examType: 'written_and_oral',
    noticeType: 'ilan',
    positionsCount: 0,
    criteria: {
      educationLevels: ['lisans'],
      kpssScoreTypes: [],
      minKpssScore: null,
      cities: ['ANKARA'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: [],
      summaryLines: ['ALES ve YDS şartı aranmaktadır.'],
    },
  },
];

describe('Kamu Bildirim Sepeti Phase 7 Premium UI Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = 'light';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders freshness strip, sbb source badge, multi-source & iptal badges, taxonomy tabs, and Mülakatsız filter', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/announcements?': () =>
          new Response(
            JSON.stringify({
              items: SAMPLE_ANNOUNCEMENTS,
              total: SAMPLE_ANNOUNCEMENTS.length,
              limited: false,
              limit: null,
              plan: 'premium',
              freshness: {
                lastCheckedAt: '2026-11-26T16:15:00.000Z',
                checkpoints: [
                  {
                    source: 'kariyer_kapisi',
                    etag: null,
                    lastModified: null,
                    bodyHash: null,
                    lastCheckedAt: '2026-11-26T16:15:00.000Z',
                    lastChangedAt: null,
                    activeCount: 12,
                    lastError: null,
                  },
                  {
                    source: 'sbb',
                    etag: null,
                    lastModified: null,
                    bodyHash: null,
                    lastCheckedAt: '2026-11-26T16:15:00.000Z',
                    lastChangedAt: null,
                    activeCount: 8,
                    lastError: null,
                  },
                ],
              },
            }),
            { status: 200 }
          ),
        '/api/auth/me': () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
      })
    );

    render(<AnnouncementFeed initialAnnouncements={SAMPLE_ANNOUNCEMENTS} />);

    await waitFor(() => {
      expect(screen.getByText(/5 dk otomatik senkronizasyon/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Kariyer Kapısı: 12/i)).toBeInTheDocument();
    expect(screen.getByText(/SBB Kamu İlan: 8/i)).toBeInTheDocument();
    expect(screen.getByText(/Kariyer Kapısı \+ SBB Kamu İlan/i)).toBeInTheDocument();
    expect(screen.getByText(/İptal İlanı/i)).toBeInTheDocument();
    expect(screen.getByText(/2 Alt Kadro/i)).toBeInTheDocument();

    // Taxonomy filter: Akademik
    fireEvent.click(screen.getByRole('button', { name: /Akademik/i }));
    expect(screen.getByText(/Öğretim Görevlisi Alım İlanı/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/4\/B Sözleşmeli Uzman ve Mühendis Alımı/i)
    ).not.toBeInTheDocument();

    // Reset to Tümü and toggle Mülakatsız (KPSS)
    fireEvent.click(screen.getByRole('button', { name: /Tümü \(3\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Mülakatsız \(KPSS\)/i }));
    expect(screen.getByText(/4\/B Sözleşmeli Uzman ve Mühendis Alımı/i)).toBeInTheDocument();
    expect(screen.queryByText(/Öğretim Görevlisi Alım İlanı/i)).not.toBeInTheDocument();
  });

  it('saves current search alarm via POST /api/saved-searches and renders drawer sub-positions lazily', async () => {
    const savedSearchSpy = vi.fn();
    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/announcements/sbb-live-1': () =>
          new Response(
            JSON.stringify({
              announcement: { ...SAMPLE_ANNOUNCEMENTS[0], positions: SAMPLE_POSITIONS },
              positions: SAMPLE_POSITIONS,
              saved: false,
              match: null,
              canUseProfileMatch: false,
              plan: 'premium',
            }),
            { status: 200 }
          ),
        '/api/announcements?': () =>
          new Response(JSON.stringify({ items: SAMPLE_ANNOUNCEMENTS }), { status: 200 }),
        '/api/auth/me': () =>
          new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: 'u1', email: 'aday@test.tr', plan: 'premium' },
            }),
            { status: 200 }
          ),
        '/api/saved-searches': (_url, init) => {
          savedSearchSpy(init?.body);
          return new Response(
            JSON.stringify({
              search: {
                id: 'ss-1',
                userId: 'u1',
                name: 'Mülakatsız KPSS',
                filters: { examType: 'kpss_only' },
                notifyPush: true,
                notifyEmail: true,
                createdAt: '2026-11-26T16:00:00.000Z',
              },
            }),
            { status: 201 }
          );
        },
        '/api/saved': () =>
          new Response(JSON.stringify({ items: [], savedIds: [] }), { status: 200 }),
      })
    );

    render(<AnnouncementFeed initialAnnouncements={SAMPLE_ANNOUNCEMENTS} />);

    // Toggle Mülakatsız and click Bu Aramayı Alarm Yap
    fireEvent.click(screen.getByRole('button', { name: /Mülakatsız \(KPSS\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /Bu Aramayı Alarm Yap/i }));

    await waitFor(() => {
      expect(savedSearchSpy).toHaveBeenCalled();
      expect(screen.getByText(/için arama alarmı oluşturuldu/i)).toBeInTheDocument();
    });

    // Open Şart Özeti drawer and verify lazy positions + applyUrl
    const drawerBtns = screen.getAllByRole('button', { name: /Şart Özeti/i });
    fireEvent.click(drawerBtns[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Alt Kadrolar \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Uzman Yardımcısı/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Resmî Başvuru \/ e-Devlet/i })).toHaveAttribute(
      'href',
      SAMPLE_ANNOUNCEMENTS[0].applyUrl
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays position-level match stats on Bana Uygun tab', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/announcements/matched': () =>
          new Response(
            JSON.stringify({
              locked: false,
              totalMatches: 1,
              items: [
                {
                  announcement: SAMPLE_ANNOUNCEMENTS[0],
                  evaluation: {
                    announcementId: 'sbb-live-1',
                    eligible: true,
                    matchScore: 95,
                    matchedReasons: ['KPSS P3 puanı uygun'],
                    missingReasons: [],
                    unknownReasons: [],
                    matchedPositionCount: 1,
                    totalPositionCount: 2,
                    scoreMargin: 4.5,
                  },
                },
              ],
            }),
            { status: 200 }
          ),
        '/api/announcements?': () =>
          new Response(JSON.stringify({ items: SAMPLE_ANNOUNCEMENTS }), { status: 200 }),
        '/api/auth/me': () =>
          new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: 'u1', email: 'aday@test.tr', plan: 'premium' },
            }),
            { status: 200 }
          ),
        '/api/saved': () =>
          new Response(JSON.stringify({ items: [], savedIds: [] }), { status: 200 }),
      })
    );

    render(<AnnouncementFeed initialAnnouncements={SAMPLE_ANNOUNCEMENTS} />);
    fireEvent.click(screen.getByRole('tab', { name: /Bana Uygun/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2 Alt Kadro Uygun/i)).toBeInTheDocument();
      expect(screen.getByText(/KPSS Farkı: \+4\.5/i)).toBeInTheDocument();
    });
  });

  it('renders positions table, verified sources, applyUrl, and position match in AnnouncementDetailClient', async () => {
    const detailedAnnouncement: Announcement = {
      ...SAMPLE_ANNOUNCEMENTS[0],
      positions: SAMPLE_POSITIONS,
    };

    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/auth/me': () =>
          new Response(
            JSON.stringify({ authenticated: true, user: { id: 'u1', email: 'aday@test.tr' } }),
            { status: 200 }
          ),
        [`/api/announcements/${detailedAnnouncement.id}`]: () =>
          new Response(
            JSON.stringify({
              announcement: detailedAnnouncement,
              positions: SAMPLE_POSITIONS,
              saved: false,
              canUseProfileMatch: true,
              plan: 'premium',
              match: {
                announcementId: detailedAnnouncement.id,
                eligible: true,
                matchScore: 92,
                matchedReasons: ['KPSS P3 puanı uygun'],
                missingReasons: [],
                unknownReasons: [],
                matchedPositionCount: 1,
                totalPositionCount: 2,
                scoreMargin: 5.2,
                matchedPositions: [
                  {
                    id: 'pos-1',
                    title: 'Uzman Yardımcısı',
                    city: 'ANKARA',
                    quota: 10,
                    scoreMargin: 5.2,
                    eligible: true,
                    missingReasons: [],
                  },
                ],
              },
            }),
            { status: 200 }
          ),
      })
    );

    render(<AnnouncementDetailClient announcement={detailedAnnouncement} />);

    expect(
      screen.getByText(/Alt Kadrolar ve Pozisyon Dağılımı \(2\)/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Hazine ve Maliye Uzman Yardımcısı/i)).toBeInTheDocument();
    expect(screen.getByText(/Çoklu Resmî Kaynak Doğrulaması \(2 Kaynak\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Resmî Başvuru \/ e-Devlet/i })).toHaveAttribute(
      'href',
      detailedAnnouncement.applyUrl
    );
    expect(screen.getByRole('link', { name: /Resmî İlan Metnine Git/i })).toHaveAttribute(
      'href',
      detailedAnnouncement.sourceUrl
    );

    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2 Alt Kadro Uygun/i)).toBeInTheDocument();
      expect(screen.getByText(/Kadro Bazlı Değerlendirme/i)).toBeInTheDocument();
    });
  });

  it('renders saved searches with delete and source checkpoints in AyarlarPage', async () => {
    const deleteSearchSpy = vi.fn();

    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/auth/me': () =>
          new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: 'u1', email: 'aday@test.tr', plan: 'premium', emailVerifiedAt: null },
            }),
            { status: 200 }
          ),
        '/api/notifications/preferences': () =>
          new Response(
            JSON.stringify({
              preferences: {
                emailEnabled: true,
                instantNewAnnouncements: true,
                deadlineRemindersEnabled: true,
                reminderDaysBefore: 3,
                onlyMatchingProfile: true,
              },
            }),
            { status: 200 }
          ),
        '/api/billing': () =>
          new Response(JSON.stringify({ entitlements: { plan: 'premium' } }), { status: 200 }),
        '/api/sync/status': () =>
          new Response(
            JSON.stringify({
              lastRun: null,
              runs: [],
              checkpoints: [
                {
                  source: 'sbb',
                  etag: null,
                  lastModified: null,
                  bodyHash: null,
                  lastCheckedAt: '2026-11-26T16:10:00.000Z',
                  lastChangedAt: null,
                  activeCount: 14,
                  lastError: null,
                },
                {
                  source: 'kariyer_kapisi',
                  etag: null,
                  lastModified: null,
                  bodyHash: null,
                  lastCheckedAt: '2026-11-26T16:10:00.000Z',
                  lastChangedAt: null,
                  activeCount: 22,
                  lastError: null,
                },
              ],
            }),
            { status: 200 }
          ),
        '/api/saved-searches': (_url, init) => {
          if (init?.method === 'DELETE') {
            deleteSearchSpy();
            return new Response(JSON.stringify({ deleted: true }), { status: 200 });
          }
          return new Response(
            JSON.stringify({
              searches: [
                {
                  id: 'search-ankara-1',
                  userId: 'u1',
                  name: 'Ankara Mülakatsız',
                  filters: { city: 'ANKARA', examType: 'kpss_only' },
                  notifyPush: true,
                  notifyEmail: true,
                  createdAt: '2026-11-26T12:00:00.000Z',
                },
              ],
              count: 1,
            }),
            { status: 200 }
          );
        },
        '/api/push/vapid-key': () =>
          new Response(JSON.stringify({ configured: false, publicKey: null }), { status: 200 }),
        '/api/push/subscriptions': () =>
          new Response(JSON.stringify({ subscriptions: [] }), { status: 200 }),
      })
    );

    render(<AyarlarPage />);

    await waitFor(() => {
      expect(screen.getByText(/Kayıtlı Arama Alarmlarım/i)).toBeInTheDocument();
      expect(screen.getByText(/Ankara Mülakatsız/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Kaynak Bazlı Tazelik Kontrolleri/i)).toBeInTheDocument();
    expect(screen.getByText(/SBB Kamu İlan/i)).toBeInTheDocument();
    expect(screen.getByText(/14 aktif ilan/i)).toBeInTheDocument();
    expect(screen.getByText(/22 aktif ilan/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ankara Mülakatsız alarmını sil/i }));
    await waitFor(() => {
      expect(deleteSearchSpy).toHaveBeenCalled();
      expect(screen.getByText(/Kayıtlı arama alarmı silindi/i)).toBeInTheDocument();
    });
  });

  it('resolves kamuilan-sbb source landing data and page cleanly', async () => {
    const landing = getSourceLandingData('kamuilan-sbb', SAMPLE_ANNOUNCEMENTS);
    expect(landing).not.toBeNull();
    expect(landing?.source).toBe('sbb');
    expect(landing?.sourceName).toBe('SBB Kamu İlan');
    expect(landing?.announcements).toHaveLength(2);

    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/auth/me': () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
      })
    );

    const meta = await generateKaynakMetadata({
      params: Promise.resolve({ slug: 'kamuilan-sbb' }),
    });
    expect(String(meta.title)).toContain('SBB Kamu İlan');
    expect(meta.alternates?.canonical).toBe('/kaynak/kamuilan-sbb');

    const ui = await KaynakLandingPage({ params: Promise.resolve({ slug: 'kamuilan-sbb' }) });
    render(ui);
    expect(
      screen.getByRole('heading', { level: 1, name: /SBB Kamu İlan İlanları/i })
    ).toBeInTheDocument();
  });
});
