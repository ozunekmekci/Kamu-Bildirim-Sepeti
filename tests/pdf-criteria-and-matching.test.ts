import { describe, expect, it } from 'vitest';
import {
  Announcement,
  enrichAnnouncementFromPdfText,
  extractCriteriaFromText,
} from '@/modules/announcements';
import { D1Adapter, MemoryDbAdapter } from '@/modules/db';
import type { D1DatabaseLike, D1PreparedStatementLike } from '@/modules/db/d1-adapter';
import { evaluateAnnouncementMatch, type MatchingProfileInput } from '@/modules/matching';

const BOZKOY_OCR_TEXT = `
T.C.
NİĞDE İLİ
BOZKÖY BELEDİYE BAŞKANLIĞI
İLK DEFA ATANMAK ÜZERE İTFAİYE ERİ ALIM İLANI

Niğde ili Bozköy Belediye Başkanlığı bünyesinde 657 sayılı Devlet Memurları Kanununa
tabi olarak istihdam edilmek üzere Belediye İtfaiye Yönetmeliği hükümlerine göre aşağıda
unvanı, sınıfı, derecesi, adedi, nitelikleri, KPSS puan türü, KPSS taban puanı ve diğer
şartları taşımak kaydıyla belirtilen boş kadroya açıktan atama yoluyla itfaiye eri alınacaktır.

Kadro Bilgileri:
Unvanı: İtfaiye Eri | Sınıfı: GİH | Derecesi: 10 | Adedi: 1 | Cinsiyeti: Kadın/Erkek
Niteliği: Lisans düzeyinde eğitim veren yükseköğretim kurumlarının Egzersiz ve Spor Bilimleri,
Spor Yöneticiliği, Antrenörlük Eğitimi programlarının birinden mezun olmak. En az (C) sınıfı
sürücü belgesine sahip olmak.
KPSS Puan Türü: P3 | KPSS Taban Puanı: En az
65
poan

BAŞVURU ÖZEL ŞARTLARI:
1- İlan edilen İtfaiye Eri kadrosu için mezun olunan okul itibarıyla öğrenim şartını taşımak ve bu öğrenimle ilgili olarak 2024 yılı KPSS (B) grubu sınavına girmiş ve P3 puan türünden En az 65 poan almış olmak.
2- Sınavın yapıldığı tarihte 30 yaşını doldurmamış olmak.
3- 13/10/1983 tarihli ve 2918 sayılı Karayolları Trafik Kanunu hükümlerince verilen en az (C) sınıfı sürücü belgesine sahip olmak.
4- Askerlikle ilişiği bulunmamak.
5- Sözlü ve uygulamalı sınav yapılacaktır.

Başvuru formu ve duyurular www.bozkoy.bel.tr adresinden temin edilebilir.
`;

function makeBaseBozkoyAnnouncement(): Announcement {
  return {
    id: 'iskur-bozkoy-itfaiye-1',
    externalId: 'ISKUR-BOZKOY-1',
    source: 'iskur',
    sourceName: 'İŞKUR',
    sourceUrl: 'https://www.iskur.gov.tr/medya/bozkoy-itfaiye.pdf',
    institution: 'Bozköy Belediye Başkanlığı',
    title: 'İtfaiye Eri Alım İlanı',
    category: 'personel_alimi',
    city: 'TÜRKİYE GENELİ',
    status: 'acik',
    publishedAt: '2026-11-20',
    deadlineAt: '2026-12-15',
    quota: null,
    summary: 'Bozköy Belediye Başkanlığı İtfaiye Eri alım ilanı.',
    enrichmentStatus: 'pending',
    isDemo: false,
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
  };
}

describe('extractCriteriaFromText enhancements', () => {
  it('parses parenthesized, multi-class, and standard Turkish driver licenses', () => {
    const c1 = extractCriteriaFromText(
      'Adayların en az (C) sınıfı sürücü belgesine sahip olması gerekir.',
      'NİĞDE',
    );
    expect(c1.driverLicenses).toEqual(['C']);
    expect(c1.summaryLines.some((line) => line.includes('C sınıfı'))).toBe(true);

    const c2 = extractCriteriaFromText(
      'B, C sınıfı ehliyet veya (D) sınıfı sürücü belgesi aranır.',
      'ANKARA',
    );
    expect(c2.driverLicenses).toEqual(['B', 'C', 'D']);

    const c3 = extractCriteriaFromText('CE sınıfı sürücü belgesi gereklidir.', 'İZMİR');
    expect(c3.driverLicenses).toEqual(['CE']);
  });

  it('extracts multi-line and OCR-tolerant KPSS scores without false positives on years/articles', () => {
    const multiLine = extractCriteriaFromText('KPSS P3\nEn az\n65\npuan', 'NİĞDE');
    expect(multiLine.kpssScoreTypes).toEqual(['P3']);
    expect(multiLine.minKpssScore).toBe(65);

    const ocrTypo = extractCriteriaFromText('2024 KPSS P3 puan türünden En az 65 poan', 'NİĞDE');
    expect(ocrTypo.minKpssScore).toBe(65);

    const tableRow = extractCriteriaFromText('KPSS P93 | Taban: 72 | 657 sayılı Kanun', 'ANKARA');
    expect(tableRow.kpssScoreTypes).toEqual(['P93']);
    expect(tableRow.minKpssScore).toBe(72);

    const lawOnly = extractCriteriaFromText(
      '657 sayılı Devlet Memurları Kanununun 65. maddesi ve 2026 yılı bütçesi kapsamında alım.',
      'ANKARA',
    );
    expect(lawOnly.minKpssScore).toBeNull();
  });

  it('extracts maxAge, gender, and departments without 1-word generic false positives', () => {
    const parsed = extractCriteriaFromText(
      '35 yaşından gün almamış, sadece erkek adaylar. Fakültelerin Bilgisayar Mühendisliği, Yazılım Mühendisliği bölümlerinin birinden mezun olmak.',
      'ANKARA',
    );
    expect(parsed.maxAge).toBe(35);
    expect(parsed.gender).toBe('erkek');
    expect(parsed.departments).toEqual(
      expect.arrayContaining(['Bilgisayar Mühendisliği', 'Yazılım Mühendisliği']),
    );
    expect(parsed.summaryLines.some((l) => l.includes('35'))).toBe(true);
    expect(parsed.summaryLines.some((l) => l.includes('Bilgisayar Mühendisliği'))).toBe(true);

    // Must not false-match institution names or short keywords like "su" or "it"
    const noisy = extractCriteriaFromText(
      'T.C. Adalet Bakanlığı ve Hazine ve Maliye Bakanlığı Devlet Su İşleri itfaiye aracı alımı.',
      'ANKARA',
    );
    expect(noisy.departments).toEqual([]);
  });

  it('handles live Bozköy OCR column-interleaved table and ignores oral/practical exam average threshold (60 vs KPSS 65)', () => {
    const liveBozkoyOcrSnippet = `
T.C. NİĞDE İLİ BOZKÖY BELEDİYE BAŞKANLIĞI
İTFAİYE ERİ ALIM İLANI

-Lisans düzeyinde eğitim veren
kurumların Egzersiz ve Spor
Bilimleri, Spor Yöneticiliği, E
İtfaiye | 4 Antrenörlük Eğitimi Kadın/ naz
1 Eri GİH 11 1 I birind üi P3 65
ri programlarının birinden mezun rkel
olmak. poan

En az (C) sınıfı sürücü belgesine sahip olmak.
30 yaşını doldurmamış olmak.

DEĞERLENDİRME:
Sınavda başarılı sayılmak için her iki sınavın ortalamasının en az 60 puan olması şarttır.
`;

    const criteria = extractCriteriaFromText(liveBozkoyOcrSnippet, 'NİĞDE');
    expect(criteria.kpssScoreTypes).toEqual(['P3']);
    expect(criteria.minKpssScore).toBe(65);
    expect(criteria.driverLicenses).toEqual(['C']);
    expect(criteria.maxAge).toBe(30);
    expect(criteria.departments).toEqual(
      expect.arrayContaining([
        'Egzersiz ve Spor Bilimleri',
        'Spor Yöneticiliği',
        'Antrenörlük Eğitimi',
      ]),
    );
    expect(criteria.departments).toHaveLength(3);

    // Oral/practical exam threshold alone must not be misclassified as minKpssScore
    const evalOnly = extractCriteriaFromText(
      'Sınavda başarılı sayılmak için her iki sınavın ortalamasının en az 60 puan olması şarttır.',
      'NİĞDE',
    );
    expect(evalOnly.minKpssScore).toBeNull();
  });
});

describe('enrichAnnouncementFromPdfText (Bozköy OCR fixture)', () => {
  it('enriches Bozköy İtfaiye Eri PDF text into full criteria, city, applyUrl, and position', () => {
    const base = makeBaseBozkoyAnnouncement();
    const enriched = enrichAnnouncementFromPdfText(base, BOZKOY_OCR_TEXT);

    expect(enriched.city).toBe('NİĞDE');
    expect(enriched.quota).toBe(1);
    expect(enriched.applyUrl).toBe('https://www.bozkoy.bel.tr');
    expect(enriched.enrichmentStatus).toBe('enriched');
    expect(enriched.examType).toBe('practice_exam');
    expect(enriched.contentHash).toBeTruthy();

    expect(enriched.criteria.educationLevels).toContain('lisans');
    expect(enriched.criteria.kpssScoreTypes).toContain('P3');
    expect(enriched.criteria.minKpssScore).toBe(65);
    expect(enriched.criteria.driverLicenses).toContain('C');
    expect(enriched.criteria.maxAge).toBe(30);
    expect(enriched.criteria.gender).toBe('hepsi');
    expect(enriched.criteria.militaryRequired).toBe(true);
    expect(enriched.criteria.departments).toEqual(
      expect.arrayContaining([
        'Egzersiz ve Spor Bilimleri',
        'Spor Yöneticiliği',
        'Antrenörlük Eğitimi',
      ]),
    );
    expect(enriched.criteria.extractedTextExcerpt).toBeTruthy();
    expect((enriched.criteria.extractedTextExcerpt ?? '').length).toBeLessThanOrEqual(1600);
    expect(enriched.criteria.extractedTextExcerpt?.includes('\u2014')).toBe(false);

    expect(enriched.positions).toHaveLength(1);
    expect(enriched.positionsCount).toBe(1);
    expect(enriched.positions?.[0]).toMatchObject({
      title: 'İtfaiye Eri',
      unvan: 'İtfaiye Eri',
      city: 'NİĞDE',
      quota: 1,
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      minKpssScore: 65,
      maxAge: 30,
      militaryRequired: true,
      isInterviewFree: false,
    });
  });
});

describe('matching engine: driver license, certificates, and department names', () => {
  const enrichedBozkoy = enrichAnnouncementFromPdfText(
    makeBaseBozkoyAnnouncement(),
    BOZKOY_OCR_TEXT,
  );

  const matchingProfile: MatchingProfileInput = {
    educationLevel: 'lisans',
    departmentId: 'spor-yoneticiligi',
    kpssScoreType: 'P3',
    kpssScore: 70,
    residenceCity: 'Niğde',
    militaryStatus: 'yapildi',
    driverLicenses: ['C'],
    certificates: [],
    qualificationCodes: [],
    age: 26,
  };

  it('accepts a matching candidate for the enriched Bozköy announcement (with positions)', () => {
    const res = evaluateAnnouncementMatch(matchingProfile, enrichedBozkoy);
    expect(res.eligible).toBe(true);
    expect(res.matchedPositionCount).toBe(1);
    expect(res.missingReasons).toEqual([]);
    expect(res.unknownReasons).toEqual([]);
    expect(res.matchedReasons.some((r) => r.includes('Sürücü belgesi'))).toBe(true);
    expect(res.matchedReasons.some((r) => r.includes('Spor Yöneticiliği'))).toBe(true);
  });

  it('also accepts a matching candidate when announcement is Türkiye Geneli without positions', () => {
    const nationwideNoPos: Announcement = {
      ...enrichedBozkoy,
      city: 'TÜRKİYE GENELİ',
      positions: undefined,
      positionsCount: 0,
      criteria: {
        ...enrichedBozkoy.criteria,
        cities: ['TÜRKİYE GENELİ'],
      },
    };
    const res = evaluateAnnouncementMatch(
      { ...matchingProfile, residenceCity: 'Ankara' },
      nationwideNoPos,
    );
    expect(res.eligible).toBe(true);
    expect(res.missingReasons).toEqual([]);
  });

  it('rejects candidate missing C driver license even when positions exist', () => {
    const res = evaluateAnnouncementMatch(
      { ...matchingProfile, driverLicenses: ['B'] },
      enrichedBozkoy,
    );
    expect(res.eligible).toBe(false);
    expect(res.matchedPositionCount).toBe(0);
    expect(res.missingReasons.some((r) => r.includes('Sürücü belgesi eksik'))).toBe(true);
  });

  it('rejects candidate with insufficient KPSS score (60 < 65)', () => {
    const res = evaluateAnnouncementMatch(
      { ...matchingProfile, kpssScore: 60 },
      enrichedBozkoy,
    );
    expect(res.eligible).toBe(false);
    expect(res.missingReasons.some((r) => r.includes('KPSS puanı yetersiz'))).toBe(true);
  });

  it('rejects candidate with mismatched department and flags unknown when departmentId is missing', () => {
    const wrongDept = evaluateAnnouncementMatch(
      { ...matchingProfile, departmentId: 'bilgisayar-muhendisligi' },
      enrichedBozkoy,
    );
    expect(wrongDept.eligible).toBe(false);
    expect(wrongDept.missingReasons.some((r) => r.includes('Bölüm şartı uyuşmuyor'))).toBe(true);

    const noDept = evaluateAnnouncementMatch(
      { ...matchingProfile, departmentId: null },
      enrichedBozkoy,
    );
    expect(noDept.eligible).toBe(false);
    expect(noDept.unknownReasons.some((r) => r.includes('Bölüm bilgisi profilde belirtilmemiş'))).toBe(
      true,
    );
  });

  it('matches catalog departments by normalized name / multi-word keywords and respects 4001 override', () => {
    const catalogAnn: Announcement = {
      ...makeBaseBozkoyAnnouncement(),
      id: 'dept-catalog-1',
      city: 'TÜRKİYE GENELİ',
      criteria: {
        educationLevels: ['lisans'],
        kpssScoreTypes: ['P3'],
        minKpssScore: 70,
        cities: ['TÜRKİYE GENELİ'],
        militaryRequired: false,
        driverLicenses: [],
        certificates: ['6225'],
        qualificationCodes: [],
        summaryLines: [],
        departments: ['Kamu Yönetimi'],
      },
      positions: [
        {
          id: 'dept-catalog-1-pos-1',
          announcementId: 'dept-catalog-1',
          title: 'Uzman Yardımcısı',
          unvan: 'Uzman Yardımcısı',
          city: 'TÜRKİYE GENELİ',
          district: null,
          quota: 5,
          educationLevel: 'lisans',
          kpssScoreType: 'P3',
          minKpssScore: 70,
          maxAge: null,
          militaryRequired: false,
          qualificationCodes: [],
          evaluationMethod: 'KPSS',
          isInterviewFree: true,
          requirementsSummary: 'Kamu Yönetimi',
        },
      ],
    };

    const sbkyCandidate: MatchingProfileInput = {
      educationLevel: 'lisans',
      departmentId: 'kamu-yonetimi', // ad: 'Siyaset Bilimi ve Kamu Yönetimi'
      kpssScoreType: 'P3',
      kpssScore: 78,
      residenceCity: 'Ankara',
      militaryStatus: 'yapildi',
      driverLicenses: [],
      certificates: ['6225'],
      qualificationCodes: [],
    };
    expect(evaluateAnnouncementMatch(sbkyCandidate, catalogAnn).eligible).toBe(true);

    // Missing required 6225 certificate fails position-level match
    const missingCert = evaluateAnnouncementMatch(
      { ...sbkyCandidate, certificates: [] },
      catalogAnn,
    );
    expect(missingCert.eligible).toBe(false);
    expect(missingCert.missingReasons.some((r) => r.includes('Eksik sertifika'))).toBe(true);

    // When general code 4001 is present, any lisans department is allowed
    const generalAnn: Announcement = {
      ...catalogAnn,
      positions: undefined,
      criteria: {
        ...catalogAnn.criteria,
        qualificationCodes: ['4001'],
      },
    };
    expect(
      evaluateAnnouncementMatch(
        { ...sbkyCandidate, departmentId: 'hukuk' },
        generalAnn,
      ).eligible,
    ).toBe(true);
  });
});

describe('DB adapter round-trip for extended criteria and saved search filters', () => {
  it('round-trips new optional criteria and saved search fields cleanly in D1Adapter and MemoryDbAdapter', async () => {
    const enriched = enrichAnnouncementFromPdfText(
      makeBaseBozkoyAnnouncement(),
      BOZKOY_OCR_TEXT,
    );

    // MemoryDbAdapter cloning & round-trip
    const mem = new MemoryDbAdapter([]);
    await mem.upsertAnnouncements([enriched]);
    const fromMem = await mem.getAnnouncementById(enriched.id);
    expect(fromMem?.criteria.departments).toEqual(enriched.criteria.departments);
    expect(fromMem?.criteria.maxAge).toBe(30);
    expect(fromMem?.criteria.gender).toBe('hepsi');
    expect(fromMem?.criteria.extractedTextExcerpt).toBe(enriched.criteria.extractedTextExcerpt);

    // D1Adapter safeParseCriteria & safeParseSavedSearchFilters
    const storedCriteriaJson = JSON.stringify(enriched.criteria);
    const storedFiltersJson = JSON.stringify({
      city: 'NİĞDE',
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      maxKpssScore: '70',
      driverLicense: 'C',
      department: 'Spor Yöneticiliği',
    });

    const makeStmt = (query: string, bound: unknown[] = []): D1PreparedStatementLike => ({
      bind(...values: unknown[]) {
        return makeStmt(query, values);
      },
      async first<T = Record<string, unknown>>() {
        if (query.includes('SELECT COUNT(*)')) {
          return { total: 1 } as T;
        }
        if (query.includes('FROM announcements WHERE id = ?')) {
          return {
            id: enriched.id,
            external_id: enriched.externalId,
            source: enriched.source,
            source_name: enriched.sourceName,
            source_url: enriched.sourceUrl,
            institution: enriched.institution,
            title: enriched.title,
            category: enriched.category,
            city: enriched.city,
            status: enriched.status,
            published_at: enriched.publishedAt,
            deadline_at: enriched.deadlineAt,
            quota: enriched.quota,
            summary: enriched.summary,
            criteria_json: storedCriteriaJson,
            employment_type: enriched.employmentType,
            notice_type: 'ilan',
            exam_type: enriched.examType,
            organization_unit: null,
            apply_url: enriched.applyUrl,
            verified_sources_json: '[]',
            enrichment_status: 'enriched',
            content_hash: enriched.contentHash,
            last_seen_at: '2026-11-26T00:00:00Z',
            is_demo: 0,
          } as T;
        }
        return null;
      },
      async all<T = Record<string, unknown>>() {
        if (query.includes('FROM saved_searches')) {
          return {
            results: [
              {
                id: 'ss-1',
                user_id: bound[0],
                name: 'Niğde Spor Lisans',
                filters_json: storedFiltersJson,
                notify_push: 1,
                notify_email: 0,
                created_at: '2026-11-26T00:00:00Z',
              },
            ] as T[],
          };
        }
        return { results: [] as T[] };
      },
      async run() {
        return { success: true, meta: { changes: 1 } };
      },
    });

    const mockD1: D1DatabaseLike = {
      prepare: (q) => makeStmt(q),
      async batch() {
        return [];
      },
    };

    const d1 = new D1Adapter(mockD1);
    const fromD1 = await d1.getAnnouncementById(enriched.id);
    expect(fromD1?.criteria.departments).toEqual(enriched.criteria.departments);
    expect(fromD1?.criteria.maxAge).toBe(30);
    expect(fromD1?.criteria.gender).toBe('hepsi');
    expect(fromD1?.criteria.extractedTextExcerpt).toBe(enriched.criteria.extractedTextExcerpt);

    const searches = await d1.listSavedSearches('u-1');
    expect(searches).toHaveLength(1);
    expect(searches[0].filters).toEqual({
      city: 'NİĞDE',
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      maxKpssScore: '70',
      driverLicense: 'C',
      department: 'Spor Yöneticiliği',
    });
  });
});
