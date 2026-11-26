import '@testing-library/jest-dom/vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AyarlarPage from '@/app/ayarlar/page';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/ayarlar',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

function mockFetchImplementation(
  handlers: Record<string, (url: string, init?: RequestInit) => Response | Promise<Response>>,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, fn] of Object.entries(handlers)) {
      if (url.startsWith(pattern)) {
        return fn(url, init);
      }
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

function baseAuthenticatedHandlers(
  extra: Record<string, (url: string, init?: RequestInit) => Response | Promise<Response>> = {},
) {
  return {
    '/api/auth/me': () =>
      new Response(
        JSON.stringify({
          authenticated: true,
          user: { id: 'u1', email: 'aday@test.tr', plan: 'premium', emailVerifiedAt: null },
        }),
        { status: 200 },
      ),
    '/api/notifications/preferences': () =>
      new Response(
        JSON.stringify({
          preferences: {
            emailEnabled: true,
            instantNewAnnouncements: true,
            deadlineRemindersEnabled: true,
            reminderDaysBefore: 3,
            onlyMatchingProfile: true,
          },
        }),
        { status: 200 },
      ),
    '/api/billing': () =>
      new Response(JSON.stringify({ entitlements: { plan: 'premium' } }), { status: 200 }),
    '/api/sync/status': () =>
      new Response(JSON.stringify({ lastRun: null, runs: [] }), { status: 200 }),
    '/api/push/vapid-key': () =>
      new Response(JSON.stringify({ configured: false, publicKey: null }), { status: 200 }),
    '/api/push/subscriptions': () =>
      new Response(JSON.stringify({ subscriptions: [] }), { status: 200 }),
    ...extra,
  };
}

describe('Kamu Bildirim Sepeti Phase 4 UI & Env Ops Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = 'light';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('AyarlarPage Sistem Altyapı Hazırlığı', () => {
    it('renders live configured provider readiness chips from GET /api/health', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation(
          baseAuthenticatedHandlers({
            '/api/health': () =>
              new Response(
                JSON.stringify({
                  status: 'ok',
                  app: 'Kamu Bildirim Sepeti',
                  timestamp: '2026-11-26T00:00:00.000Z',
                  database: { mode: 'd1', announcementsCount: 28 },
                  providers: {
                    email: 'resend',
                    payment: 'stripe',
                    configuredPayments: ['demo', 'stripe'],
                    pushConfigured: true,
                    cronSecretConfigured: true,
                    sessionSecretConfigured: true,
                  },
                }),
                { status: 200 },
              ),
          }),
        ),
      );

      render(<AyarlarPage />);

      await waitFor(() => {
        expect(screen.getByText(/Sistem Altyapı Hazırlığı/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Veritabanı: Hazır \(D1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/E-posta: Hazır \(resend\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Ödeme: Hazır \(stripe\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Web Push: Hazır/i)).toBeInTheDocument();
    });

    it('renders honest unconfigured and demo states from GET /api/health', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation(
          baseAuthenticatedHandlers({
            '/api/health': () =>
              new Response(
                JSON.stringify({
                  status: 'ok',
                  app: 'Kamu Bildirim Sepeti',
                  timestamp: '2026-11-26T00:00:00.000Z',
                  database: { mode: 'memory', announcementsCount: 28 },
                  providers: {
                    email: 'noop',
                    payment: 'demo',
                    configuredPayments: ['demo'],
                    pushConfigured: false,
                    cronSecretConfigured: false,
                    sessionSecretConfigured: false,
                  },
                }),
                { status: 200 },
              ),
          }),
        ),
      );

      render(<AyarlarPage />);

      await waitFor(() => {
        expect(screen.getByText(/Sistem Altyapı Hazırlığı/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Veritabanı: Demo Modu \(Bellek\)/i)).toBeInTheDocument();
      expect(screen.getByText(/E-posta: Yapılandırılmadı/i)).toBeInTheDocument();
      expect(screen.getByText(/Ödeme: Demo Modu/i)).toBeInTheDocument();
      expect(screen.getByText(/Web Push: Yapılandırılmadı/i)).toBeInTheDocument();
    });

    it('degrades gracefully without blocking page load when GET /api/health returns 500 or rejects', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation(
          baseAuthenticatedHandlers({
            '/api/health': () => new Response('Internal Server Error', { status: 500 }),
          }),
        ),
      );

      const { unmount } = render(<AyarlarPage />);
      await waitFor(() => {
        expect(screen.getByText(/Resmî Kaynak Senkronizasyon Durumu/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Sunucuya bağlanılamadı/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Altyapı durumu şu anda alınamadı/i)).toBeInTheDocument();
      expect(screen.getByText(/Veritabanı: Durum Alınamadı/i)).toBeInTheDocument();

      unmount();

      vi.stubGlobal(
        'fetch',
        mockFetchImplementation(
          baseAuthenticatedHandlers({
            '/api/health': () => Promise.reject(new Error('Network down')),
          }),
        ),
      );

      render(<AyarlarPage />);
      await waitFor(() => {
        expect(screen.getByText(/Resmî Kaynak Senkronizasyon Durumu/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Sunucuya bağlanılamadı/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Altyapı durumu şu anda alınamadı/i)).toBeInTheDocument();
    });
  });

  describe('.env.example Contract', () => {
    it('documents all 17 Phase 1-4 environment keys without forbidden brand strings, em-dashes, or real secrets', () => {
      const envPath = join(process.cwd(), '.env.example');
      const content = readFileSync(envPath, 'utf8');

      const requiredKeys = [
        'NEXT_PUBLIC_SITE_URL',
        'SESSION_SECRET',
        'CRON_SECRET',
        'RESEND_API_KEY',
        'MAILCHANNELS_API_KEY',
        'EMAIL_FROM',
        'PAYMENT_PROVIDER',
        'STRIPE_SECRET_KEY',
        'STRIPE_PRICE_ID_PREMIUM',
        'STRIPE_WEBHOOK_SECRET',
        'IYZICO_API_KEY',
        'IYZICO_SECRET_KEY',
        'IYZICO_BASE_URL',
        'VAPID_PUBLIC_KEY',
        'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'VAPID_SUBJECT',
      ];

      for (const key of requiredKeys) {
        expect(content).toMatch(new RegExp(`^${key}=`, 'm'));
      }

      const forbiddenBrand = ['bildir', 'io'].join('');
      expect(content.toLowerCase()).not.toContain(forbiddenBrand);
      expect(content).not.toContain('\u2014');
      expect(content).not.toContain('sk_live_');
      expect(content).not.toContain('re_');
      expect(content).not.toContain('-----BEGIN');
    });
  });
});
