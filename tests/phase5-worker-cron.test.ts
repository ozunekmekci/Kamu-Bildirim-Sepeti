import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildScheduledSyncRequest,
  handleScheduledSync,
  type ScheduledExecutionContext,
  type WorkerFetchHandler,
} from '@/modules/worker/scheduled';

describe('Phase 5 Cloudflare scheduled cron wrapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds POST /api/cron/sync with NEXT_PUBLIC_SITE_URL and Authorization header', () => {
    const request = buildScheduledSyncRequest(
      { cron: '0 */6 * * *', scheduledTime: 1_700_000_000_000 },
      {
        NEXT_PUBLIC_SITE_URL: 'https://kamubildirimsepeti.com',
        NEXT_PUBLIC_APP_URL: 'https://app.kamubildirimsepeti.com',
        CRON_SECRET: '  super-secret-token  ',
      },
    );

    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://kamubildirimsepeti.com/api/cron/sync');
    expect(request.headers.get('x-cron-trigger')).toBe('cloudflare_cron');
    expect(request.headers.get('cf-cron')).toBe('0 */6 * * *');
    expect(request.headers.get('authorization')).toBe('Bearer super-secret-token');
  });

  it('falls back to NEXT_PUBLIC_APP_URL and then internal fallback URL', () => {
    const appUrlRequest = buildScheduledSyncRequest(
      {},
      { NEXT_PUBLIC_APP_URL: 'https://app.kamubildirimsepeti.com' },
    );
    expect(appUrlRequest.url).toBe('https://app.kamubildirimsepeti.com/api/cron/sync');
    expect(appUrlRequest.headers.get('cf-cron')).toBe('0 */6 * * *');
    expect(appUrlRequest.headers.get('authorization')).toBeNull();

    const fallbackRequest = buildScheduledSyncRequest({ cron: '15 * * * *' }, {});
    expect(fallbackRequest.url).toBe('https://kamubildirimsepeti.internal/api/cron/sync');
    expect(fallbackRequest.headers.get('cf-cron')).toBe('15 * * * *');
    expect(fallbackRequest.headers.get('x-cron-trigger')).toBe('cloudflare_cron');
  });

  it('registers async work via ctx.waitUntil and dispatches to fetchHandler', async () => {
    const waitUntilMock = vi.fn();
    const ctx: ScheduledExecutionContext = { waitUntil: waitUntilMock };
    const fetchHandler = vi.fn<WorkerFetchHandler>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const task = handleScheduledSync(
      { cron: '0 */6 * * *' },
      {
        NEXT_PUBLIC_SITE_URL: 'https://kamubildirimsepeti.com',
        CRON_SECRET: 'cron-secret-value',
      },
      ctx,
      fetchHandler,
    );

    expect(waitUntilMock).toHaveBeenCalledTimes(1);
    expect(waitUntilMock).toHaveBeenCalledWith(task);
    await task;

    expect(fetchHandler).toHaveBeenCalledTimes(1);
    const dispatchedRequest = fetchHandler.mock.calls[0]?.[0];
    expect(dispatchedRequest).toBeDefined();
    if (!dispatchedRequest) {
      throw new Error('Expected fetchHandler to receive a Request');
    }
    expect(dispatchedRequest.method).toBe('POST');
    expect(dispatchedRequest.url).toBe('https://kamubildirimsepeti.com/api/cron/sync');
    expect(dispatchedRequest.headers.get('authorization')).toBe('Bearer cron-secret-value');
    expect(dispatchedRequest.headers.get('x-cron-trigger')).toBe('cloudflare_cron');
    expect(dispatchedRequest.headers.get('cf-cron')).toBe('0 */6 * * *');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a safe warning when CRON_SECRET is missing', async () => {
    const ctx: ScheduledExecutionContext = { waitUntil: vi.fn() };
    const fetchHandler = vi.fn(async () => new Response('ok', { status: 200 }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await handleScheduledSync({ cron: '0 */6 * * *' }, {}, ctx, fetchHandler);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warningMessage = warnSpy.mock.calls.flat().join(' ');
    expect(warningMessage).toContain('CRON_SECRET');
    expect(warningMessage).not.toContain('Bearer');
  });

  it('logs truncated status and body on 503/500 failure without ever leaking CRON_SECRET', async () => {
    const secret = 'TOP_SECRET_CRON_TOKEN_987654';
    const ctx: ScheduledExecutionContext = { waitUntil: vi.fn() };
    const longErrorPayload = `Service unavailable (${secret}) ${'x'.repeat(260)}`;
    const fetchHandler = vi.fn(async () => new Response(longErrorPayload, { status: 503 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleScheduledSync(
      { cron: '0 */6 * * *' },
      { CRON_SECRET: secret },
      ctx,
      fetchHandler,
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedText = errorSpy.mock.calls.flat().join(' ');
    expect(loggedText).toContain('503');
    expect(loggedText).not.toContain(secret);
    expect(loggedText).not.toContain('Authorization');
    expect(loggedText.length).toBeLessThan(260);
  });

  it('catches thrown fetchHandler errors safely without leaking CRON_SECRET', async () => {
    const secret = 'TOP_SECRET_THROW_TOKEN_123';
    const ctx: ScheduledExecutionContext = { waitUntil: vi.fn() };
    const fetchHandler = vi.fn(async () => {
      throw new Error(`Network boom with ${secret}`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      handleScheduledSync(
        { cron: '0 */6 * * *' },
        { CRON_SECRET: secret },
        ctx,
        fetchHandler,
      ),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedText = errorSpy.mock.calls.flat().join(' ');
    expect(loggedText).toContain('Network boom');
    expect(loggedText).not.toContain(secret);
  });
});
