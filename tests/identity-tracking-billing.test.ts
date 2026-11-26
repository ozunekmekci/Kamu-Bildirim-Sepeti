import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements';
import {
  changeUserPlan,
  getEntitlementsForPlan,
  getUserBillingState,
} from '@/modules/billing';
import { D1Adapter, MemoryDbAdapter, resetMemoryDb } from '@/modules/db';
import type { D1DatabaseLike, D1PreparedStatementLike } from '@/modules/db/d1-adapter';
import {
  deleteUserAccount,
  getAuthenticatedUser,
  hashPassword,
  IdentityError,
  loginUser,
  logoutSession,
  registerUser,
  signSessionToken,
  updateUserProfile,
  verifyPassword,
  verifySessionToken,
} from '@/modules/identity';
import {
  dispatchPendingReminders,
  InMemoryEmailAdapter,
  saveAnnouncementForUser,
  TrackingError,
  updateNotificationPreferences,
} from '@/modules/tracking';

describe('identity crypto and service', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
  });

  it('hashes and verifies passwords with PBKDF2 SHA-256 salt:hash format', async () => {
    const hash1 = await hashPassword('GucluParola123!');
    const hash2 = await hashPassword('GucluParola123!');

    expect(hash1).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword('GucluParola123!', hash1)).toBe(true);
    expect(await verifyPassword('YanlisParola', hash1)).toBe(false);
    expect(await verifyPassword('GucluParola123!', 'invalid-format')).toBe(false);
  });

  it('signs and verifies HMAC-SHA256 session tokens and rejects tampered or expired ones', async () => {
    const validToken = await signSessionToken({
      sid: 's-1',
      uid: 'u-1',
      exp: Date.now() + 60_000,
    });
    const decoded = await verifySessionToken(validToken);
    expect(decoded).toEqual({ sid: 's-1', uid: 'u-1', exp: expect.any(Number) });

    const tampered = `${validToken.slice(0, -4)}aaaa`;
    expect(await verifySessionToken(tampered)).toBeNull();

    const expiredToken = await signSessionToken({
      sid: 's-2',
      uid: 'u-1',
      exp: Date.now() - 1000,
    });
    expect(await verifySessionToken(expiredToken)).toBeNull();
  });

  it('registers, logs in, authenticates session, updates profile, and cascades KVKK account deletion', async () => {
    await expect(
      registerUser(db, {
        email: 'aday@example.com',
        password: 'short',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    ).rejects.toThrow(IdentityError);

    await expect(
      registerUser(db, {
        email: 'aday@example.com',
        password: 'GucluParola123!',
        acceptedTerms: false,
        acceptedPrivacy: true,
      }),
    ).rejects.toThrow(IdentityError);

    const registered = await registerUser(db, {
      email: 'Aday@Example.com',
      password: 'GucluParola123!',
      fullName: 'Ayşe Yılmaz',
      phone: '05551112233',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    expect(registered.user.email).toBe('aday@example.com');
    expect(registered.user.fullName).toBe('Ayşe Yılmaz');

    await expect(
      registerUser(db, {
        email: 'aday@example.com',
        password: 'GucluParola123!',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_EXISTS' });

    const authed = await getAuthenticatedUser(db, registered.token);
    expect(authed?.id).toBe(registered.user.id);

    await logoutSession(db, registered.token);
    expect(await getAuthenticatedUser(db, registered.token)).toBeNull();

    const loggedIn = await loginUser(db, {
      email: 'aday@example.com',
      password: 'GucluParola123!',
    });
    expect(loggedIn.user.id).toBe(registered.user.id);

    const updated = await updateUserProfile(db, registered.user.id, {
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      kpssScore: 84.5,
      residenceCity: 'Ankara',
      militaryStatus: 'muaf',
      driverLicenses: ['B'],
      certificates: ['6225'],
      qualificationCodes: ['4001'],
    });
    expect(updated.profile.kpssScore).toBe(84.5);
    expect(updated.profile.residenceCity).toBe('Ankara');

    await saveAnnouncementForUser(db, registered.user.id, INITIAL_ANNOUNCEMENTS[0].id);

    await expect(
      deleteUserAccount(db, registered.user.id, 'WRONG'),
    ).rejects.toMatchObject({ status: 400, code: 'CONFIRMATION_REQUIRED' });

    const deleted = await deleteUserAccount(db, registered.user.id, 'SIL');
    expect(deleted).toBe(true);
    expect(await db.findUserById(registered.user.id)).toBeNull();
    expect(await db.getProfile(registered.user.id)).toBeNull();
    expect(await db.listSavedAnnouncementIds(registered.user.id)).toEqual([]);
    expect(await db.getSubscription(registered.user.id)).toBeNull();
    expect(await db.getNotificationPrefs(registered.user.id)).toBeNull();
    expect(await getAuthenticatedUser(db, loggedIn.token)).toBeNull();
  });
});

describe('tracking and billing', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
  });

  it('enforces saved limit of 10 on free plan and unlocks unlimited on premium', async () => {
    const freeEnt = getEntitlementsForPlan('free');
    const premEnt = getEntitlementsForPlan('premium');
    expect(freeEnt).toEqual({
      plan: 'free',
      maxVisibleAnnouncements: 15,
      maxSaved: 10,
      canUseProfileMatch: false,
      canInstantAlert: false,
    });
    expect(premEnt).toEqual({
      plan: 'premium',
      maxVisibleAnnouncements: null,
      maxSaved: null,
      canUseProfileMatch: true,
      canInstantAlert: true,
    });

    const { user } = await registerUser(db, {
      email: 'limit@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    for (let i = 0; i < 10; i += 1) {
      await saveAnnouncementForUser(db, user.id, INITIAL_ANNOUNCEMENTS[i].id);
    }

    // Saving an already-saved item stays idempotent
    await saveAnnouncementForUser(db, user.id, INITIAL_ANNOUNCEMENTS[0].id);

    // 11th distinct announcement fails on free plan
    await expect(
      saveAnnouncementForUser(db, user.id, INITIAL_ANNOUNCEMENTS[10].id),
    ).rejects.toBeInstanceOf(TrackingError);

    const upgraded = await changeUserPlan(db, user.id, 'premium');
    expect(upgraded.entitlements.plan).toBe('premium');
    expect(upgraded.entitlements.maxSaved).toBeNull();

    const state = await getUserBillingState(db, user.id);
    expect(state.subscription.plan).toBe('premium');

    const saved11 = await saveAnnouncementForUser(db, user.id, INITIAL_ANNOUNCEMENTS[10].id);
    expect(saved11.announcementId).toBe(INITIAL_ANNOUNCEMENTS[10].id);
  });

  it('dispatches deadline reminders only to premium users and prevents duplicate sends', async () => {
    const { user } = await registerUser(db, {
      email: 'reminder@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    const openAnnouncement = INITIAL_ANNOUNCEMENTS.find((a) => a.status === 'acik');
    expect(openAnnouncement).toBeDefined();
    if (!openAnnouncement) return;

    await saveAnnouncementForUser(db, user.id, openAnnouncement.id);
    await updateNotificationPreferences(db, user.id, {
      emailEnabled: true,
      deadlineRemindersEnabled: true,
      reminderDaysBefore: 30,
      onlyMatchingProfile: false,
    });

    const emailAdapter = new InMemoryEmailAdapter();
    const refDate = new Date(
      new Date(openAnnouncement.deadlineAt).getTime() - 2 * 24 * 60 * 60 * 1000,
    );

    // Free plan user does not receive automated instant/deadline reminders
    const freeDispatch = await dispatchPendingReminders(db, emailAdapter, refDate);
    expect(freeDispatch.sentCount).toBe(0);
    expect(emailAdapter.sent).toHaveLength(0);

    // Upgrade to premium
    await changeUserPlan(db, user.id, 'premium');
    const premDispatch = await dispatchPendingReminders(db, emailAdapter, refDate);
    expect(premDispatch.sentCount).toBe(1);
    expect(emailAdapter.sent).toHaveLength(1);
    expect(emailAdapter.sent[0].to).toBe('reminder@example.com');

    // Second run does not duplicate
    const secondDispatch = await dispatchPendingReminders(db, emailAdapter, refDate);
    expect(secondDispatch.sentCount).toBe(0);
    expect(emailAdapter.sent).toHaveLength(1);
  });
});

describe('D1Adapter', () => {
  it('seeds announcements lazily and executes parameterized CRUD and cascading delete batch', async () => {
    const executedQueries: Array<{ query: string; params: unknown[] }> = [];
    let seededCount = 0;

    const makeStatement = (query: string, bound: unknown[] = []): D1PreparedStatementLike => ({
      bind(...values: unknown[]) {
        return makeStatement(query, values);
      },
      async first<T = Record<string, unknown>>() {
        executedQueries.push({ query, params: bound });
        if (query.includes('SELECT COUNT(*) as total FROM announcements')) {
          return { total: seededCount } as T;
        }
        if (query.includes('SELECT * FROM users WHERE id = ?')) {
          return {
            id: bound[0],
            email: 'd1@example.com',
            password_hash: 'salt:hash',
            full_name: 'D1 Aday',
            phone: null,
            accepted_terms_at: '2026-11-26T00:00:00.000Z',
            accepted_privacy_at: '2026-11-26T00:00:00.000Z',
            created_at: '2026-11-26T00:00:00.000Z',
            updated_at: '2026-11-26T00:00:00.000Z',
          } as T;
        }
        return null;
      },
      async all<T = Record<string, unknown>>() {
        executedQueries.push({ query, params: bound });
        return { results: [] as T[] };
      },
      async run() {
        executedQueries.push({ query, params: bound });
        return { success: true, meta: { changes: 1 } };
      },
    });

    const mockD1: D1DatabaseLike = {
      prepare(query: string) {
        return makeStatement(query);
      },
      async batch(statements: D1PreparedStatementLike[]) {
        for (const stmt of statements) {
          await stmt.run();
        }
        seededCount = INITIAL_ANNOUNCEMENTS.length;
        return [];
      },
    };

    const d1 = new D1Adapter(mockD1);
    await d1.listAnnouncements();
    expect(
      executedQueries.filter((q) => q.query.includes('INSERT OR IGNORE INTO announcements')),
    ).toHaveLength(INITIAL_ANNOUNCEMENTS.length);

    const deleted = await d1.deleteUser('user-d1-1');
    expect(deleted).toBe(true);
    const deleteTables = executedQueries
      .filter((q) => q.query.startsWith('DELETE FROM'))
      .map((q) => q.query);
    expect(deleteTables).toEqual([
      'DELETE FROM push_subscriptions WHERE user_id = ?',
      'DELETE FROM saved_announcements WHERE user_id = ?',
      'DELETE FROM reminder_logs WHERE user_id = ?',
      'DELETE FROM notification_prefs WHERE user_id = ?',
      'DELETE FROM user_profiles WHERE user_id = ?',
      'DELETE FROM subscriptions WHERE user_id = ?',
      'DELETE FROM auth_tokens WHERE user_id = ?',
      'DELETE FROM sessions WHERE user_id = ?',
      'DELETE FROM users WHERE id = ?',
    ]);
  });
});
