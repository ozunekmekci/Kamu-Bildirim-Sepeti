import { NextResponse } from 'next/server';
import { filterAnnouncements, getAnnouncementFacets } from '@/modules/announcements';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementFilter,
  AnnouncementSource,
  AnnouncementStatus,
  EmploymentType,
  ExamType,
  NoticeType,
} from '@/modules/announcements/types';
import { FREE_ENTITLEMENTS, getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['acik', 'kapali', 'hepsi']);
const VALID_CATEGORIES = new Set(['atama', 'personel_alimi', 'gorevlendirme', 'hepsi']);
const VALID_SOURCES = new Set([
  'kariyer_kapisi',
  'sbb',
  'iskur',
  'resmi_gazete',
  'osym_kpss',
  'hepsi',
]);
const VALID_EMPLOYMENT_TYPES = new Set([
  'memur_a',
  'memur_b',
  'memur_ab',
  'sozlesmeli_4b',
  'akademik',
  'isci',
  'askeri_guvenlik',
  'gorevde_yukselme',
  'diger',
  'hepsi',
]);
const VALID_EXAM_TYPES = new Set([
  'kpss_only',
  'oral_exam',
  'written_and_oral',
  'practice_exam',
  'unspecified',
  'hepsi',
]);
const VALID_NOTICE_TYPES = new Set(['ilan', 'duzeltme', 'iptal', 'sonuc', 'hepsi']);
const VALID_EDUCATION_LEVELS = new Set(['lisans', 'onlisans', 'ortaogretim', 'hepsi']);
const VALID_KPSS_SCORE_TYPES = new Set(['P3', 'P93', 'P94', 'hepsi']);

function buildCategoryCounts(items: Announcement[]) {
  const employmentTypes: Record<EmploymentType, number> = {
    memur_a: 0,
    memur_b: 0,
    sozlesmeli_4b: 0,
    akademik: 0,
    isci: 0,
    askeri_guvenlik: 0,
    gorevde_yukselme: 0,
    diger: 0,
  };
  const examTypes: Record<ExamType, number> = {
    kpss_only: 0,
    oral_exam: 0,
    written_and_oral: 0,
    practice_exam: 0,
    unspecified: 0,
  };
  const noticeTypes: Record<NoticeType, number> = {
    ilan: 0,
    duzeltme: 0,
    iptal: 0,
    sonuc: 0,
  };

  for (const item of items) {
    const emp = item.employmentType ?? 'diger';
    const exam = item.examType ?? 'unspecified';
    const notice = item.noticeType ?? 'ilan';
    employmentTypes[emp] = (employmentTypes[emp] ?? 0) + 1;
    examTypes[exam] = (examTypes[exam] ?? 0) + 1;
    noticeTypes[notice] = (noticeTypes[notice] ?? 0) + 1;
  }

  return {
    ...employmentTypes,
    employmentTypes,
    examTypes,
    noticeTypes,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status') ?? undefined;
  const rawCategory = url.searchParams.get('category') ?? undefined;
  const rawSource = url.searchParams.get('source') ?? undefined;
  const rawEmploymentType = url.searchParams.get('employmentType') ?? undefined;
  const rawExamType = url.searchParams.get('examType') ?? undefined;
  const rawNoticeType = url.searchParams.get('noticeType') ?? undefined;
  const city = url.searchParams.get('city') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const rawEducationLevel = url.searchParams.get('educationLevel') ?? undefined;
  const rawKpssScoreType = url.searchParams.get('kpssScoreType') ?? undefined;
  const rawMaxKpssScore = url.searchParams.get('maxKpssScore') ?? undefined;
  const rawDriverLicense = url.searchParams.get('driverLicense') ?? undefined;
  const rawDepartment = url.searchParams.get('department') ?? undefined;

  const normalizedKpssScoreType = rawKpssScoreType
    ? rawKpssScoreType.trim().toLowerCase() === 'hepsi'
      ? 'hepsi'
      : rawKpssScoreType.trim().toUpperCase()
    : undefined;
  const parsedMaxKpssScore =
    rawMaxKpssScore && rawMaxKpssScore.trim() !== ''
      ? Number(rawMaxKpssScore.trim().replace(',', '.'))
      : undefined;
  const validMaxKpssScore =
    parsedMaxKpssScore !== undefined &&
    Number.isFinite(parsedMaxKpssScore) &&
    parsedMaxKpssScore >= 0 &&
    parsedMaxKpssScore <= 100
      ? parsedMaxKpssScore
      : undefined;
  const cleanedDriverLicense = rawDriverLicense?.trim().slice(0, 16) || undefined;
  const cleanedDepartment = rawDepartment?.trim().slice(0, 120) || undefined;

  const filter: AnnouncementFilter = {
    status:
      rawStatus && VALID_STATUSES.has(rawStatus)
        ? (rawStatus as AnnouncementStatus | 'hepsi')
        : undefined,
    category:
      rawCategory && VALID_CATEGORIES.has(rawCategory)
        ? (rawCategory as AnnouncementCategory | 'hepsi')
        : undefined,
    source:
      rawSource && VALID_SOURCES.has(rawSource)
        ? (rawSource as AnnouncementSource | 'hepsi')
        : undefined,
    employmentType:
      rawEmploymentType && VALID_EMPLOYMENT_TYPES.has(rawEmploymentType)
        ? (rawEmploymentType as EmploymentType | 'memur_ab' | 'hepsi')
        : undefined,
    examType:
      rawExamType && VALID_EXAM_TYPES.has(rawExamType)
        ? (rawExamType as ExamType | 'hepsi')
        : undefined,
    noticeType:
      rawNoticeType && VALID_NOTICE_TYPES.has(rawNoticeType)
        ? (rawNoticeType as NoticeType | 'hepsi')
        : undefined,
    city: city || undefined,
    q: q || undefined,
    educationLevel:
      rawEducationLevel && VALID_EDUCATION_LEVELS.has(rawEducationLevel)
        ? (rawEducationLevel as 'lisans' | 'onlisans' | 'ortaogretim' | 'hepsi')
        : undefined,
    kpssScoreType:
      normalizedKpssScoreType && VALID_KPSS_SCORE_TYPES.has(normalizedKpssScoreType)
        ? (normalizedKpssScoreType as 'P3' | 'P93' | 'P94' | 'hepsi')
        : undefined,
    maxKpssScore: validMaxKpssScore,
    driverLicense:
      cleanedDriverLicense && cleanedDriverLicense.toLowerCase() !== 'hepsi'
        ? cleanedDriverLicense
        : undefined,
    department: cleanedDepartment,
  };

  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  const entitlements = user
    ? (await getUserBillingState(db, user.id)).entitlements
    : FREE_ENTITLEMENTS;

  const [baseItems, checkpoints] = await Promise.all([
    db.listAnnouncements({ status: 'hepsi' }),
    db.listSourceCheckpoints(),
  ]);

  const allItems = filterAnnouncements(baseItems, filter);
  const liveOpenBySource: Record<string, number> = {};
  let openTotal = 0;
  let closedTotal = 0;
  for (const item of baseItems) {
    if (item.status === 'acik') {
      openTotal += 1;
      liveOpenBySource[item.source] = (liveOpenBySource[item.source] ?? 0) + 1;
    } else {
      closedTotal += 1;
    }
  }

  const alignedCheckpoints = checkpoints.map((cp) => {
    const liveOpen = liveOpenBySource[cp.source] ?? 0;
    return liveOpen > 0 ? { ...cp, activeCount: liveOpen } : cp;
  });

  const statusScoped =
    filter.status && filter.status !== 'hepsi'
      ? baseItems.filter((item) => item.status === filter.status)
      : baseItems;

  const limit = entitlements.maxVisibleAnnouncements;
  const visible = limit !== null ? allItems.slice(0, limit) : allItems;
  const items = visible.map(({ positions, ...rest }) => ({
    ...rest,
    positionsCount: rest.positionsCount ?? positions?.length ?? 0,
  }));

  const lastCheckedAt =
    alignedCheckpoints
      .map((cp) => cp.lastCheckedAt)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return NextResponse.json(
    {
      items,
      total: allItems.length,
      openTotal,
      closedTotal,
      limited: limit !== null && allItems.length > limit,
      limit,
      plan: entitlements.plan,
      facets: getAnnouncementFacets(baseItems),
      categoryCounts: buildCategoryCounts(statusScoped),
      freshness: {
        lastCheckedAt,
        checkpoints: alignedCheckpoints,
      },
    },
    { status: 200 },
  );
}
