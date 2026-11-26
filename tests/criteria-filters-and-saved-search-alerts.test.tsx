import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GET as getAnnouncementsHandler } from '@/app/api/announcements/route';
import { GET as getCronIngestHandler } from '@/app/api/cron/ingest/route';
import { POST as postSavedSearchHandler } from '@/app/api/saved-searches/route';
import AnnouncementDetailClient from '@/components/AnnouncementDetailClient';
import AnnouncementFeed from '@/components/AnnouncementFeed';
import {
  enrichAnnouncementFromPdfText,
  filterAnnouncements,
  type Announcement,
} from '@/modules/announcements';
import {
  matchesSavedSearchFilters,
  savedSearchFiltersToAnnouncementFilter,
} from '@/modules/announcements/service';
import { changeUserPlan } from '@/modules/billing';
import { resetMemoryDb } from '@/modules/db';
import { registerUser } from '@/modules/identity';
import {
  dispatchPushForNewAnnouncements,
  InMemoryWebPushAdapter,
  subscribeUserPush,
} from '@/modules/push';
import {
  dispatchNewAnnouncementAlerts,
  InMemoryEmailAdapter,
  updateNotificationPreferences,
} from '@/modules/tracking';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

const BOZKOY_OCR_TEXT = `
T.C.
NİĞDE İLİ
BOZKÖY BELEDİYE BAŞKANLIĞI
İLK DEFA ATANMAK ÜZERE İTFAİYE ERİ ALIM İLANI

Kadro Bilgileri:
Unvanı: İtfaiye Eri | Sınıfı: GİH | Derecesi: 10 | Adedi: 1 | Cinsiyeti: Kadın/Erkek
Niteliği: Lisans düzeyinde eğitim veren yükseköğretim kurumlarının Egzersiz ve Spor Bilimleri,
Spor Yöneticiliği, Antrenörlük Eğitimi programlarının birinden mezun olmak. En az (C) sınıfı
sürücü belgesine sahip olmak.
KPSS Puan Türü: P3 | KPSS Taban Puanı: En az 65 puan

BAŞVURU ÖZEL ŞARTLARI:
1- 2024 yılı KPSS (B) grubu sınavına girmiş ve P3 puan türünden En az 65 puan almış olmak.
2- Sınavın yapıldığı tarihte 30 yaşını doldurmamış olmak.
3- En az (C) sınıfı sürücü belgesine sahip olmak.
4- Askerlikle ilişiği bulunmamak.
5- Sözlü ve uygulamalı sınav yapılacaktır.
Başvuru adresi: www.bozkoy.bel.tr
`;

function buildEnrichedBozkoyAnnouncement(): Announcement {
  const base: Announcement = {
    id: 'iskur-bozkoy-itfaiye-filter-1',
    externalId: 'ISKUR-BOZKOY-FILTER-1',
    source: 'iskur',
    sourceName: 'İŞKUR',
    sourceUrl: 'https://www.iskur.gov.tr/medya/bozkoy-itfaiye.pdf',
    institution: 'Bozköy Belediye Başkanlığı',
    title: 'İtfaiye Eri Alım İlanı',
    category: 'personel_alimi',
    city: 'TÜRKİYE GENELİ',
    status: 'acik',
    publishedAt: '2026-11-24',
    deadlineAt: '2099-12-15',
    quota: null,
    summary: 'Bozköy Belediye Başkanlığı İtfaiye Eri alım ilanı.',
    employmentType: 'memur_b',
    enrichmentStatus: 'pending',
    isDemo: false,
    criteria: {
      educationLevels: [],
      kpssScoreTypes: [],
      minKpssScore: null,
      cities: ['TÜRKİYE GENELİ'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: ['İlk Yardım Sertifikası'],
      qualificationCodes: [],
      summaryLines: [],
    },
  };
  return enrichAnnouncementFromPdfText(base, BOZKOY_OCR_TEXT);
}

function buildOnlisansAnnouncement(): Announcement {
  return {
    id: 'sbb-onlisans-2',
    externalId: 'SBB-ONLISANS-2',
    source: 'sbb',
    sourceName: 'SBB Kamu İlan',
    sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=abc123',
    institution: 'Konya Büyükşehir Belediyesi',
    title: '4/B Sözleşmeli Tekniker Alımı',
    category: 'personel_alimi',
    city: 'KONYA',
    status: 'acik',
    publishedAt: '2026-11-25',
    deadlineAt: '2099-12-20',
    quota: 4,
    summary: 'Ön lisans P93 puanı ile B sınıfı ehliyetli tekniker alımı.',
    employmentType: 'sozlesmeli_4b',
    examType: 'kpss_only',
    noticeType: 'ilan',
    enrichmentStatus: 'partial',
    isDemo: false,
    criteria: {
      educationLevels: ['onlisans'],
      kpssScoreTypes: ['P93'],
      minKpssScore: 75,
      cities: ['KONYA'],
      militaryRequired: false,
      driverLicenses: ['B'],
      certificates: [],
      qualificationCodes: ['3249'],
      summaryLines: ['Ön lisans KPSS P93 en az 75 puan', 'B sınıfı sürücü belgesi'],
      departments: ['Bilgisayar Programcılığı'],
    },
    positions: [
      {
        id: 'sbb-onlisans-2-pos-1',
        announcementId: 'sbb-onlisans-2',
        title: 'Bilgisayar Teknikeri',
        unvan: 'Tekniker',
        city: 'KONYA',
        district: null,
        quota: 4,
        educationLevel: 'onlisans',
        kpssScoreType: 'P93',
        minKpssScore: 75,
        maxAge: null,
        militaryRequired: false,
        qualificationCodes: ['3249'],
        evaluationMethod: 'KPSS Puan Sıralaması',
        isInterviewFree: true,
        requirementsSummary: 'Bilgisayar Programcılığı ön lisans mezunu, P93 >= 75',
      },
    ],
    positionsCount: 1,
  };
}

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

describe('Criteria filters & saved-search filter helpers', () => {
  const bozkoy = buildEnrichedBozkoyAnnouncement();
  const onlisans = buildOnlisansAnnouncement();
  const dataset = [bozkoy, onlisans];

  it('filters enriched Bozköy fixture by educationLevel, kpssScoreType, maxKpssScore, driverLicense, department, and q', () => {
    expect(filterAnnouncements(dataset, { educationLevel: 'lisans' }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
    expect(filterAnnouncements(dataset, { educationLevel: 'onlisans' }).map((a) => a.id)).toEqual([
      onlisans.id,
    ]);
    expect(filterAnnouncements(dataset, { educationLevel: 'ortaogretim' })).toEqual([]);

    expect(filterAnnouncements(dataset, { kpssScoreType: 'P3' }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
    expect(filterAnnouncements(dataset, { kpssScoreType: 'P93' }).map((a) => a.id)).toEqual([
      onlisans.id,
    ]);

    expect(filterAnnouncements(dataset, { maxKpssScore: 70 }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
    expect(filterAnnouncements(dataset, { maxKpssScore: 65 }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
    expect(filterAnnouncements(dataset, { maxKpssScore: 60 })).toEqual([]);
    expect(filterAnnouncements(dataset, { maxKpssScore: 80 }).map((a) => a.id)).toEqual([
      bozkoy.id,
      onlisans.id,
    ]);

    expect(filterAnnouncements(dataset, { driverLicense: 'C' }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
    expect(filterAnnouncements(dataset, { driverLicense: 'c' }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
    expect(filterAnnouncements(dataset, { driverLicense: 'D' })).toEqual([]);

    expect(
      filterAnnouncements(dataset, { department: 'Spor Yöneticiliği' }).map((a) => a.id),
    ).toEqual([bozkoy.id]);
    expect(
      filterAnnouncements(dataset, { department: 'Bilgisayar Mühendisliği' }),
    ).toEqual([]);

    expect(filterAnnouncements(dataset, { q: 'Antrenörlük' }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
    expect(filterAnnouncements(dataset, { q: '2024 yılı' }).map((a) => a.id)).toEqual([
      bozkoy.id,
    ]);
  });

  it('converts SavedSearchFilters and evaluates memur_ab + maxKpssScore cleanly', () => {
    const converted = savedSearchFiltersToAnnouncementFilter({
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      maxKpssScore: '68.5',
      driverLicense: 'C',
      department: 'Spor Yöneticiliği',
      employmentType: 'memur_ab',
    });
    expect(converted.maxKpssScore).toBe(68.5);
    expect(converted.employmentType).toBeUndefined();

    expect(
      matchesSavedSearchFilters(bozkoy, {
        employmentType: 'memur_ab',
        educationLevel: 'lisans',
        kpssScoreType: 'P3',
        maxKpssScore: '70',
        driverLicense: 'C',
      }),
    ).toBe(true);
    expect(matchesSavedSearchFilters(onlisans, { employmentType: 'memur_ab' })).toBe(false);
    expect(matchesSavedSearchFilters(bozkoy, { maxKpssScore: '60' })).toBe(false);
  });
});

describe('API routes: /api/cron/ingest GET, /api/announcements criteria params, /api/saved-searches', () => {
  beforeEach(() => {
    resetMemoryDb();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('enforces CRON_SECRET on GET /api/cron/ingest and returns only enriched live IDs', async () => {
    vi.stubEnv('CRON_SECRET', 'test-ingest-secret');
    const db = resetMemoryDb();
    const bozkoy = buildEnrichedBozkoyAnnouncement();
    const onlisans = buildOnlisansAnnouncement();
    await db.upsertAnnouncements([bozkoy, onlisans]);

    const unauthorized = await getCronIngestHandler(
      new Request('http://localhost/api/cron/ingest', { method: 'GET' }),
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await getCronIngestHandler(
      new Request('http://localhost/api/cron/ingest', {
        method: 'GET',
        headers: { authorization: 'Bearer test-ingest-secret' },
      }),
    );
    expect(authorized.status).toBe(200);
    const body = (await authorized.json()) as { enrichedIds: string[]; total: number };
    expect(body).toEqual({
      enrichedIds: [bozkoy.id],
      total: 1,
    });
  });

  it('filters GET /api/announcements by criteria query params and persists criteria in POST /api/saved-searches', async () => {
    const db = resetMemoryDb();
    const bozkoy = buildEnrichedBozkoyAnnouncement();
    const onlisans = buildOnlisansAnnouncement();
    await db.upsertAnnouncements([bozkoy, onlisans]);

    const annRes = await getAnnouncementsHandler(
      new Request(
        'http://localhost/api/announcements?status=acik&educationLevel=lisans&kpssScoreType=P3&maxKpssScore=70&driverLicense=C&department=Spor%20Y%C3%B6neticili%C4%9Fi',
      ),
    );
    expect(annRes.status).toBe(200);
    const annBody = (await annRes.json()) as { items: Announcement[]; total: number };
    expect(annBody.total).toBe(1);
    expect(annBody.items[0].id).toBe(bozkoy.id);

    const { token } = await registerUser(db, {
      email: 'saved-filter@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    const ssRes = await postSavedSearchHandler(
      new Request('http://localhost/api/saved-searches', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `kbs_session=${token}`,
        },
        body: JSON.stringify({
          name: 'Lisans P3 C Ehliyet',
          filters: {
            educationLevel: 'lisans',
            kpssScoreType: 'P3',
            maxKpssScore: '70',
            driverLicense: 'C',
            department: 'Spor Yöneticiliği',
          },
          notifyEmail: true,
          notifyPush: true,
        }),
      }),
    );
    expect(ssRes.status).toBe(201);
    const ssBody = (await ssRes.json()) as { search: { filters: Record<string, string> } };
    expect(ssBody.search.filters).toEqual({
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      maxKpssScore: '70',
      driverLicense: 'C',
      department: 'Spor Yöneticiliği',
    });
  });
});

describe('Saved-search email & Web Push alert dispatch with deduplication', () => {
  beforeEach(() => {
    resetMemoryDb();
  });

  it('dispatches email and Web Push notifications for matching saved searches and deduplicates repeat runs', async () => {
    const db = resetMemoryDb();
    const bozkoy = buildEnrichedBozkoyAnnouncement();
    const onlisans = buildOnlisansAnnouncement();

    const { user: premiumUser } = await registerUser(db, {
      email: 'premium-alarm@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    const { user: freeUser } = await registerUser(db, {
      email: 'free-alarm@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    await changeUserPlan(db, premiumUser.id, 'premium');
    await updateNotificationPreferences(db, premiumUser.id, {
      emailEnabled: true,
      instantNewAnnouncements: false,
      onlyMatchingProfile: true,
    });
    await updateNotificationPreferences(db, freeUser.id, {
      emailEnabled: true,
      instantNewAnnouncements: false,
    });

    const search = await db.createSavedSearch({
      id: 'ss-bozkoy-1',
      userId: premiumUser.id,
      name: 'İtfaiye C Ehliyet Alarmı',
      filters: {
        educationLevel: 'lisans',
        kpssScoreType: 'P3',
        maxKpssScore: '70',
        driverLicense: 'C',
      },
      notifyEmail: true,
      notifyPush: true,
      createdAt: '2026-11-26T00:00:00.000Z',
    });
    await db.createSavedSearch({
      id: 'ss-free-1',
      userId: freeUser.id,
      name: 'Ücretsiz Alarm',
      filters: { educationLevel: 'lisans' },
      notifyEmail: true,
      notifyPush: true,
      createdAt: '2026-11-26T00:00:00.000Z',
    });

    await subscribeUserPush(db, premiumUser.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/saved-search-sub-1',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
    await subscribeUserPush(db, freeUser.id, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/free-sub-1',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });

    const emailAdapter = new InMemoryEmailAdapter();
    const pushAdapter = new InMemoryWebPushAdapter();

    const firstEmail = await dispatchNewAnnouncementAlerts(db, [bozkoy, onlisans], emailAdapter);
    expect(firstEmail.sentCount).toBe(1);
    expect(emailAdapter.sent).toHaveLength(1);
    expect(emailAdapter.sent[0].to).toBe('premium-alarm@example.com');
    expect(emailAdapter.sent[0].subject).toContain(search.name);
    expect(
      await db.hasReminderLog(premiumUser.id, bozkoy.id, `saved_search:${search.id}`),
    ).toBe(true);

    const repeatEmail = await dispatchNewAnnouncementAlerts(db, [bozkoy, onlisans], emailAdapter);
    expect(repeatEmail.sentCount).toBe(0);
    expect(emailAdapter.sent).toHaveLength(1);

    const firstPush = await dispatchPushForNewAnnouncements(db, [bozkoy, onlisans], pushAdapter);
    expect(firstPush.sentCount).toBe(1);
    expect(pushAdapter.sent).toHaveLength(1);
    expect(pushAdapter.sent[0].payload.title).toContain(search.name);
    expect(pushAdapter.sent[0].payload.url).toBe(`/ilan/${bozkoy.id}`);
    expect(
      await db.hasReminderLog(premiumUser.id, bozkoy.id, `push_saved_search:${search.id}`),
    ).toBe(true);

    const repeatPush = await dispatchPushForNewAnnouncements(db, [bozkoy, onlisans], pushAdapter);
    expect(repeatPush.sentCount).toBe(0);
    expect(pushAdapter.sent).toHaveLength(1);
  });
});

describe('UI: AnnouncementFeed criteria filters & AnnouncementDetailClient PDF criteria UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters feed by Öğrenim Düzeyi, KPSS Puan Türü, KPSS Puanım, Ehliyet and sends criteria on alarm save', async () => {
    const bozkoy = buildEnrichedBozkoyAnnouncement();
    const onlisans = buildOnlisansAnnouncement();
    const savedSearchPayloads: Array<Record<string, unknown>> = [];

    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/announcements?': () =>
          new Response(JSON.stringify({ items: [bozkoy, onlisans] }), { status: 200 }),
        '/api/auth/me': () =>
          new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: 'u1', email: 'aday@test.tr', plan: 'premium' },
            }),
            { status: 200 },
          ),
        '/api/saved-searches': (_url, init) => {
          if (typeof init?.body === 'string') {
            savedSearchPayloads.push(JSON.parse(init.body) as Record<string, unknown>);
          }
          return new Response(
            JSON.stringify({
              search: {
                id: 'ss-ui-1',
                userId: 'u1',
                name: 'Lisans / P3 / KPSS 70 / C Ehliyet',
                filters: {},
                notifyPush: true,
                notifyEmail: true,
                createdAt: '2026-11-26T00:00:00.000Z',
              },
            }),
            { status: 201 },
          );
        },
        '/api/saved': () =>
          new Response(JSON.stringify({ items: [], savedIds: [] }), { status: 200 }),
      }),
    );

    render(<AnnouncementFeed initialAnnouncements={[bozkoy, onlisans]} />);

    // Extracted criteria tags visible on cards
    expect(screen.getByText('P3 >= 65')).toBeInTheDocument();
    expect(screen.getByText('C Ehliyet')).toBeInTheDocument();
    expect(screen.getByText(/Egzersiz ve Spor Bilimleri/i)).toBeInTheDocument();

    // Filter by Öğrenim Düzeyi = lisans, KPSS = P3, score = 70, Ehliyet = C
    fireEvent.change(screen.getByLabelText('Öğrenim Düzeyi'), { target: { value: 'lisans' } });
    fireEvent.change(screen.getByLabelText('KPSS Puan Türü'), { target: { value: 'P3' } });
    fireEvent.change(screen.getByLabelText('KPSS Puanım'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('Ehliyet'), { target: { value: 'C' } });

    expect(screen.getByText('İtfaiye Eri Alım İlanı')).toBeInTheDocument();
    expect(screen.queryByText('4/B Sözleşmeli Tekniker Alımı')).not.toBeInTheDocument();

    // Save alarm carries new criteria keys
    fireEvent.click(screen.getByRole('button', { name: /Bu Aramayı Alarm Yap/i }));
    await waitFor(() => {
      expect(savedSearchPayloads).toHaveLength(1);
    });
    expect(savedSearchPayloads[0].filters).toMatchObject({
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      maxKpssScore: '70',
      driverLicense: 'C',
    });

    // Lowering KPSS score to 60 filters Bozköy out
    fireEvent.change(screen.getByLabelText('KPSS Puanım'), { target: { value: '60' } });
    expect(screen.queryByText('İtfaiye Eri Alım İlanı')).not.toBeInTheDocument();

    // Reset restores both items
    fireEvent.click(screen.getByRole('button', { name: 'Sıfırla' }));
    expect(screen.getByText('İtfaiye Eri Alım İlanı')).toBeInTheDocument();
    expect(screen.getByText('4/B Sözleşmeli Tekniker Alımı')).toBeInTheDocument();
  });

  it('renders extracted departments, driver license, certificates, age, gender, and PDF excerpt in AnnouncementDetailClient', async () => {
    const bozkoy = buildEnrichedBozkoyAnnouncement();

    vi.stubGlobal(
      'fetch',
      mockFetchImplementation({
        '/api/auth/me': () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        [`/api/announcements/${bozkoy.id}`]: () =>
          new Response(
            JSON.stringify({
              announcement: bozkoy,
              positions: bozkoy.positions ?? [],
              saved: false,
              match: null,
              canUseProfileMatch: false,
            }),
            { status: 200 },
          ),
      }),
    );

    render(<AnnouncementDetailClient announcement={bozkoy} />);

    expect(screen.getByText('Aranan Bölümler')).toBeInTheDocument();
    expect(screen.getByText('Egzersiz ve Spor Bilimleri')).toBeInTheDocument();
    expect(screen.getByText('Spor Yöneticiliği')).toBeInTheDocument();
    expect(screen.getByText('Antrenörlük Eğitimi')).toBeInTheDocument();
    expect(screen.getByText('Sürücü Belgesi')).toBeInTheDocument();
    expect(screen.getByText('C Sınıfı')).toBeInTheDocument();
    expect(screen.getByText('Sertifika / Belgeler')).toBeInTheDocument();
    expect(screen.getByText('İlk Yardım Sertifikası')).toBeInTheDocument();
    expect(screen.getByText('Yaş Sınırı')).toBeInTheDocument();
    expect(screen.getByText('En fazla 30 yaş')).toBeInTheDocument();
    expect(screen.getByText('Cinsiyet')).toBeInTheDocument();
    expect(screen.getByText('Kadın / Erkek')).toBeInTheDocument();

    const pdfSummary = screen.getByText('Resmî İlan PDF Metninden Çıkarılan Şartlar');
    expect(pdfSummary).toBeInTheDocument();
    expect(pdfSummary.closest('details')).not.toBeNull();
    expect(screen.getByText(/BOZKÖY BELEDİYE BAŞKANLIĞI/i)).toBeInTheDocument();
  });
});
