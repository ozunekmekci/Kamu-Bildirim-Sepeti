import { describe, expect, it } from 'vitest';
import { Announcement, INITIAL_ANNOUNCEMENTS } from '@/modules/announcements';
import {
  MatchingProfileInput,
  evaluateAnnouncementMatch,
  matchAnnouncementsForProfile,
} from '@/modules/matching';

function byId(id: string): Announcement {
  const found = INITIAL_ANNOUNCEMENTS.find((item) => item.id === id);
  if (!found) throw new Error(`Missing seed announcement: ${id}`);
  return found;
}

describe('matching engine', () => {
  it('returns eligible=true and matchScore=100 when all criteria match', () => {
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
    };

    const result = evaluateAnnouncementMatch(profile, byId('kk-2026-101'));
    expect(result.announcementId).toBe('kk-2026-101');
    expect(result.eligible).toBe(true);
    expect(result.matchScore).toBe(100);
    expect(result.missingReasons).toEqual([]);
    expect(result.unknownReasons).toEqual([]);
    expect(result.matchedReasons.length).toBeGreaterThanOrEqual(5);
  });

  it('supports general fallback qualification codes (4001/3001/2001) and equivalent codes', () => {
    const lisansGeneralProfile: MatchingProfileInput = {
      educationLevel: 'lisans',
      departmentId: 'hukuk', // 4419 with genelNitelikKodu 4001
      kpssScoreType: 'P3',
      kpssScore: 76,
      residenceCity: 'Ankara',
      militaryStatus: 'muaf',
      driverLicenses: [],
      certificates: ['6225'],
      qualificationCodes: [],
    };

    const sgkResult = evaluateAnnouncementMatch(lisansGeneralProfile, byId('kk-2026-105'));
    expect(sgkResult.eligible).toBe(true);
    expect(sgkResult.matchedReasons.some((r) => r.includes('4001'))).toBe(true);

    const yazilimProfile: MatchingProfileInput = {
      educationLevel: 'lisans',
      departmentId: 'yazilim-muhendisligi', // 4539 with esdegerKodlar ['4531']
      kpssScoreType: 'P3',
      kpssScore: 78,
      residenceCity: 'İstanbul',
      militaryStatus: 'yapildi',
      driverLicenses: [],
      certificates: ['6225'],
      qualificationCodes: [],
    };
    const adaletResult = evaluateAnnouncementMatch(yazilimProfile, byId('kk-2026-101'));
    expect(adaletResult.eligible).toBe(true);

    const onlisansProfile: MatchingProfileInput = {
      educationLevel: 'onlisans',
      departmentId: 'buro-yonetimi-onlisans', // 3029 with genelNitelikKodu 3001
      kpssScoreType: 'P93',
      kpssScore: 68,
      residenceCity: 'Van',
      militaryStatus: 'yapildi',
      driverLicenses: ['B'],
      certificates: [],
      qualificationCodes: [],
    };
    const afadResult = evaluateAnnouncementMatch(onlisansProfile, byId('kk-2026-107'));
    expect(afadResult.eligible).toBe(true);
    expect(afadResult.matchedReasons.some((r) => r.includes('3001'))).toBe(true);

    const liseProfile: MatchingProfileInput = {
      educationLevel: 'ortaogretim',
      departmentId: 'bilisim-teknolojileri-ortaogretim', // 2061 with genelNitelikKodu 2001
      kpssScoreType: null,
      kpssScore: null,
      residenceCity: 'Ankara',
      militaryStatus: 'yapildi',
      driverLicenses: ['B'],
      certificates: [],
      qualificationCodes: [],
    };
    const askiResult = evaluateAnnouncementMatch(liseProfile, byId('isk-2026-205'));
    expect(askiResult.eligible).toBe(true);
    expect(askiResult.matchedReasons.some((r) => r.includes('2001'))).toBe(true);
  });

  it('rejects insufficient KPSS score, wrong education level, and city mismatch', () => {
    const profile: MatchingProfileInput = {
      educationLevel: 'onlisans',
      departmentId: 'adalet-onlisans',
      kpssScoreType: 'P93',
      kpssScore: 62,
      residenceCity: 'Trabzon',
      militaryStatus: 'yapildi',
      driverLicenses: [],
      certificates: [],
      qualificationCodes: [],
    };

    const ticaretResult = evaluateAnnouncementMatch(profile, byId('kk-2026-103'));
    expect(ticaretResult.eligible).toBe(false);
    expect(ticaretResult.matchScore).toBeLessThan(50);
    expect(ticaretResult.missingReasons.length).toBeGreaterThanOrEqual(4);
  });

  it('flags militaryStatus tecilli or ilgisiz when militaryRequired is true, and passes yapildi/muaf', () => {
    const baseProfile: MatchingProfileInput = {
      educationLevel: 'lisans',
      departmentId: 'hukuk',
      kpssScoreType: 'P3',
      kpssScore: 80,
      residenceCity: 'İstanbul',
      militaryStatus: 'tecilli',
      driverLicenses: ['B'],
      certificates: [],
      qualificationCodes: [],
    };

    const tecilliResult = evaluateAnnouncementMatch(baseProfile, byId('kk-2026-103'));
    expect(tecilliResult.eligible).toBe(false);
    expect(tecilliResult.missingReasons.some((r) => r.includes('Askerlik'))).toBe(true);

    const ilgisizResult = evaluateAnnouncementMatch(
      { ...baseProfile, militaryStatus: 'ilgisiz' },
      byId('kk-2026-103')
    );
    expect(ilgisizResult.eligible).toBe(false);
    expect(ilgisizResult.missingReasons.some((r) => r.includes('Askerlik'))).toBe(true);

    const muafResult = evaluateAnnouncementMatch(
      { ...baseProfile, militaryStatus: 'muaf' },
      byId('kk-2026-103')
    );
    expect(muafResult.eligible).toBe(true);
  });

  it('evaluates Turkish city normalization, YDS hierarchy, and driver license coverage', () => {
    const profile: MatchingProfileInput = {
      educationLevel: 'lisans',
      departmentId: 'elektrik-elektronik-muhendisligi',
      kpssScoreType: 'P3',
      kpssScore: 85,
      residenceCity: 'istanbul',
      militaryStatus: 'yapildi',
      driverLicenses: ['E'], // covers B/C/D
      certificates: ['YDS-B'], // satisfies YDS-C and YDS-D
      qualificationCodes: [],
    };

    const dhmiResult = evaluateAnnouncementMatch(profile, byId('rg-2026-305'));
    expect(dhmiResult.eligible).toBe(true);

    const cevreResult = evaluateAnnouncementMatch(
      { ...profile, residenceCity: 'konya' },
      byId('kk-2026-104')
    );
    expect(cevreResult.eligible).toBe(true);
  });

  it('tracks unknownReasons when profile fields are incomplete', () => {
    const emptyProfile: MatchingProfileInput = {
      educationLevel: null,
      departmentId: null,
      kpssScoreType: null,
      kpssScore: null,
      residenceCity: null,
      militaryStatus: null,
      driverLicenses: [],
      certificates: [],
      qualificationCodes: [],
    };

    const result = evaluateAnnouncementMatch(emptyProfile, byId('kk-2026-101'));
    expect(result.eligible).toBe(false);
    expect(result.unknownReasons.length).toBeGreaterThanOrEqual(4);
  });

  it('sorts matched announcements with eligible first and highest matchScore first', () => {
    const profile: MatchingProfileInput = {
      educationLevel: 'onlisans',
      departmentId: 'tibbi-dokumantasyon-onlisans',
      kpssScoreType: 'P93',
      kpssScore: 72,
      residenceCity: 'Ankara',
      militaryStatus: 'muaf',
      driverLicenses: [],
      certificates: ['6225'],
      qualificationCodes: [],
    };

    const ranked = matchAnnouncementsForProfile(profile, INITIAL_ANNOUNCEMENTS);
    expect(ranked).toHaveLength(INITIAL_ANNOUNCEMENTS.length);
    expect(ranked[0].evaluation.eligible).toBe(true);

    const firstIneligibleIdx = ranked.findIndex((item) => !item.evaluation.eligible);
    expect(firstIneligibleIdx).toBeGreaterThan(0);
    for (let i = firstIneligibleIdx; i < ranked.length; i++) {
      expect(ranked[i].evaluation.eligible).toBe(false);
    }
  });
});
