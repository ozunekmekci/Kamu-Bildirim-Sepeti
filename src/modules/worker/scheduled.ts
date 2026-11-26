export interface ScheduledControllerLike {
  cron?: string;
  scheduledTime?: number;
}

export interface ScheduledEnv {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  [key: string]: unknown;
}

export interface ScheduledExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export type WorkerFetchHandler = (
  request: Request,
  env: ScheduledEnv,
  ctx: ScheduledExecutionContext,
) => Promise<Response>;

const DEFAULT_CRON_EXPRESSION = '0 */6 * * *';
const FALLBACK_BASE_URL = 'https://kamubildirimsepeti.internal';
const MAX_ERROR_BODY_LENGTH = 200;

function redactSecret(text: string, secret: string | undefined): string {
  if (!secret) {
    return text;
  }
  return text.split(secret).join('[REDACTED]');
}

/**
 * Builds the internal POST /api/cron/sync request triggered by Cloudflare Cron.
 */
export function buildScheduledSyncRequest(
  controller: ScheduledControllerLike,
  env: ScheduledEnv,
): Request {
  const baseUrl =
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    FALLBACK_BASE_URL;
  const targetUrl = new URL('/api/cron/sync', baseUrl);
  const headers = new Headers();

  headers.set('x-cron-trigger', 'cloudflare_cron');
  headers.set('cf-cron', controller.cron?.trim() || DEFAULT_CRON_EXPRESSION);

  const secret = env.CRON_SECRET?.trim();
  if (secret) {
    headers.set('Authorization', `Bearer ${secret}`);
  }

  return new Request(targetUrl.toString(), {
    method: 'POST',
    headers,
  });
}

/**
 * Dispatches the scheduled sync request through the worker fetch handler and
 * registers the async task with Cloudflare's execution context.
 */
export function handleScheduledSync(
  controller: ScheduledControllerLike,
  env: ScheduledEnv,
  ctx: ScheduledExecutionContext,
  fetchHandler: WorkerFetchHandler,
): Promise<void> {
  const secret = env.CRON_SECRET?.trim();

  const task = (async () => {
    if (!secret) {
      console.warn(
        '[worker:cron] CRON_SECRET is not configured; dispatching scheduled sync without Authorization header.',
      );
    }

    const request = buildScheduledSyncRequest(controller, env);

    try {
      const response = await fetchHandler(request, env, ctx);
      if (!response.ok) {
        const rawBody = await response.text().catch(() => '');
        const safeSnippet = redactSecret(rawBody, secret).slice(0, MAX_ERROR_BODY_LENGTH);
        console.error(
          `[worker:cron] Scheduled sync failed with HTTP ${response.status}${safeSnippet ? `: ${safeSnippet}` : ''}`,
        );
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const safeMessage = redactSecret(rawMessage, secret).slice(0, MAX_ERROR_BODY_LENGTH);
      console.error(`[worker:cron] Scheduled sync error: ${safeMessage}`);
    }
  })();

  ctx.waitUntil(task);
  return task;
}
