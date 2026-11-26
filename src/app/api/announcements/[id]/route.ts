import { NextResponse } from 'next/server';
import { enrichAnnouncementOnDemand } from '@/modules/announcements/service';
import { getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import {
  getAuthenticatedUser,
  getSessionTokenFromRequest,
  getUserProfile,
} from '@/modules/identity';
import { evaluateAnnouncementMatch } from '@/modules/matching';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = await getDb();
  const found = await db.getAnnouncementById(id);

  if (!found) {
    return NextResponse.json(
      { error: 'İlan bulunamadı.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  const enriched = await enrichAnnouncementOnDemand(db, found);
  const positions =
    enriched.positions ?? (await db.listAnnouncementPositions(enriched.id));
  const announcement = {
    ...enriched,
    positions,
    positionsCount: positions.length,
  };

  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return NextResponse.json(
      {
        announcement,
        positions,
        saved: false,
        match: null,
        canUseProfileMatch: false,
        plan: 'free' as const,
      },
      { status: 200 },
    );
  }

  const [profile, billing, savedIds] = await Promise.all([
    getUserProfile(db, user.id),
    getUserBillingState(db, user.id),
    db.listSavedAnnouncementIds(user.id),
  ]);

  const evaluation = evaluateAnnouncementMatch(profile, announcement);

  return NextResponse.json(
    {
      announcement,
      positions,
      saved: savedIds.includes(announcement.id),
      match: billing.entitlements.canUseProfileMatch ? evaluation : null,
      canUseProfileMatch: billing.entitlements.canUseProfileMatch,
      plan: billing.entitlements.plan,
    },
    { status: 200 },
  );
}
