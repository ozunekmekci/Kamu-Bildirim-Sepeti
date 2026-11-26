import { describe, it, expect } from 'vitest';
import { PLACEMENT_RECORDS } from '@/data/records';
import { QUALIFICATIONS_BY_CODE } from '@/data/qualifications';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';
import {
  slugifyTurkishCity,
  getPublicInsightsSummary,
  getCitySeoCatalog,
  getCityLandingData,
  getSourceLandingData,
  compareProfileScenarios,
} from '@/modules/analytics';
import { MatchingProfileInput } from '@/modules/matching';
import sitemap from '@/app/sitemap';

describe('Phase 3 Public Analytics & Programmatic SEO', () => {
  it('slugifyTurkishCity normalizes Turkish characters and whitespace cleanly', () => {
    expect(slugifyTurkishCity('İSTANBUL')).toBe('istanbul');
    expect(slugifyTurkishCity('İZMİR')).toBe('izmir');
    expect(slugifyTurkishCity('ESKİŞEHİR')).toBe('eskisehir');
    expect(slugifyTurkishCity('ŞANLIURFA')).toBe('sanliurfa');
    expect(slugifyTurkishCity('KAHRAMANMARAŞ')).toBe('kahramanmaras');
    expect(slugifyTurkishCity('AĞRI')).toBe('agri');
    expect(slugifyTurkishCity('  Afyonkarahisar  ')).toBe('afyonkarahisar');
  });

  it('getPublicInsightsSummary computes exact sums directly from PLACEMENT_RECORDS and INITIAL_ANNOUNCEMENTS', () => {
    const summary = getPublicInsightsSummary();
    const expectedArchiveQuota = PLACEMENT_RECORDS.reduce((acc, r) => acc + r.kontenjan, 0);
    const expectedOpenCount = INITIAL_ANNOUNCEMENTS.filter((a) => a.status === 'acik').length;

    expect(summary.totalArchivePosts).toBe(PLACEMENT_RECORDS.length);
    expect(summary.totalArchiveQuota).toBe(expectedArchiveQuota);
    expect(summary.totalOpenAnnouncements).toBe(expectedOpenCount);
    expect(summary.totalAllAnnouncements).toBe(INITIAL_ANNOUNCEMENTS.length);

    expect(summary.topInstitutions).toHaveLength(10);
    for (let i = 1; i < summary.topInstitutions.length; i += 1) {
      expect(summary.topInstitutions[i - 1].quota).toBeGreaterThanOrEqual(
        summary.topInstitutions[i].quota
      );
    }

    expect(summary.topCities).toHaveLength(15);
    expect(summary.topCities.some((c) => c.slug === 'turkiye-geneli')).toBe(false);
    expect(summary.topCities.some((c) => c.slug === 'istanbul')).toBe(true);
    expect(summary.topCities.some((c) => c.slug === 'ankara')).toBe(true);

    expect(summary.topQualificationCodes).toHaveLength(10);
    for (const item of summary.topQualificationCodes) {
      expect(item.count).toBeGreaterThan(0);
      if (QUALIFICATIONS_BY_CODE[item.code]) {
        expect(item.label).toBe(QUALIFICATIONS_BY_CODE[item.code].kisaTanim);
      }
    }

    expect(summary.periodBreakdown.map((p) => p.period)).toEqual(['2024/1', '2024/2', '2024/5']);
    const periodPostsSum = summary.periodBreakdown.reduce((acc, p) => acc + p.postsCount, 0);
    const periodQuotaSum = summary.periodBreakdown.reduce((acc, p) => acc + p.totalQuota, 0);
    expect(periodPostsSum).toBe(summary.totalArchivePosts);
    expect(periodQuotaSum).toBe(summary.totalArchiveQuota);

    expect(summary.categoryBreakdown.map((c) => c.category)).toEqual([
      'atama',
      'personel_alimi',
      'gorevlendirme',
    ]);
    const catOpenSum = summary.categoryBreakdown.reduce((acc, c) => acc + c.openCount, 0);
    const catTotalSum = summary.categoryBreakdown.reduce((acc, c) => acc + c.totalCount, 0);
    expect(catOpenSum).toBe(summary.totalOpenAnnouncements);
    expect(catTotalSum).toBe(summary.totalAllAnnouncements);
  });

  it('getCitySeoCatalog excludes generic Türkiye Geneli and returns clean 81-province slugs', () => {
    const catalog = getCitySeoCatalog();
    expect(catalog.length).toBe(81);
    expect(catalog.some((c) => c.slug === 'turkiye-geneli')).toBe(false);
    expect(catalog.some((c) => c.slug.includes('kombinasi'))).toBe(false);

    const slugs = new Set(catalog.map((c) => c.slug));
    expect(slugs.size).toBe(catalog.length);
    expect(slugs.has('ankara')).toBe(true);
    expect(slugs.has('istanbul')).toBe(true);
    expect(slugs.has('izmir')).toBe(true);
    expect(slugs.has('yozgat')).toBe(true);

    const yozgat = catalog.find((c) => c.slug === 'yozgat');
    expect(yozgat?.archivePostsCount).toBe(136);
    expect(yozgat?.archiveQuota).toBe(321);
  });

  it('getCityLandingData resolves normalized Turkish slugs and returns null for unknown or generic slugs', () => {
    const ankara = getCityLandingData('ankara');
    expect(ankara).not.toBeNull();
    expect(ankara?.slug).toBe('ankara');
    expect(ankara?.city).toBe('ANKARA');
    expect(ankara?.announcements.length).toBeGreaterThan(0);
    expect(ankara?.archivePostsCount).toBeGreaterThan(0);
    expect(ankara?.archiveQuota).toBeGreaterThan(0);
    expect(ankara?.topInstitutions.length).toBeGreaterThan(0);

    const ankaraUpper = getCityLandingData('ANKARA');
    expect(ankaraUpper?.slug).toBe('ankara');
    expect(ankaraUpper?.archiveQuota).toBe(ankara?.archiveQuota);

    const istanbul = getCityLandingData('İSTANBUL');
    expect(istanbul).not.toBeNull();
    expect(istanbul?.slug).toBe('istanbul');
    expect(istanbul?.announcements.length).toBeGreaterThan(0);

    expect(getCityLandingData('turkiye-geneli')).toBeNull();
    expect(getCityLandingData('bilinmeyen-sehir')).toBeNull();
    expect(getCityLandingData('')).toBeNull();
  });

  it('getSourceLandingData resolves official source slugs and rejects unknown ones', () => {
    const kariyer = getSourceLandingData('kariyer-kapisi');
    expect(kariyer).not.toBeNull();
    expect(kariyer?.source).toBe('kariyer_kapisi');
    expect(kariyer?.sourceName).toBe('Kariyer Kapısı');
    expect(kariyer?.sourceUrl).toBe('https://kariyerkapisi.gov.tr');
    expect(kariyer?.announcements.every((a) => a.source === 'kariyer_kapisi')).toBe(true);

    const iskur = getSourceLandingData('iskur');
    expect(iskur).not.toBeNull();
    expect(iskur?.source).toBe('iskur');
    expect(iskur?.announcements.every((a) => a.source === 'iskur')).toBe(true);

    const resmiGazete = getSourceLandingData('resmi-gazete');
    expect(resmiGazete).not.toBeNull();
    expect(resmiGazete?.source).toBe('resmi_gazete');
    expect(resmiGazete?.announcements.every((a) => a.source === 'resmi_gazete')).toBe(true);

    expect(getSourceLandingData('gecersiz-kaynak')).toBeNull();
  });

  it('compareProfileScenarios calculates gained and lost open announcements accurately', () => {
    const baseProfile: MatchingProfileInput = {
      educationLevel: 'lisans',
      departmentId: 'bilgisayar-muhendisligi',
      kpssScoreType: 'P3',
      kpssScore: 68,
      residenceCity: 'ANKARA',
      militaryStatus: 'yapildi',
      driverLicenses: [],
      certificates: ['6225', 'YDS-C'],
      qualificationCodes: ['4531', '4001', '6225', 'YDS-C'],
    };

    const higherScoreAndLicenseProfile: MatchingProfileInput = {
      ...baseProfile,
      kpssScore: 85,
      driverLicenses: ['B'],
    };

    const gainResult = compareProfileScenarios(baseProfile, higherScoreAndLicenseProfile);
    expect(gainResult.altEligibleCount).toBeGreaterThan(gainResult.baseEligibleCount);
    expect(gainResult.deltaCount).toBe(
      gainResult.altEligibleCount - gainResult.baseEligibleCount
    );
    expect(gainResult.deltaCount).toBe(gainResult.gained.length - gainResult.lost.length);
    expect(gainResult.gained.length).toBeGreaterThan(0);
    expect(gainResult.lost).toHaveLength(0);
    expect(gainResult.gained.every((a) => a.status === 'acik')).toBe(true);

    const lowerScoreProfile: MatchingProfileInput = {
      ...higherScoreAndLicenseProfile,
      kpssScore: 60,
      residenceCity: 'İZMİR',
    };
    const reverseResult = compareProfileScenarios(
      higherScoreAndLicenseProfile,
      lowerScoreProfile
    );
    expect(reverseResult.deltaCount).toBeLessThan(0);
    expect(reverseResult.lost.length).toBeGreaterThan(0);
    expect(reverseResult.deltaCount).toBe(
      reverseResult.gained.length - reverseResult.lost.length
    );
  });

  it('sitemap includes root entry at index 0 plus /analiz, /kaynak/*, and top 15 /sehir/* entries', () => {
    const entries = sitemap();
    expect(entries[0].priority).toBe(1.0);
    expect(entries[0].changeFrequency).toBe('daily');
    expect(entries[0].url.endsWith('/')).toBe(true);

    const paths = entries.map((e) => new URL(e.url).pathname);
    expect(paths).toContain('/analiz');
    expect(paths).toContain('/kpss-arsivi');
    expect(paths).toContain('/kaynak/kariyer-kapisi');
    expect(paths).toContain('/kaynak/iskur');
    expect(paths).toContain('/kaynak/resmi-gazete');

    const top15 = getCitySeoCatalog().slice(0, 15);
    for (const city of top15) {
      expect(paths).toContain(`/sehir/${city.slug}`);
    }
    const cityPaths = paths.filter((p) => p.startsWith('/sehir/'));
    expect(cityPaths).toHaveLength(15);
  });
});
