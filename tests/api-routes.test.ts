import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE as deleteAccountHandler } from '@/app/api/account/route';
import { GET as getAnnouncementByIdHandler } from '@/app/api/announcements/[id]/route';
import { GET as getMatchedAnnouncementsHandler } from '@/app/api/announcements/matched/route';
import { GET as getAnnouncementsHandler } from '@/app/api/announcements/route';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import { GET as meHandler } from '@/app/api/auth/me/route';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { POST as changePlanHandler } from '@/app/api/billing/plan/route';
import { GET as getBillingHandler } from '@/app/api/billing/route';
import { POST as cronSyncHandler } from '@/app/api/cron/sync/route';
import {
  GET as getNotificationPrefsHandler,
  PUT as updateNotificationPrefsHandler,
} from '@/app/api/notifications/preferences/route';
import {
  GET as getProfileHandler,
  PUT as updateProfileHandler,
} from '@/app/api/profile/route';
import {
  DELETE as deleteSavedHandler,
  GET as getSavedHandler,
  POST as saveAnnouncementHandler,
} from '@/app/api/saved/route';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements';
import { resetMemoryDb } from '@/modules/db';

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

describe('API route handlers end-to-end', () => {
  beforeEach(() => {
    resetMemoryDb();
  });

  it('rejects unauthenticated access on protected endpoints', async () => {
    const profileRes = await getProfileHandler(new Request('http://localhost/api/profile'));
    expect(profileRes.status).toBe(401);

    const matchedRes = await getMatchedAnnouncementsHandler(
      new Request('http://localhost/api/announcements/matched'),
    );
    expect(matchedRes.status).toBe(401);

    const savedRes = await getSavedHandler(new Request('http://localhost/api/saved'));
    expect(savedRes.status).toBe(401);

    const billingRes = await getBillingHandler(new Request('http://localhost/api/billing'));
    expect(billingRes.status).toBe(401);

    const meRes = await meHandler(new Request('http://localhost/api/auth/me'));
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.authenticated).toBe(false);
    expect(meJson.user).toBeNull();
  });

  it('enforces free visibility cap on GET /api/announcements and resolves [id]', async () => {
    const res = await getAnnouncementsHandler(
      new Request('http://localhost/api/announcements?status=hepsi'),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(15);
    expect(data.total).toBe(INITIAL_ANNOUNCEMENTS.length);
    expect(data.limited).toBe(true);
    expect(data.limit).toBe(15);

    const detailRes = await getAnnouncementByIdHandler(
      new Request(`http://localhost/api/announcements/${INITIAL_ANNOUNCEMENTS[0].id}`),
      { params: Promise.resolve({ id: INITIAL_ANNOUNCEMENTS[0].id }) },
    );
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.announcement.id).toBe(INITIAL_ANNOUNCEMENTS[0].id);

    const missingRes = await getAnnouncementByIdHandler(
      new Request('http://localhost/api/announcements/olmayan-id'),
      { params: Promise.resolve({ id: 'olmayan-id' }) },
    );
    expect(missingRes.status).toBe(404);
  });

  it('supports full SaaS lifecycle: register, profile, matched gate, saved limit, billing, prefs, login/logout, KVKK delete', async () => {
    // 1. Register validation failure without legal consent
    const badReg = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'kullanici@example.com',
        password: 'GucluParola123!',
        acceptedTerms: true,
        acceptedPrivacy: false,
      }),
    );
    expect(badReg.status).toBe(400);

    // 2. Successful registration
    const regRes = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'kullanici@example.com',
        password: 'GucluParola123!',
        fullName: 'Mehmet Kaya',
        phone: '05321112233',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    );
    expect(regRes.status).toBe(201);
    const setCookieHeader = regRes.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain('kbs_session=');
    expect(setCookieHeader.toLowerCase()).toContain('httponly');
    expect(setCookieHeader.toLowerCase()).toContain('samesite=lax');
    const cookie = extractSessionCookie(regRes);
    expect(cookie).toBeTruthy();

    // 3. Check /api/auth/me
    const meRes = await meHandler(
      jsonRequest('http://localhost/api/auth/me', 'GET', undefined, cookie),
    );
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.authenticated).toBe(true);
    expect(meJson.user.email).toBe('kullanici@example.com');
    expect(meJson.entitlements.plan).toBe('free');

    // 4. Update profile
    const putProfileRes = await updateProfileHandler(
      jsonRequest(
        'http://localhost/api/profile',
        'PUT',
        {
          educationLevel: 'lisans',
          kpssScoreType: 'P3',
          kpssScore: 86,
          residenceCity: 'Ankara',
          militaryStatus: 'yapildi',
          driverLicenses: ['B'],
          certificates: ['6225'],
          qualificationCodes: ['4001'],
        },
        cookie,
      ),
    );
    expect(putProfileRes.status).toBe(200);
    const putProfileJson = await putProfileRes.json();
    expect(putProfileJson.profile.kpssScore).toBe(86);

    // 5. Matched announcements locked on free plan, shows totalMatches
    const freeMatchedRes = await getMatchedAnnouncementsHandler(
      jsonRequest('http://localhost/api/announcements/matched', 'GET', undefined, cookie),
    );
    expect(freeMatchedRes.status).toBe(200);
    const freeMatchedJson = await freeMatchedRes.json();
    expect(freeMatchedJson.locked).toBe(true);
    expect(freeMatchedJson.items).toEqual([]);
    expect(freeMatchedJson.plan).toBe('free');
    expect(typeof freeMatchedJson.totalMatches).toBe('number');

    // 6. Save 10 announcements, 11th blocked with 403 SAVED_LIMIT_REACHED
    for (let i = 0; i < 10; i += 1) {
      const saveRes = await saveAnnouncementHandler(
        jsonRequest(
          'http://localhost/api/saved',
          'POST',
          { announcementId: INITIAL_ANNOUNCEMENTS[i].id },
          cookie,
        ),
      );
      expect(saveRes.status).toBe(201);
    }

    const blockedSaveRes = await saveAnnouncementHandler(
      jsonRequest(
        'http://localhost/api/saved',
        'POST',
        { announcementId: INITIAL_ANNOUNCEMENTS[10].id },
        cookie,
      ),
    );
    expect(blockedSaveRes.status).toBe(403);
    const blockedJson = await blockedSaveRes.json();
    expect(blockedJson.code).toBe('SAVED_LIMIT_REACHED');
    expect(blockedJson.limit).toBe(10);

    // 7. Upgrade to Premium via /api/billing/plan
    const upgradeRes = await changePlanHandler(
      jsonRequest('http://localhost/api/billing/plan', 'POST', { plan: 'premium' }, cookie),
    );
    expect(upgradeRes.status).toBe(200);
    const upgradeJson = await upgradeRes.json();
    expect(upgradeJson.entitlements.plan).toBe('premium');
    expect(upgradeJson.entitlements.canUseProfileMatch).toBe(true);

    // 8. Premium unlocks all announcements, unlimited saved, and matched items
    const premListRes = await getAnnouncementsHandler(
      jsonRequest('http://localhost/api/announcements?status=hepsi', 'GET', undefined, cookie),
    );
    const premListJson = await premListRes.json();
    expect(premListJson.limited).toBe(false);
    expect(premListJson.items).toHaveLength(INITIAL_ANNOUNCEMENTS.length);

    const premMatchedRes = await getMatchedAnnouncementsHandler(
      jsonRequest('http://localhost/api/announcements/matched', 'GET', undefined, cookie),
    );
    const premMatchedJson = await premMatchedRes.json();
    expect(premMatchedJson.locked).toBe(false);
    expect(premMatchedJson.items.length).toBe(premMatchedJson.totalMatches);

    const save11Res = await saveAnnouncementHandler(
      jsonRequest(
        'http://localhost/api/saved',
        'POST',
        { announcementId: INITIAL_ANNOUNCEMENTS[10].id },
        cookie,
      ),
    );
    expect(save11Res.status).toBe(201);

    const delSavedRes = await deleteSavedHandler(
      jsonRequest(
        `http://localhost/api/saved?announcementId=${INITIAL_ANNOUNCEMENTS[10].id}`,
        'DELETE',
        undefined,
        cookie,
      ),
    );
    expect(delSavedRes.status).toBe(200);

    // 9. Notification preferences
    const putPrefsRes = await updateNotificationPrefsHandler(
      jsonRequest(
        'http://localhost/api/notifications/preferences',
        'PUT',
        { reminderDaysBefore: 5, instantNewAnnouncements: true },
        cookie,
      ),
    );
    expect(putPrefsRes.status).toBe(200);
    const getPrefsRes = await getNotificationPrefsHandler(
      jsonRequest('http://localhost/api/notifications/preferences', 'GET', undefined, cookie),
    );
    const getPrefsJson = await getPrefsRes.json();
    expect(getPrefsJson.preferences.reminderDaysBefore).toBe(5);
    expect(getPrefsJson.preferences.instantNewAnnouncements).toBe(true);

    // 10. Logout and login again
    const logoutRes = await logoutHandler(
      jsonRequest('http://localhost/api/auth/logout', 'POST', undefined, cookie),
    );
    expect(logoutRes.status).toBe(200);

    const afterLogoutProfile = await getProfileHandler(
      jsonRequest('http://localhost/api/profile', 'GET', undefined, cookie),
    );
    expect(afterLogoutProfile.status).toBe(401);

    const loginRes = await loginHandler(
      jsonRequest('http://localhost/api/auth/login', 'POST', {
        email: 'kullanici@example.com',
        password: 'GucluParola123!',
      }),
    );
    expect(loginRes.status).toBe(200);
    const freshCookie = extractSessionCookie(loginRes);
    expect(freshCookie).toBeTruthy();

    // 11. KVKK account deletion
    const wrongDeleteRes = await deleteAccountHandler(
      jsonRequest('http://localhost/api/account', 'DELETE', { confirm: 'IPTAL' }, freshCookie),
    );
    expect(wrongDeleteRes.status).toBe(400);

    const deleteRes = await deleteAccountHandler(
      jsonRequest('http://localhost/api/account', 'DELETE', { confirm: 'SIL' }, freshCookie),
    );
    expect(deleteRes.status).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.deleted).toBe(true);

    const afterDeleteProfile = await getProfileHandler(
      jsonRequest('http://localhost/api/profile', 'GET', undefined, freshCookie),
    );
    expect(afterDeleteProfile.status).toBe(401);
  });

  it('runs cron sync safely even when external official fetches fail', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network unavailable in test'));

    try {
      const res = await cronSyncHandler(
        jsonRequest('http://localhost/api/cron/sync', 'POST'),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.syncedCount).toBe(0);
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.reminders).toEqual({ processedUsers: 0, sentCount: 0 });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fails closed on POST /api/cron/sync when NODE_ENV is production and CRON_SECRET is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', '');
    try {
      const res = await cronSyncHandler(
        jsonRequest('http://localhost/api/cron/sync', 'POST'),
      );
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.code).toBe('CRON_SECRET_MISSING');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
