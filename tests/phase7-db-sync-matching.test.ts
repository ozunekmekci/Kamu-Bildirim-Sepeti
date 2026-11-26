import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getAnnouncementByIdHandler } from '@/app/api/announcements/[id]/route';
import { GET as getAnnouncementsHandler } from '@/app/api/announcements/route';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { POST as cronIngestHandler } from '@/app/api/cron/ingest/route';
import { POST as cronSyncHandler } from '@/app/api/cron/sync/route';
import {
  DELETE as deleteSavedSearchHandler,
  GET as getSavedSearchesHandler,
  POST as createSavedSearchHandler,
} from '@/app/api/saved-searches/route';
import { GET as syncStatusHandler } from '@/app/api/sync/status/route';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements';
import {
  enrichAnnouncementOnDemand,
  syncOfficialSourcesV2,
} from '@/modules/announcements/service';
import type { Announcement, AnnouncementPosition } from '@/modules/announcements/types';
import { D1Adapter, MemoryDbAdapter, resetMemoryDb } from '@/modules/db';
import type { D1DatabaseLike, D1PreparedStatementLike } from '@/modules/db/d1-adapter';
import { registerUser } from '@/modules/identity';
import { evaluateAnnouncementMatch, type MatchingProfileInput } from '@/modules/matching';

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/kbs_session=([^;]+)/);
  return match ? `kbs_session=${match[1]}` : '';
}

function jsonRequest(url: string, method: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (cookie) {
    headers.Cookie = cookie;
  }
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeLiveAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'kariyer_kapisi-kariyer_kapisi-guid-live-1',
    externalId: 'KARIYER_KAPISI-guid-live-1',
    source: 'kariyer_kapisi',
    sourceName: 'Kariyer Kapısı',
    sourceUrl: 'https://kariyerkapisi.gov.tr/IlanDetay?i=guid-live-1',
    institution: 'T.C. Hazine ve Maliye Bakanlığı',
    title: '657/4B Sözleşmeli Bilişim Personeli Alımı',
    category: 'personel_alimi',
    city: 'ANKARA',
    status: 'acik',
    publishedAt: '2026-11-25',
    deadlineAt: '2026-12-20',
    quota: 15,
    summary: 'Merkez teşkilatı bilişim personeli alımı.',
    employmentType: 'sozlesmeli_4b',
    noticeType: 'ilan',
    examType: 'oral_exam',
    enrichmentStatus: 'pending',
    isDemo: false,
    criteria: {
      educationLevels: ['lisans'],
      kpssScoreTypes: ['P3'],
      minKpssScore: 70,
      cities: ['ANKARA'],
      militaryRequired: false,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: ['4531'],
      summaryLines: ['2026 KPSS P3 en az 70'],
    },
    ...overrides,
  };
}

describe('Phase 7 DB migrations, adapters, staged sync, matching v2, and API routes', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('applies SQLite migrations 0001..0004 cleanly with foreign_key_check=[] and cascade deletes', () => {
    const migrationsDir = join(process.cwd(), 'migrations');
    const pythonScript = `
import json, pathlib, sqlite3, sys
conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys = ON;")
for sql_file in sorted(pathlib.Path(sys.argv[1]).glob("*.sql")):
    conn.executescript(sql_file.read_text(encoding="utf-8"))

fk_errors = conn.execute("PRAGMA foreign_key_check;").fetchall()
assert fk_errors == [], f"FK errors: {fk_errors}"

cols = {r[1] for r in conn.execute("PRAGMA table_info(announcements);").fetchall()}
expected_cols = {
    "employment_type", "notice_type", "exam_type", "organization_unit",
    "apply_url", "verified_sources_json", "enrichment_status", "content_hash",
    "last_seen_at", "is_demo"
}
missing = expected_cols - cols
assert not missing, f"Missing columns: {missing}"

tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()}
assert {"announcement_positions", "source_checkpoints", "saved_searches"} <= tables

conn.execute("""
    INSERT INTO users (id, email, password_hash, accepted_terms_at, accepted_privacy_at, created_at, updated_at)
    VALUES ('u1', 'u1@example.com', 'hash', '2026-11-26', '2026-11-26', '2026-11-26', '2026-11-26')
""")
conn.execute("""
    INSERT INTO saved_searches (id, user_id, name, filters_json, created_at)
    VALUES ('ss1', 'u1', 'Ankara Memur', '{"city":"ANKARA"}', '2026-11-26')
""")
conn.execute("""
    INSERT INTO announcements (
        id, external_id, source, source_name, source_url, institution,
        title, category, city, status, published_at, deadline_at,
        quota, summary, criteria_json, created_at, updated_at
    ) VALUES (
        'a1', 'ext-1', 'kariyer_kapisi', 'Kariyer Kapisi', 'https://kariyerkapisi.gov.tr',
        'Test Kurum', 'Test Ilan', 'personel_alimi', 'ANKARA', 'acik',
        '2026-11-26', '2026-12-26', 5, 'Ozet', '{}', '2026-11-26', '2026-11-26'
    )
""")
conn.execute("""
    INSERT INTO announcement_positions (id, announcement_id, title, city)
    VALUES ('p1', 'a1', 'Muhendis', 'ANKARA')
""")
conn.execute("DELETE FROM users WHERE id = 'u1'")
conn.execute("DELETE FROM announcements WHERE id = 'a1'")
assert conn.execute("SELECT COUNT(*) FROM saved_searches").fetchone()[0] == 0
assert conn.execute("SELECT COUNT(*) FROM announcement_positions").fetchone()[0] == 0
print(json.dumps({"ok": True, "tables": sorted(tables)}))
`;

    const stdout = execFileSync('python3', ['-c', pythonScript, migrationsDir], {
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(stdout.trim()) as { ok: boolean; tables: string[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.tables).toContain('announcement_positions');
    expect(parsed.tables).toContain('source_checkpoints');
    expect(parsed.tables).toContain('saved_searches');
  });

  it('deletes all 10 user tables on KVKK deleteUser and supports saved_searches & chunked positions in D1Adapter', async () => {
    const queries: Array<{ query: string; params: unknown[] }> = [];
    const makeStmt = (query: string, bound: unknown[] = []): D1PreparedStatementLike => ({
      bind(...values: unknown[]) {
        return makeStmt(query, values);
      },
      async first<T = Record<string, unknown>>() {
        queries.push({ query, params: bound });
        if (query.includes('SELECT * FROM users WHERE id = ?')) {
          return {
            id: bound[0],
            email: 'kvkk@example.com',
            password_hash: 'salt:hash',
            full_name: null,
            phone: null,
            email_verified_at: null,
            accepted_terms_at: '2026-11-26',
            accepted_privacy_at: '2026-11-26',
            created_at: '2026-11-26',
            updated_at: '2026-11-26',
          } as T;
        }
        return null;
      },
      async all<T = Record<string, unknown>>() {
        queries.push({ query, params: bound });
        if (query.includes('FROM announcement_positions WHERE announcement_id IN')) {
          return {
            results: bound.map((annId, idx) => ({
              id: `pos-${idx}`,
              announcement_id: annId,
              title: `Kadro ${idx}`,
              unvan: null,
              city: 'ANKARA',
              district: null,
              quota: 2,
              education_level: 'lisans',
              kpss_score_type: 'P3',
              min_kpss_score: 70,
              max_age: 35,
              military_required: 0,
              qualification_codes_json: '["4001"]',
              evaluation_method: 'KPSS',
              is_interview_free: 1,
              requirements_summary: 'Lisans 4001',
            })) as T[],
          };
        }
        return { results: [] as T[] };
      },
      async run() {
        queries.push({ query, params: bound });
        return { success: true, meta: { changes: 1 } };
      },
    });

    const mockD1: D1DatabaseLike = {
      prepare: (q) => makeStmt(q),
      async batch(stmts) {
        for (const s of stmts) await s.run();
        return [];
      },
    };

    const d1 = new D1Adapter(mockD1);
    const ids = Array.from({ length: 65 }, (_, i) => `ann-${i}`);
    const posMap = await d1.listPositionsForAnnouncements(ids);
    expect(Object.keys(posMap)).toHaveLength(65);
    expect(
      queries.filter((q) => q.query.includes('FROM announcement_positions WHERE announcement_id IN')),
    ).toHaveLength(2);

    const deleted = await d1.deleteUser('user-kvkk-10');
    expect(deleted).toBe(true);
    const deleteStmts = queries
      .filter((q) => q.query.startsWith('DELETE FROM'))
      .map((q) => q.query);
    expect(deleteStmts).toHaveLength(10);
    expect(deleteStmts[0]).toBe('DELETE FROM saved_searches WHERE user_id = ?');

    // Also verify MemoryDbAdapter.deleteUser clears saved_searches
    const registered = await registerUser(db, {
      email: 'mem-kvkk@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await db.createSavedSearch({
      id: 'ss-mem-1',
      userId: registered.user.id,
      name: 'B Grubu Ankara',
      filters: { city: 'ANKARA', employmentType: 'memur_b' },
      notifyPush: true,
      notifyEmail: true,
      createdAt: '2026-11-26T10:00:00.000Z',
    });
    expect(await db.listSavedSearches(registered.user.id)).toHaveLength(1);
    await db.deleteUser(registered.user.id);
    expect(await db.listSavedSearches(registered.user.id)).toEqual([]);
  });

  it('preserves 24 seeds when only seeds exist and automatically excludes demo rows once live rows exist', async () => {
    const initialOnly = await db.listAnnouncements({ status: 'hepsi' });
    expect(initialOnly).toHaveLength(INITIAL_ANNOUNCEMENTS.length);

    const liveItem = makeLiveAnnouncement();
    await db.upsertAnnouncements([liveItem]);

    const defaultList = await db.listAnnouncements({ status: 'hepsi' });
    expect(defaultList).toHaveLength(1);
    expect(defaultList[0].id).toBe(liveItem.id);

    const withDemo = await db.listAnnouncements({ status: 'hepsi', excludeDemo: false });
    expect(withDemo).toHaveLength(INITIAL_ANNOUNCEMENTS.length + 1);
  });

  it('runs syncOfficialSourcesV2 with staged batch enrichment (6 pending -> enriched), pruning, expiry, and on-demand enrichment', async () => {
    // Add a stale open announcement past deadline and a noisy RG regulation row
    await db.upsertAnnouncements([
      makeLiveAnnouncement({
        id: 'expired-live-1',
        externalId: 'EXT-EXPIRED-1',
        source: 'sbb',
        sourceName: 'SBB Kamu İlan',
        deadlineAt: '2026-10-01',
        status: 'acik',
        enrichmentStatus: 'enriched',
      }),
      makeLiveAnnouncement({
        id: 'noisy-rg-reg-1',
        externalId: 'RG-NOISY-1',
        source: 'resmi_gazete',
        sourceName: 'Resmî Gazete',
        title: 'Gümrük Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik',
        summary: 'İthalat rejimi yönetmelik değişikliği.',
        enrichmentStatus: 'enriched',
      }),
    ]);

    const searchIlan = Array.from({ length: 8 }, (_, idx) => {
      const n = idx + 1;
      return {
        guid: `guid-${n}`,
        kurumAdi: 'T.C. Çevre, Şehircilik ve İklim Değişikliği Bakanlığı',
        birimAdi: 'Personel Genel Müdürlüğü',
        ilanBaslik: `657/4B Sözleşmeli Mühendis Alımı ${n}`,
        ilanTuru: 'Sözleşmeli Personel',
        basTarih: `2026-11-${String(10 + n).padStart(2, '0')}T00:00:00`,
        bitTarih: '2026-12-30T00:00:00',
        basvuruLinki: 'https://isealimkariyerkapisi.cbiko.gov.tr',
      };
    });

    const enrichedGuids: string[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/ilan/GetIseAlimPage')) {
        return new Response(JSON.stringify({ searchIlan }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', etag: '"kk-v1"' },
        });
      }
      if (url.includes('/api/ilan/GetIlanPreviewPublic')) {
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as { ilanGuid?: string };
        enrichedGuids.push(parsedBody.ilanGuid ?? '');
        return new Response(
          JSON.stringify({
            kurumAdi: 'T.C. Çevre, Şehircilik ve İklim Değişikliği Bakanlığı',
            birimAdi: 'Personel Genel Müdürlüğü',
            ilanBaslik: `Sözleşmeli Mühendis Alımı (${parsedBody.ilanGuid})`,
            ilanMetni: '[justify]KPSS P3 puan türünden en az 70 puan ve lisans mezunu olmak.[/justify]',
            basvuruLinki: 'https://isealimkariyerkapisi.cbiko.gov.tr/apply',
            kontenjan: 4,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/altilan/GetAltIlanInfoByIlanIdPublic')) {
        return new Response(
          JSON.stringify([
            {
              ilanBaslik: 'İnşaat Mühendisi',
              unvan: 'Mühendis',
              ilanMetni: 'KPSS P3 en az 70 puan, Lisans İnşaat Mühendisliği (4639).',
              kontenjanList: [{ il: 'ANKARA / ÇANKAYA', kontenjan: 3 }],
              degerlemeAsamaList: [{ asamaAdi: 'KPSS Puan Sıralaması', turu: 'KPSS', sinavsizAsama: 1 }],
            },
            {
              ilanBaslik: 'Harita Mühendisi',
              unvan: 'Mühendis',
              ilanMetni: 'KPSS P3 en az 75 puan, Lisans Harita Mühendisliği.',
              kontenjanList: [{ il: 'İZMİR / KONAK', kontenjan: 2 }],
              degerlemeAsamaList: [{ asamaAdi: 'Sözlü Sınav', turu: 'Sözlü' }],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('kamuilan.sbb.gov.tr')) {
        return new Response('<html><body></body></html>', { status: 200 });
      }
      if (url.includes('iskur.gov.tr')) {
        return new Response('<html><body></body></html>', { status: 200 });
      }
      if (url.includes('resmigazete.gov.tr')) {
        return new Response('<html><body></body></html>', { status: 200 });
      }
      return new Response('', { status: 404 });
    };

    const run1 = await syncOfficialSourcesV2(db, {
      fetcher: mockFetch,
      referenceDate: '2026-11-26',
      maxEnrichPerRun: 6,
    });

    expect(run1.dedupedCount).toBe(8);
    expect(run1.enrichedCount).toBe(6);
    expect(run1.expiredCount).toBe(1);
    expect(run1.prunedNoisyCount).toBe(1);
    expect(run1.checkpoints.length).toBeGreaterThanOrEqual(4);
    expect(enrichedGuids).toEqual(['guid-8', 'guid-7', 'guid-6', 'guid-5', 'guid-4', 'guid-3']);

    // Expired row is closed, noisy RG regulation is deleted
    const expiredRow = await db.getAnnouncementById('expired-live-1');
    expect(expiredRow?.status).toBe('kapali');
    expect(await db.getAnnouncementById('noisy-rg-reg-1')).toBeNull();

    // Enriched item has 2 positions persisted and attached
    const enrichedItem = await db.getAnnouncementById('kariyer_kapisi-kariyer_kapisi-guid-8');
    expect(enrichedItem?.enrichmentStatus).toBe('enriched');
    expect(enrichedItem?.positionsCount).toBe(2);
    expect(enrichedItem?.positions?.[0].city).toBe('ANKARA');
    expect(enrichedItem?.positions?.[0].district).toBe('ÇANKAYA');

    // Pending item guid-1 can be enriched on demand
    const pendingItem = await db.getAnnouncementById('kariyer_kapisi-kariyer_kapisi-guid-1');
    expect(pendingItem?.enrichmentStatus).toBe('pending');
    const onDemand = await enrichAnnouncementOnDemand(db, pendingItem!, mockFetch);
    expect(onDemand.enrichmentStatus).toBe('enriched');
    expect(onDemand.positions).toHaveLength(2);
  });

  it('evaluates position-level Matching v2 (2/5 positions eligible + scoreMargin) while staying backward-compatible', () => {
    const positions: AnnouncementPosition[] = [
      {
        id: 'pos-1',
        announcementId: 'multi-pos-1',
        title: 'Bilgisayar Mühendisi (Ankara)',
        unvan: 'Mühendis',
        city: 'ANKARA',
        district: 'ÇANKAYA',
        quota: 4,
        educationLevel: 'lisans',
        kpssScoreType: 'P3',
        minKpssScore: 75,
        maxAge: 35,
        militaryRequired: true,
        qualificationCodes: ['4531'],
        evaluationMethod: 'KPSS P3',
        isInterviewFree: true,
        requirementsSummary: 'Bilgisayar Mühendisliği P3 >= 75',
      },
      {
        id: 'pos-2',
        announcementId: 'multi-pos-1',
        title: 'Büro Personeli (Türkiye Geneli)',
        unvan: 'Büro Personeli',
        city: 'TÜRKİYE GENELİ',
        district: null,
        quota: 10,
        educationLevel: 'lisans',
        kpssScoreType: 'P3',
        minKpssScore: 70,
        maxAge: null,
        militaryRequired: false,
        qualificationCodes: ['4001'],
        evaluationMethod: 'KPSS P3',
        isInterviewFree: true,
        requirementsSummary: 'Herhangi bir lisans 4001 P3 >= 70',
      },
      {
        id: 'pos-3',
        announcementId: 'multi-pos-1',
        title: 'Yazılım Uzmanı (Yüksek Puan)',
        unvan: 'Uzman',
        city: 'ANKARA',
        district: null,
        quota: 2,
        educationLevel: 'lisans',
        kpssScoreType: 'P3',
        minKpssScore: 92,
        maxAge: null,
        militaryRequired: false,
        qualificationCodes: ['4531'],
        evaluationMethod: 'KPSS P3',
        isInterviewFree: true,
        requirementsSummary: 'P3 >= 92',
      },
      {
        id: 'pos-4',
        announcementId: 'multi-pos-1',
        title: 'Tekniker (İstanbul)',
        unvan: 'Tekniker',
        city: 'İSTANBUL',
        district: null,
        quota: 3,
        educationLevel: 'onlisans',
        kpssScoreType: 'P93',
        minKpssScore: 65,
        maxAge: null,
        militaryRequired: false,
        qualificationCodes: ['3001'],
        evaluationMethod: 'KPSS P93',
        isInterviewFree: true,
        requirementsSummary: 'Önlisans İstanbul',
      },
      {
        id: 'pos-5',
        announcementId: 'multi-pos-1',
        title: 'Veri Hazırlama (İzmir)',
        unvan: 'VHKİ',
        city: 'İZMİR',
        district: null,
        quota: 5,
        educationLevel: 'lisans',
        kpssScoreType: 'P3',
        minKpssScore: 70,
        maxAge: 35,
        militaryRequired: false,
        qualificationCodes: ['4001'],
        evaluationMethod: 'KPSS P3',
        isInterviewFree: true,
        requirementsSummary: 'İzmir ikamet',
      },
    ];

    const ann = makeLiveAnnouncement({
      id: 'multi-pos-1',
      positions,
      positionsCount: positions.length,
    });

    const profile: MatchingProfileInput = {
      educationLevel: 'lisans',
      departmentId: 'bilgisayar-muhendisligi',
      kpssScoreType: 'P3',
      kpssScore: 84.5,
      residenceCity: 'Ankara',
      militaryStatus: 'yapildi',
      driverLicenses: ['B'],
      certificates: ['6225'],
      qualificationCodes: [],
      age: 29,
    };

    const evaluation = evaluateAnnouncementMatch(profile, ann);
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.matchedPositionCount).toBe(2);
    expect(evaluation.totalPositionCount).toBe(5);
    expect(evaluation.matchedPositions).toHaveLength(5);
    expect(evaluation.matchedPositions?.filter((p) => p.eligible).map((p) => p.id)).toEqual([
      'pos-1',
      'pos-2',
    ]);
    // Max score margin across eligible positions: 84.5 - 70 = 14.5
    expect(evaluation.scoreMargin).toBe(14.5);
    expect(evaluation.matchedReasons[0]).toBe('2/5 kadro profilinizle uyumlu');
  });

  it('handles /api/saved-searches auth & CRUD, /api/announcements taxonomy filters + freshness, /api/announcements/[id] positions, and /api/cron/sync iptal gating', async () => {
    // 1. Unauthenticated /api/saved-searches blocked
    expect(
      (await getSavedSearchesHandler(new Request('http://localhost/api/saved-searches'))).status,
    ).toBe(401);
    expect(
      (
        await createSavedSearchHandler(
          jsonRequest('http://localhost/api/saved-searches', 'POST', {
            name: 'Test',
            filters: {},
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await deleteSavedSearchHandler(
          new Request('http://localhost/api/saved-searches?id=1', { method: 'DELETE' }),
        )
      ).status,
    ).toBe(401);

    // 2. Register two users and test CRUD + ownership isolation
    const regA = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'arama-a@example.com',
        password: 'GucluParola123!',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    );
    const cookieA = extractSessionCookie(regA);

    const regB = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'arama-b@example.com',
        password: 'GucluParola123!',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    );
    const cookieB = extractSessionCookie(regB);

    const badNameRes = await createSavedSearchHandler(
      jsonRequest(
        'http://localhost/api/saved-searches',
        'POST',
        { name: '   ', filters: { city: 'ANKARA' } },
        cookieA,
      ),
    );
    expect(badNameRes.status).toBe(400);

    const badFiltersRes = await createSavedSearchHandler(
      jsonRequest(
        'http://localhost/api/saved-searches',
        'POST',
        { name: 'Ankara', filters: 'invalid' },
        cookieA,
      ),
    );
    expect(badFiltersRes.status).toBe(400);

    const createRes = await createSavedSearchHandler(
      jsonRequest(
        'http://localhost/api/saved-searches',
        'POST',
        {
          name: 'Mülakatsız 4B Ankara',
          filters: { city: 'ANKARA', employmentType: 'sozlesmeli_4b', examType: 'kpss_only' },
          notifyPush: true,
          notifyEmail: false,
        },
        cookieA,
      ),
    );
    expect(createRes.status).toBe(201);
    const createdJson = await createRes.json();
    const searchId = createdJson.search.id as string;
    expect(createdJson.search.name).toBe('Mülakatsız 4B Ankara');
    expect(createdJson.search.notifyEmail).toBe(false);

    const listARes = await getSavedSearchesHandler(
      jsonRequest('http://localhost/api/saved-searches', 'GET', undefined, cookieA),
    );
    expect(listARes.status).toBe(200);
    const listAJson = await listARes.json();
    expect(listAJson.searches).toHaveLength(1);

    // User B cannot delete User A's saved search
    const delByB = await deleteSavedSearchHandler(
      jsonRequest(
        `http://localhost/api/saved-searches?id=${encodeURIComponent(searchId)}`,
        'DELETE',
        undefined,
        cookieB,
      ),
    );
    expect(delByB.status).toBe(404);

    // User A deletes it
    const delByA = await deleteSavedSearchHandler(
      jsonRequest(
        `http://localhost/api/saved-searches?id=${encodeURIComponent(searchId)}`,
        'DELETE',
        undefined,
        cookieA,
      ),
    );
    expect(delByA.status).toBe(200);
    expect((await delByA.json()).deleted).toBe(true);

    // 3. Test /api/announcements taxonomy filters, freshness, categoryCounts, positionsCount
    const ann1 = makeLiveAnnouncement({
      id: 'live-filter-1',
      externalId: 'LIVE-FILTER-1',
      employmentType: 'sozlesmeli_4b',
      examType: 'kpss_only',
      noticeType: 'ilan',
      enrichmentStatus: 'enriched',
    });
    const ann2 = makeLiveAnnouncement({
      id: 'live-filter-2',
      externalId: 'LIVE-FILTER-2',
      title: 'Müfettiş Yardımcılığı İptal İlanı',
      employmentType: 'memur_a',
      examType: 'written_and_oral',
      noticeType: 'iptal',
      enrichmentStatus: 'enriched',
    });
    await db.upsertAnnouncements([ann1, ann2]);
    await db.replaceAnnouncementPositions(ann1.id, [
      {
        id: 'lf-pos-1',
        announcementId: ann1.id,
        title: 'Programcı',
        unvan: 'Programcı',
        city: 'ANKARA',
        district: null,
        quota: 2,
        educationLevel: 'lisans',
        kpssScoreType: 'P3',
        minKpssScore: 70,
        maxAge: null,
        militaryRequired: false,
        qualificationCodes: ['4531'],
        evaluationMethod: 'KPSS',
        isInterviewFree: true,
        requirementsSummary: 'Lisans',
      },
    ]);
    await db.upsertSourceCheckpoint({
      source: 'kariyer_kapisi',
      etag: '"etag-1"',
      lastModified: null,
      bodyHash: 'abc',
      lastCheckedAt: '2026-11-26T18:00:00.000Z',
      lastChangedAt: '2026-11-26T18:00:00.000Z',
      activeCount: 2,
      lastError: null,
    });

    const filteredRes = await getAnnouncementsHandler(
      new Request(
        'http://localhost/api/announcements?employmentType=sozlesmeli_4b&examType=kpss_only&noticeType=ilan',
      ),
    );
    expect(filteredRes.status).toBe(200);
    const filteredJson = await filteredRes.json();
    expect(filteredJson.items).toHaveLength(1);
    expect(filteredJson.items[0].id).toBe(ann1.id);
    expect(filteredJson.items[0].positionsCount).toBe(1);
    expect(filteredJson.freshness.lastCheckedAt).toBe('2026-11-26T18:00:00.000Z');
    expect(filteredJson.freshness.checkpoints).toHaveLength(1);
    expect(filteredJson.categoryCounts.sozlesmeli_4b).toBe(1);

    // 4. /api/announcements/[id] returns positions array
    const detailRes = await getAnnouncementByIdHandler(
      new Request(`http://localhost/api/announcements/${ann1.id}`),
      { params: Promise.resolve({ id: ann1.id }) },
    );
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.positions).toHaveLength(1);
    expect(detailJson.positions[0].title).toBe('Programcı');

    // 5. /api/sync/status includes checkpoints
    const syncStatusRes = await syncStatusHandler();
    expect(syncStatusRes.status).toBe(200);
    const syncStatusJson = await syncStatusRes.json();
    expect(syncStatusJson.checkpoints).toHaveLength(1);

    // 6. /api/cron/sync returns Phase 7 metrics and excludes iptal announcements from alerts
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/ilan/GetIseAlimPage')) {
        return new Response(
          JSON.stringify({
            searchIlan: [
              {
                guid: 'cron-iptal-1',
                kurumAdi: 'T.C. Test Bakanlığı',
                ilanBaslik: 'Uzman Alımı İptal İlanı',
                ilanTuru: 'İptal',
                basTarih: '2026-11-26T00:00:00',
                bitTarih: '2026-12-20T00:00:00',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('<html><body></body></html>', { status: 200 });
    });

    const cronRes = await cronSyncHandler(
      jsonRequest('http://localhost/api/cron/sync', 'POST'),
    );
    expect(cronRes.status).toBe(200);
    const cronJson = await cronRes.json();
    expect(cronJson.dedupedCount).toBe(1);
    expect(cronJson.newAlerts.sentCount).toBe(0);
    expect(cronJson.pushAlerts.sentCount).toBe(0);
    expect(Array.isArray(cronJson.checkpoints)).toBe(true);
  });

  it('protects enriched announcements from weaker pending RSS downgrades and prunes expanded ISKUR noise', async () => {
    const enrichedRow = makeLiveAnnouncement({
      id: 'kk-mono-1',
      externalId: 'KARIYER_KAPISI-mono-1',
      city: 'ANKARA',
      deadlineAt: '2026-12-28',
      publishedAt: '2026-11-20',
      quota: 12,
      summary: 'Detaylı zenginleştirilmiş ilan özeti.',
      applyUrl: 'https://isealimkariyerkapisi.cbiko.gov.tr/apply/mono-1',
      organizationUnit: 'Bilgi Teknolojileri Genel Müdürlüğü',
      examType: 'kpss_only',
      enrichmentStatus: 'enriched',
      verifiedSources: [
        {
          source: 'kariyer_kapisi',
          sourceName: 'Kariyer Kapısı',
          url: 'https://kariyerkapisi.gov.tr/IlanDetay?i=mono-1',
        },
      ],
    });

    await db.upsertAnnouncements([enrichedRow]);

    // Simulate weaker RSS fallback upsert with pending status and TÜRKİYE GENELİ city
    const weakerRssRow = makeLiveAnnouncement({
      id: 'kk-mono-1',
      externalId: 'KARIYER_KAPISI-mono-1',
      city: 'TÜRKİYE GENELİ',
      publishedAt: '2026-11-20',
      deadlineAt: '2026-11-20',
      quota: null,
      summary: 'Kısa RSS özeti.',
      applyUrl: null,
      organizationUnit: null,
      examType: 'unspecified',
      enrichmentStatus: 'pending',
      verifiedSources: [
        {
          source: 'sbb',
          sourceName: 'SBB Kamu İlan',
          url: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=mono-1',
        },
      ],
    });

    await db.upsertAnnouncements([weakerRssRow]);

    const preserved = await db.getAnnouncementById('kk-mono-1');
    expect(preserved?.enrichmentStatus).toBe('enriched');
    expect(preserved?.city).toBe('ANKARA');
    expect(preserved?.deadlineAt).toBe('2026-12-28');
    expect(preserved?.quota).toBe(12);
    expect(preserved?.summary).toBe('Detaylı zenginleştirilmiş ilan özeti.');
    expect(preserved?.applyUrl).toBe('https://isealimkariyerkapisi.cbiko.gov.tr/apply/mono-1');
    expect(preserved?.organizationUnit).toBe('Bilgi Teknolojileri Genel Müdürlüğü');
    expect(preserved?.examType).toBe('kpss_only');
    expect(preserved?.verifiedSources).toHaveLength(2);

    // Expanded ISKUR noise pruning
    await db.upsertAnnouncements([
      makeLiveAnnouncement({
        id: 'noise-dns',
        externalId: 'ISKUR-NOISE-DNS',
        source: 'iskur',
        sourceName: 'İŞKUR',
        sourceUrl: 'https://www.iskur.gov.tr/duyurular/dns-guvenlik',
        title: 'Dns Güvenlik Duvarı Lisans Yenileme',
        summary: 'Kurumsal ağ güvenliği hizmeti.',
        enrichmentStatus: 'enriched',
      }),
      makeLiveAnnouncement({
        id: 'noise-tv',
        externalId: 'ISKUR-NOISE-TV',
        source: 'iskur',
        sourceName: 'İŞKUR',
        sourceUrl: 'https://www.iskur.gov.tr/ilan/tv',
        title: 'Televizyon ve Ekipman Temini',
        summary: 'Hizmet binası ekipman alımı.',
        enrichmentStatus: 'enriched',
      }),
      makeLiveAnnouncement({
        id: 'noise-siem',
        externalId: 'ISKUR-NOISE-SIEM',
        source: 'iskur',
        sourceName: 'İŞKUR',
        sourceUrl: 'https://www.iskur.gov.tr/ilan/siem',
        title: 'SiEM Log Yönetim Yazılımı',
        summary: 'Siber güvenlik yazılım desteği.',
        enrichmentStatus: 'enriched',
      }),
      makeLiveAnnouncement({
        id: 'noise-plan',
        externalId: 'ISKUR-NOISE-PLAN',
        source: 'iskur',
        sourceName: 'İŞKUR',
        sourceUrl: 'https://www.iskur.gov.tr/ilan/plan',
        title: '2026-2030 Stratejik Plan Görüş Toplama Duyurusu',
        summary: 'Stratejik plan hazırlık duyurusu.',
        enrichmentStatus: 'enriched',
      }),
      makeLiveAnnouncement({
        id: 'valid-iskur-memur',
        externalId: 'ISKUR_KAMU_MEMUR-1',
        source: 'iskur',
        sourceName: 'İŞKUR',
        sourceUrl: 'https://www.iskur.gov.tr/ilanlar/kamu-memur-alim-ilanlari/ankara',
        title: 'Devlet Su İşleri Uzman Yardımcısı Alımı',
        summary: 'KPSS P3 puanı ile memur alımı yapılacaktır.',
        enrichmentStatus: 'enriched',
      }),
    ]);

    const pruneRes = await db.pruneNoisyAndDemoProductionRows();
    expect(pruneRes.prunedNoisy).toBe(4);
    expect(await db.getAnnouncementById('noise-dns')).toBeNull();
    expect(await db.getAnnouncementById('noise-tv')).toBeNull();
    expect(await db.getAnnouncementById('noise-siem')).toBeNull();
    expect(await db.getAnnouncementById('noise-plan')).toBeNull();
    expect(await db.getAnnouncementById('valid-iskur-memur')).not.toBeNull();
  });

  it('trips detail enrichment circuit-breaker after first failed detail fetch in syncOfficialSourcesV2', async () => {
    const searchIlan = Array.from({ length: 4 }, (_, idx) => ({
      guid: `cb-guid-${idx + 1}`,
      kurumAdi: 'T.C. Test Bakanlığı',
      ilanBaslik: `Uzman Yardımcısı Alımı ${idx + 1}`,
      ilanTuru: 'Memur',
      basTarih: `2026-11-${String(20 + idx).padStart(2, '0')}T00:00:00`,
      bitTarih: '2026-12-30T00:00:00',
    }));

    let detailAttempts = 0;
    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/ilan/GetIseAlimPage')) {
        return new Response(JSON.stringify({ searchIlan }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (
        url.includes('/api/ilan/GetIlanPreviewPublic') ||
        url.includes('/api/altilan/GetAltIlanInfoByIlanIdPublic')
      ) {
        if (url.includes('GetIlanPreviewPublic')) {
          detailAttempts += 1;
        }
        return new Response('Forbidden', { status: 403 });
      }
      return new Response('<html><body></body></html>', { status: 200 });
    };

    const res = await syncOfficialSourcesV2(db, {
      fetcher: mockFetch,
      referenceDate: '2026-11-26',
      maxEnrichPerRun: 6,
    });

    expect(res.dedupedCount).toBe(4);
    expect(res.enrichedCount).toBe(0);
    expect(detailAttempts).toBe(1);
  });

  it('enforces CRON_SECRET auth and persists batch items, positions, checkpoints, and syncRun on POST /api/cron/ingest', async () => {
    vi.stubEnv('CRON_SECRET', 'super-ingest-secret');

    const unauthRes = await cronIngestHandler(
      new Request('http://localhost/api/cron/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-secret',
        },
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    const ingestedItem = makeLiveAnnouncement({
      id: 'ingest-item-1',
      externalId: 'INGEST-1',
      enrichmentStatus: 'enriched',
      positionsCount: 1,
    });
    const ingestedPosition: AnnouncementPosition = {
      id: 'ingest-pos-1',
      announcementId: 'ingest-item-1',
      title: 'Bilgisayar Mühendisi',
      unvan: 'Mühendis',
      city: 'ANKARA',
      district: 'ÇANKAYA',
      quota: 5,
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      minKpssScore: 75,
      maxAge: 35,
      militaryRequired: false,
      qualificationCodes: ['4531'],
      evaluationMethod: 'KPSS P3',
      isInterviewFree: true,
      requirementsSummary: 'Lisans 4531',
    };

    const okRes = await cronIngestHandler(
      new Request('http://localhost/api/cron/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer super-ingest-secret',
        },
        body: JSON.stringify({
          items: [ingestedItem],
          positionsByAnnouncementId: {
            'ingest-item-1': [ingestedPosition],
          },
          checkpoints: [
            {
              source: 'kariyer_kapisi',
              etag: '"ingest-etag"',
              lastModified: null,
              bodyHash: 'h123',
              lastCheckedAt: '2026-11-26T19:45:00.000Z',
              lastChangedAt: '2026-11-26T19:45:00.000Z',
              activeCount: 1,
              lastError: null,
            },
          ],
          triggeredBy: 'github_actions_sync_remote',
        }),
      }),
    );

    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.inserted).toBe(1);
    expect(okJson.positionsSaved).toBe(1);
    expect(okJson.syncRun.triggeredBy).toBe('github_actions_sync_remote');

    const stored = await db.getAnnouncementById('ingest-item-1');
    expect(stored?.positions).toHaveLength(1);
    expect(stored?.positions?.[0].title).toBe('Bilgisayar Mühendisi');

    const cp = await db.getSourceCheckpoint('kariyer_kapisi');
    expect(cp?.etag).toBe('"ingest-etag"');
  });
});
