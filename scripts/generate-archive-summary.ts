import fs from 'fs';
import path from 'path';
import { QUALIFICATIONS_BY_CODE } from '../src/data/qualifications';
import { normalizeTrSearch, toTurkishUpper } from '../src/lib/turkish';
import { PlacementRecord } from '../src/types/kpss';

interface InstitutionInsight {
  name: string;
  count: number;
  quota: number;
  avgMinScore: number | null;
}

interface QualificationCodeInsight {
  code: string;
  label: string;
  count: number;
}

interface PeriodInsight {
  period: string;
  postsCount: number;
  totalQuota: number;
  avgMinScore: number | null;
}

interface ArchiveCitySummary {
  slug: string;
  city: string;
  archivePostsCount: number;
  archiveQuota: number;
  avgMinScore: number | null;
  topInstitutions: InstitutionInsight[];
}

interface ArchiveSummary {
  totalArchivePosts: number;
  totalArchiveQuota: number;
  topInstitutions: InstitutionInsight[];
  topQualificationCodes: QualificationCodeInsight[];
  periodBreakdown: PeriodInsight[];
  cities: ArchiveCitySummary[];
}

function slugifyTurkishCity(city: string): string {
  return normalizeTrSearch(city).replace(/\s+/g, '-');
}

function canonicalizeCityName(rawCity: string): string {
  const withoutParens = rawCity.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return withoutParens ? toTurkishUpper(withoutParens) : '';
}

function isGenericNationalCity(city: string): boolean {
  const norm = normalizeTrSearch(city);
  return !norm || norm === 'turkiye geneli' || norm === 'merkez';
}

function computeAverageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const total = scores.reduce((acc, value) => acc + value, 0);
  return Number((total / scores.length).toFixed(2));
}

function parsePeriodOrderKey(period: string): number {
  const parts = period.split('/');
  const year = parseInt(parts[0] ?? '0', 10) || 0;
  const term = parseInt(parts[1] ?? '0', 10) || 0;
  return year * 100 + term;
}

function buildInstitutionInsights(records: PlacementRecord[], limit = 10): InstitutionInsight[] {
  const instMap = new Map<string, { count: number; quota: number; scores: number[] }>();

  for (const record of records) {
    if (!record.kurumAdi) continue;
    let bucket = instMap.get(record.kurumAdi);
    if (!bucket) {
      bucket = { count: 0, quota: 0, scores: [] };
      instMap.set(record.kurumAdi, bucket);
    }
    bucket.count += 1;
    bucket.quota += record.kontenjan || 0;
    if (record.tabanPuan !== null && !Number.isNaN(record.tabanPuan)) {
      bucket.scores.push(record.tabanPuan);
    }
  }

  return Array.from(instMap.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      quota: data.quota,
      avgMinScore: computeAverageScore(data.scores),
    }))
    .sort((a, b) => {
      if (b.quota !== a.quota) return b.quota - a.quota;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, 'tr-TR');
    })
    .slice(0, limit);
}

function buildArchiveSummary(records: PlacementRecord[]): ArchiveSummary {
  let totalArchiveQuota = 0;
  const codeCounts = new Map<string, number>();
  const periodMap = new Map<
    string,
    { postsCount: number; totalQuota: number; scores: number[] }
  >();
  const cityMap = new Map<
    string,
    { city: string; records: PlacementRecord[]; archiveQuota: number; scores: number[] }
  >();

  for (const record of records) {
    const quota = record.kontenjan || 0;
    totalArchiveQuota += quota;

    if (record.donem) {
      let periodBucket = periodMap.get(record.donem);
      if (!periodBucket) {
        periodBucket = { postsCount: 0, totalQuota: 0, scores: [] };
        periodMap.set(record.donem, periodBucket);
      }
      periodBucket.postsCount += 1;
      periodBucket.totalQuota += quota;
      if (record.tabanPuan !== null && !Number.isNaN(record.tabanPuan)) {
        periodBucket.scores.push(record.tabanPuan);
      }
    }

    const uniqueCodes = new Set(record.nitelikKodlari ?? []);
    for (const code of uniqueCodes) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }

    const canonical = canonicalizeCityName(record.sehir);
    if (!canonical || isGenericNationalCity(canonical)) continue;
    const slug = slugifyTurkishCity(canonical);
    if (!slug || slug === 'turkiye-geneli' || slug === 'merkez') continue;

    let cityBucket = cityMap.get(slug);
    if (!cityBucket) {
      cityBucket = { city: canonical, records: [], archiveQuota: 0, scores: [] };
      cityMap.set(slug, cityBucket);
    }
    cityBucket.records.push(record);
    cityBucket.archiveQuota += quota;
    if (record.tabanPuan !== null && !Number.isNaN(record.tabanPuan)) {
      cityBucket.scores.push(record.tabanPuan);
    }
  }

  const topQualificationCodes: QualificationCodeInsight[] = Array.from(codeCounts.entries())
    .map(([code, count]) => ({
      code,
      label: QUALIFICATIONS_BY_CODE[code]?.kisaTanim ?? `Nitelik Kodu ${code}`,
      count,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.code.localeCompare(b.code, 'tr-TR');
    })
    .slice(0, 10);

  const periodBreakdown: PeriodInsight[] = Array.from(periodMap.entries())
    .map(([period, data]) => ({
      period,
      postsCount: data.postsCount,
      totalQuota: data.totalQuota,
      avgMinScore: computeAverageScore(data.scores),
    }))
    .sort((a, b) => parsePeriodOrderKey(a.period) - parsePeriodOrderKey(b.period));

  const cities: ArchiveCitySummary[] = Array.from(cityMap.entries())
    .map(([slug, bucket]) => ({
      slug,
      city: bucket.city,
      archivePostsCount: bucket.records.length,
      archiveQuota: bucket.archiveQuota,
      avgMinScore: computeAverageScore(bucket.scores),
      topInstitutions: buildInstitutionInsights(bucket.records, 10),
    }))
    .sort((a, b) => {
      if (b.archiveQuota !== a.archiveQuota) return b.archiveQuota - a.archiveQuota;
      if (b.archivePostsCount !== a.archivePostsCount) {
        return b.archivePostsCount - a.archivePostsCount;
      }
      return a.city.localeCompare(b.city, 'tr-TR');
    });

  return {
    totalArchivePosts: records.length,
    totalArchiveQuota,
    topInstitutions: buildInstitutionInsights(records, 10),
    topQualificationCodes,
    periodBreakdown,
    cities,
  };
}

function main() {
  const inputPath = path.resolve(process.cwd(), 'src/data/kpss_records.json');
  const outputPath = path.resolve(process.cwd(), 'src/data/kpss_archive_summary.json');

  const records = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as PlacementRecord[];
  const summary = buildArchiveSummary(records);
  const serialized = JSON.stringify(summary);

  fs.writeFileSync(outputPath, serialized, 'utf-8');
  const byteSize = Buffer.byteLength(serialized, 'utf-8');
  console.log(
    `Generated ${outputPath} (${byteSize} bytes, ${summary.totalArchivePosts} posts, ${summary.cities.length} cities)`
  );
}

main();
