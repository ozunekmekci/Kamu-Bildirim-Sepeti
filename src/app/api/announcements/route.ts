import { NextResponse } from 'next/server';
import { getAnnouncementFacets } from '@/modules/announcements';
import type {
  AnnouncementCategory,
  AnnouncementFilter,
  AnnouncementSource,
  AnnouncementStatus,
} from '@/modules/announcements/types';
import { FREE_ENTITLEMENTS, getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['acik', 'kapali', 'hepsi']);
const VALID_CATEGORIES = new Set(['atama', 'personel_alimi', 'gorevlendirme', 'hepsi']);
const VALID_SOURCES = new Set([
  'kariyer_kapisi',
  'iskur',
  'resmi_gazete',
  'osym_kpss',
  'hepsi',
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status') ?? undefined;
  const rawCategory = url.searchParams.get('category') ?? undefined;
  const rawSource = url.searchParams.get('source') ?? undefined;
  const city = url.searchParams.get('city') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;

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
    city: city || undefined,
    q: q || undefined,
  };

  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  const entitlements = user
    ? (await getUserBillingState(db, user.id)).entitlements
    : FREE_ENTITLEMENTS;

  const allItems = await db.listAnnouncements(filter);
  const limit = entitlements.maxVisibleAnnouncements;
  const items = limit !== null ? allItems.slice(0, limit) : allItems;

  return NextResponse.json(
    {
      items,
      total: allItems.length,
      limited: limit !== null && allItems.length > limit,
      limit,
      plan: entitlements.plan,
      facets: getAnnouncementFacets(allItems),
    },
    { status: 200 },
  );
}
