import { NextResponse } from 'next/server';
import { getUserBillingState } from '@/modules/billing';
import { getDb } from '@/modules/db';
import {
  getAuthenticatedUser,
  getSessionTokenFromRequest,
  getUserProfile,
} from '@/modules/identity';
import { matchAnnouncementsForProfile } from '@/modules/matching';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return NextResponse.json(
      { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  const [profile, billing, openAnnouncements] = await Promise.all([
    getUserProfile(db, user.id),
    getUserBillingState(db, user.id),
    db.listAnnouncements({ status: 'acik' }),
  ]);

  const evaluated = matchAnnouncementsForProfile(profile, openAnnouncements);
  const matched = evaluated.filter((item) => item.evaluation.eligible);
  const locked = !billing.entitlements.canUseProfileMatch;
  const profileConfigured = Boolean(
    profile.educationLevel ||
      profile.departmentId ||
      profile.kpssScoreType ||
      profile.kpssScore !== null ||
      profile.residenceCity ||
      profile.qualificationCodes.length > 0,
  );

  return NextResponse.json(
    {
      locked,
      items: locked ? [] : matched,
      totalMatches: matched.length,
      evaluatedCount: evaluated.length,
      profileConfigured,
      plan: billing.entitlements.plan,
    },
    { status: 200 },
  );
}
