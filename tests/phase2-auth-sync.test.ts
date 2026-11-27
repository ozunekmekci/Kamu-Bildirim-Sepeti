import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as forgotPasswordHandler } from '@/app/api/auth/forgot-password/route';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { POST as resendVerificationHandler } from '@/app/api/auth/resend-verification/route';
import { POST as resetPasswordHandler } from '@/app/api/auth/reset-password/route';
import { POST as verifyEmailHandler } from '@/app/api/auth/verify-email/route';
import { GET as getProfileHandler } from '@/app/api/profile/route';
import { GET as syncStatusHandler } from '@/app/api/sync/status/route';
import { D1Adapter, MemoryDbAdapter, resetMemoryDb } from '@/modules/db';
import type { D1DatabaseLike, D1PreparedStatementLike } from '@/modules/db/d1-adapter';
import {
  getAuthenticatedUser,
  hashToken,
  IdentityError,
  issueAuthToken,
  loginUser,
  registerUser,
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from '@/modules/identity';
import { InMemoryEmailAdapter, NoopEmailAdapter } from '@/modules/tracking';

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

describe('Phase 2 identity email verification and password reset', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
  });

  it('verifies email once, blocks token reuse/expiry, and hides previewToken in prod or real email adapters', async () => {
    const registered = await registerUser(db, {
      email: 'verify@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    expect(registered.user.emailVerifiedAt).toBeNull();

    const noop = new NoopEmailAdapter();
    const firstReq = await requestEmailVerification(
      db,
      registered.user.id,
      noop,
      'https://kamubildirimsepeti.example',
    );
    expect(firstReq.alreadyVerified).toBe(false);
    expect(firstReq.provider).toBe('noop');
    expect(firstReq.previewToken).toBeTruthy();

    const memAdapter = new InMemoryEmailAdapter();
    const realReq = await requestEmailVerification(
      db,
      registered.user.id,
      memAdapter,
      'https://kamubildirimsepeti.example',
    );
    expect(realReq.sent).toBe(true);
    expect(realReq.provider).toBe('memory');
    expect(realReq.previewToken).toBeUndefined();
    expect(memAdapter.sent).toHaveLength(1);
    expect(memAdapter.sent[0].subject).toContain('Kamu Bildirim Sepeti');

    vi.stubEnv('NODE_ENV', 'production');
    try {
      const prodNoopReq = await requestEmailVerification(db, registered.user.id, noop);
      expect(prodNoopReq.previewToken).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }

    const verified = await verifyEmailWithToken(db, firstReq.previewToken!);
    expect(verified.verified).toBe(true);
    expect(verified.emailVerifiedAt).toBeTruthy();
    expect(verified.user.emailVerifiedAt).toBe(verified.emailVerifiedAt);

    await expect(verifyEmailWithToken(db, firstReq.previewToken!)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });

    const alreadyRes = await requestEmailVerification(db, registered.user.id, noop);
    expect(alreadyRes).toEqual({
      sent: false,
      alreadyVerified: true,
      provider: 'noop',
    });

    const expired = await issueAuthToken(db, registered.user.id, 'email_verify', -1000);
    await expect(verifyEmailWithToken(db, expired.rawToken)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  });

  it('handles non-enumerating password reset and revokes all active sessions', async () => {
    const registered = await registerUser(db, {
      email: 'reset@example.com',
      password: 'EskiParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    const secondLogin = await loginUser(db, {
      email: 'reset@example.com',
      password: 'EskiParola123!',
    });

    const noop = new NoopEmailAdapter();
    const unknownRes = await requestPasswordReset(db, 'bilinmeyen@example.com', noop);
    expect(unknownRes).toEqual({ accepted: true });
    expect(unknownRes.previewToken).toBeUndefined();

    const memResetAdapter = new InMemoryEmailAdapter();
    const foundRes = await requestPasswordReset(
      db,
      'reset@example.com',
      noop,
      'https://kamubildirimsepeti.example',
    );
    expect(foundRes.accepted).toBe(true);
    expect(foundRes.previewToken).toBeTruthy();

    const emailResetRes = await requestPasswordReset(
      db,
      'reset@example.com',
      memResetAdapter,
      'https://kamubildirimsepeti.example',
    );
    expect(emailResetRes).toEqual({ accepted: true });
    expect(memResetAdapter.sent).toHaveLength(1);
    expect(memResetAdapter.sent[0].text).toContain('/sifre-sifirla?token=');

    vi.stubEnv('NODE_ENV', 'production');
    try {
      const prodResetReq = await requestPasswordReset(db, 'reset@example.com', noop);
      expect(prodResetReq).toEqual({ accepted: true });
      expect(prodResetReq.previewToken).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }

    await expect(
      resetPasswordWithToken(db, foundRes.previewToken!, 'kisa'),
    ).rejects.toThrow(IdentityError);

    const resetDone = await resetPasswordWithToken(
      db,
      foundRes.previewToken!,
      'YeniGucluParola456!',
    );
    expect(resetDone).toEqual({ reset: true });

    // Both existing sessions must be revoked
    expect(await getAuthenticatedUser(db, registered.token)).toBeNull();
    expect(await getAuthenticatedUser(db, secondLogin.token)).toBeNull();

    // Old password rejected, new password accepted
    await expect(
      loginUser(db, { email: 'reset@example.com', password: 'EskiParola123!' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });

    const relogin = await loginUser(db, {
      email: 'reset@example.com',
      password: 'YeniGucluParola456!',
    });
    expect(relogin.user.id).toBe(registered.user.id);

    // Token reuse rejected
    await expect(
      resetPasswordWithToken(db, foundRes.previewToken!, 'BaskaParola789!'),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_OR_EXPIRED_TOKEN' });
  });

  it('cleans up authTokens on MemoryDbAdapter.deleteUser and orders syncRuns descending', async () => {
    const registered = await registerUser(db, {
      email: 'cascade@example.com',
      password: 'GucluParola123!',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    const issued = await issueAuthToken(db, registered.user.id, 'email_verify', 60_000);
    const tokenHash = await hashToken(issued.rawToken);
    expect(await db.findAuthTokenByHash(tokenHash, 'email_verify')).not.toBeNull();

    await db.deleteUser(registered.user.id);
    expect(await db.findAuthTokenByHash(tokenHash, 'email_verify')).toBeNull();

    await db.recordSyncRun({
      id: 'sync-1',
      triggeredBy: 'cron',
      startedAt: '2026-11-26T00:00:00.000Z',
      finishedAt: '2026-11-26T00:00:05.000Z',
      status: 'success',
      syncedCount: 2,
      remindersSent: 1,
      newAlertsSent: 0,
      errorsJson: '[]',
    });
    await db.recordSyncRun({
      id: 'sync-2',
      triggeredBy: 'manual',
      startedAt: '2026-11-26T01:00:00.000Z',
      finishedAt: '2026-11-26T01:00:03.000Z',
      status: 'partial',
      syncedCount: 5,
      remindersSent: 0,
      newAlertsSent: 3,
      errorsJson: '["timeout"]',
    });

    const runs = await db.listSyncRuns(1);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('sync-2');
  });

  it('executes D1Adapter Phase 2 auth_tokens, user verification/password, and sync_runs queries', async () => {
    const queries: Array<{ query: string; params: unknown[] }> = [];
    const makeStmt = (query: string, bound: unknown[] = []): D1PreparedStatementLike => ({
      bind(...values: unknown[]) {
        return makeStmt(query, values);
      },
      async first<T = Record<string, unknown>>() {
        queries.push({ query, params: bound });
        if (query.includes('SELECT * FROM users WHERE id = ?')) {
          return {
            id: bound[0],
            email: 'd1phase2@example.com',
            password_hash: 'salt:hash',
            full_name: null,
            phone: null,
            email_verified_at: '2026-11-26T00:10:00.000Z',
            accepted_terms_at: '2026-11-26T00:00:00.000Z',
            accepted_privacy_at: '2026-11-26T00:00:00.000Z',
            created_at: '2026-11-26T00:00:00.000Z',
            updated_at: '2026-11-26T00:10:00.000Z',
          } as T;
        }
        if (query.includes('SELECT * FROM auth_tokens')) {
          return {
            id: 'tok-1',
            user_id: 'u-1',
            purpose: 'email_verify',
            token_hash: bound[0],
            expires_at: '2026-11-27T00:00:00.000Z',
            used_at: null,
            created_at: '2026-11-26T00:00:00.000Z',
          } as T;
        }
        if (query.includes('SELECT * FROM subscriptions')) {
          return {
            id: 'sub-1',
            user_id: 'u-1',
            plan: 'premium',
            status: 'active',
            provider: 'stripe',
            external_subscription_id: 'sub_ext_123',
            current_period_end: null,
            updated_at: '2026-11-26T00:00:00.000Z',
          } as T;
        }
        return null;
      },
      async all<T = Record<string, unknown>>() {
        queries.push({ query, params: bound });
        if (query.includes('FROM sync_runs')) {
          return {
            results: [
              {
                id: 'run-1',
                triggered_by: 'cron',
                started_at: '2026-11-26T01:00:00.000Z',
                finished_at: '2026-11-26T01:00:02.000Z',
                status: 'success',
                synced_count: 4,
                reminders_sent: 2,
                new_alerts_sent: 1,
                errors_json: '[]',
              } as T,
            ],
          };
        }
        return { results: [] as T[] };
      },
      async run() {
        queries.push({ query, params: bound });
        return { success: true, meta: { changes: 1 } };
      },
    });

    const mockD1: D1DatabaseLike = {
      prepare: (q) => makeStmt(q),
      async batch(stmts) {
        for (const s of stmts) await s.run();
        return [];
      },
    };

    const d1 = new D1Adapter(mockD1);
    const verifiedUser = await d1.markEmailVerified('u-1', '2026-11-26T00:10:00.000Z');
    expect(verifiedUser?.emailVerifiedAt).toBe('2026-11-26T00:10:00.000Z');

    await d1.updateUserPassword('u-1', 'new:hash', '2026-11-26T00:11:00.000Z');
    await d1.createAuthToken({
      id: 'tok-1',
      userId: 'u-1',
      purpose: 'email_verify',
      tokenHash: 'abc',
      expiresAt: '2026-11-27T00:00:00.000Z',
      usedAt: null,
      createdAt: '2026-11-26T00:00:00.000Z',
    });
    const foundToken = await d1.findAuthTokenByHash('abc', 'email_verify');
    expect(foundToken?.id).toBe('tok-1');
    await d1.markAuthTokenUsed('tok-1', '2026-11-26T00:12:00.000Z');

    const sub = await d1.getSubscription('u-1');
    expect(sub?.externalSubscriptionId).toBe('sub_ext_123');

    await d1.recordSyncRun({
      id: 'run-1',
      triggeredBy: 'cron',
      startedAt: '2026-11-26T01:00:00.000Z',
      finishedAt: '2026-11-26T01:00:02.000Z',
      status: 'success',
      syncedCount: 4,
      remindersSent: 2,
      newAlertsSent: 1,
      errorsJson: '[]',
    });
    const syncRuns = await d1.listSyncRuns(5);
    expect(syncRuns).toHaveLength(1);
    expect(syncRuns[0].syncedCount).toBe(4);
    expect(queries.some((q) => q.query.includes('INSERT OR REPLACE INTO sync_runs'))).toBe(true);
  });
});

describe('Phase 2 auth & sync API routes', () => {
  let db: MemoryDbAdapter;

  beforeEach(() => {
    db = resetMemoryDb();
  });

  it('handles resend-verification and verify-email routes end-to-end', async () => {
    const unauthRes = await resendVerificationHandler(
      jsonRequest('http://localhost/api/auth/resend-verification', 'POST'),
    );
    expect(unauthRes.status).toBe(401);

    const regRes = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'eposta@example.com',
        password: 'GucluParola123!',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    );
    expect(regRes.status).toBe(201);
    const cookie = extractSessionCookie(regRes);

    const resendRes = await resendVerificationHandler(
      jsonRequest('http://localhost/api/auth/resend-verification', 'POST', undefined, cookie),
    );
    expect(resendRes.status).toBe(200);
    const resendJson = await resendRes.json();
    expect(resendJson.alreadyVerified).toBe(false);
    expect(resendJson.previewToken).toBeTruthy();

    const verifyRes = await verifyEmailHandler(
      jsonRequest('http://localhost/api/auth/verify-email', 'POST', {
        token: resendJson.previewToken,
      }),
    );
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.verified).toBe(true);
    expect(verifyJson.emailVerifiedAt).toBeTruthy();

    // Reuse fails with 400
    const reuseRes = await verifyEmailHandler(
      jsonRequest('http://localhost/api/auth/verify-email', 'POST', {
        token: resendJson.previewToken,
      }),
    );
    expect(reuseRes.status).toBe(400);

    // Resend after verified reports alreadyVerified
    const afterResend = await resendVerificationHandler(
      jsonRequest('http://localhost/api/auth/resend-verification', 'POST', undefined, cookie),
    );
    expect(afterResend.status).toBe(200);
    const afterJson = await afterResend.json();
    expect(afterJson.alreadyVerified).toBe(true);
  });

  it('handles forgot-password and reset-password routes with session revocation', async () => {
    const regRes = await registerHandler(
      jsonRequest('http://localhost/api/auth/register', 'POST', {
        email: 'parola@example.com',
        password: 'IlkParola123!',
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    );
    const cookie = extractSessionCookie(regRes);

    const unknownForgotRes = await forgotPasswordHandler(
      jsonRequest('http://localhost/api/auth/forgot-password', 'POST', {
        email: 'yok@example.com',
      }),
    );
    expect(unknownForgotRes.status).toBe(200);
    const unknownForgotJson = await unknownForgotRes.json();
    expect(unknownForgotJson).toEqual({ accepted: true });

    const forgotRes = await forgotPasswordHandler(
      jsonRequest('http://localhost/api/auth/forgot-password', 'POST', {
        email: 'parola@example.com',
      }),
    );
    expect(forgotRes.status).toBe(200);
    const forgotJson = await forgotRes.json();
    expect(forgotJson.accepted).toBe(true);
    expect(forgotJson.previewToken).toBeTruthy();

    const weakResetRes = await resetPasswordHandler(
      jsonRequest('http://localhost/api/auth/reset-password', 'POST', {
        token: forgotJson.previewToken,
        newPassword: '123',
      }),
    );
    expect(weakResetRes.status).toBe(400);

    const resetRes = await resetPasswordHandler(
      jsonRequest('http://localhost/api/auth/reset-password', 'POST', {
        token: forgotJson.previewToken,
        newPassword: 'YeniParola456!',
      }),
    );
    expect(resetRes.status).toBe(200);
    expect(await resetRes.json()).toEqual({ reset: true });

    // Existing session revoked
    const profileAfterReset = await getProfileHandler(
      jsonRequest('http://localhost/api/profile', 'GET', undefined, cookie),
    );
    expect(profileAfterReset.status).toBe(401);

    // Can log in with new password
    const loginRes = await loginHandler(
      jsonRequest('http://localhost/api/auth/login', 'POST', {
        email: 'parola@example.com',
        password: 'YeniParola456!',
      }),
    );
    expect(loginRes.status).toBe(200);
  });

  it('returns empty and populated runs on GET /api/sync/status', async () => {
    const emptyRes = await syncStatusHandler();
    expect(emptyRes.status).toBe(200);
    expect(await emptyRes.json()).toMatchObject({
      lastRun: null,
      runs: [],
      checkpoints: [],
      liveSummary: expect.objectContaining({
        openCount: expect.any(Number),
        totalCount: expect.any(Number),
      }),
    });

    await db.recordSyncRun({
      id: 'sync-api-1',
      triggeredBy: 'cron',
      startedAt: '2026-11-26T02:00:00.000Z',
      finishedAt: '2026-11-26T02:00:04.000Z',
      status: 'success',
      syncedCount: 7,
      remindersSent: 2,
      newAlertsSent: 1,
      errorsJson: '[]',
    });

    const populatedRes = await syncStatusHandler();
    expect(populatedRes.status).toBe(200);
    const populatedJson = await populatedRes.json();
    expect(populatedJson.lastRun.id).toBe('sync-api-1');
    expect(populatedJson.runs).toHaveLength(1);
  });
});
