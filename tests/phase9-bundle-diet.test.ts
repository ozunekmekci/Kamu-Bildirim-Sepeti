import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PLACEMENT_RECORDS } from '@/data/records';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';
import {
  getCityLandingData,
  getCitySeoCatalog,
  getPublicInsightsSummary,
} from '@/modules/analytics';

describe('Phase 9 Bundle Diet - Precomputed KPSS Archive Summary', () => {
  it('public-insights.ts does not import @/data/records or kpss_records.json', () => {
    const sourcePath = path.resolve(
      process.cwd(),
      'src/modules/analytics/public-insights.ts'
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');

    expect(source).not.toContain('@/data/records');
    expect(source).not.toContain('kpss_records.json');
    expect(source).toContain('@/data/kpss_archive_summary.json');
  });

  it('kpss_archive_summary.json exists and stays under 100 KB', () => {
    const summaryPath = path.resolve(
      process.cwd(),
      'src/data/kpss_archive_summary.json'
    );
    const stats = fs.statSync(summaryPath);

    expect(stats.size).toBeGreaterThan(0);
    expect(stats.size).toBeLessThan(100 * 1024);
  });

  it('getPublicInsightsSummary default call matches explicit PLACEMENT_RECORDS call exactly', () => {
    const precomputed = getPublicInsightsSummary();
    const dynamic = getPublicInsightsSummary(PLACEMENT_RECORDS);

    expect(precomputed).toEqual(dynamic);
  });

  it('getCitySeoCatalog default call matches explicit PLACEMENT_RECORDS call exactly', () => {
    const precomputed = getCitySeoCatalog();
    const dynamic = getCitySeoCatalog(PLACEMENT_RECORDS);

    expect(precomputed).toEqual(dynamic);
  });

  it('getCityLandingData default calls match explicit PLACEMENT_RECORDS calls for ankara and yozgat', () => {
    expect(getCityLandingData('ankara')).toEqual(
      getCityLandingData('ankara', INITIAL_ANNOUNCEMENTS, PLACEMENT_RECORDS)
    );
    expect(getCityLandingData('yozgat')).toEqual(
      getCityLandingData('yozgat', INITIAL_ANNOUNCEMENTS, PLACEMENT_RECORDS)
    );
  });

  it('handles announcement-only cities cleanly without archive records', () => {
    const baseAnnouncement = INITIAL_ANNOUNCEMENTS[0];
    const customAnnouncements = [
      {
        ...baseAnnouncement,
        id: 'test-announcement-only-city',
        city: 'Testşehir',
        status: 'acik' as const,
        criteria: {
          ...baseAnnouncement.criteria,
          cities: ['Testşehir'],
        },
      },
    ];

    const landing = getCityLandingData('testsehir', customAnnouncements);
    expect(landing).not.toBeNull();
    expect(landing?.archivePostsCount).toBe(0);
    expect(landing?.archiveQuota).toBe(0);
    expect(landing?.avgMinScore).toBeNull();
    expect(landing?.topInstitutions).toEqual([]);
    expect(landing?.announcements).toHaveLength(1);

    const catalog = getCitySeoCatalog(undefined, customAnnouncements);
    const entry = catalog.find((c) => c.slug === 'testsehir');
    expect(entry).toEqual({
      slug: 'testsehir',
      city: 'TESTŞEHİR',
      openAnnouncementsCount: 1,
      archivePostsCount: 0,
      archiveQuota: 0,
      avgMinScore: null,
    });
  });
});
