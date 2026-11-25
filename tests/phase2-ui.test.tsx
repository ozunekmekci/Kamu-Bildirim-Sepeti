import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SifreSifirlaPage from '@/app/sifre-sifirla/page';
import EpostaDogrulaPage from '@/app/eposta-dogrula/page';
import GirisPage from '@/app/giris/page';
import AyarlarPage from '@/app/ayarlar/page';
import PremiumPage from '@/app/premium/page';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
let mockSearchParams = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => mockSearchParams,
}));

function mockFetchImplementation(
  handlers: Record<string, (url: string, init?: RequestInit) => Response | Promise<Response>>
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

describe('Kamu Bildirim Sepeti Phase 2 UI Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = 'light';
    mockSearchParams = new URLSearchParams('');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('SifreSifirlaPage', () => {
    it('requests password reset when token is absent and shows preview link in dev mode', async () => {
      const forgotSpy = vi.fn();
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
          '/api/auth/forgot-password': (_url, init) => {
            forgotSpy(init?.body);
            return new Response(
              JSON.stringify({ accepted: true, previewToken: 'dev-reset-123' }),
              { status: 200 }
            );
          },
        })
      );

      render(<SifreSifirlaPage />);
      expect(
        screen.getByRole('heading', { level: 1, name: /Parola Sıfırlama Bağlantısı İste/i })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Sıfırlama Bağlantısı Gönder/i }));
      expect(screen.getByText(/Geçerli bir e-posta adresi giriniz/i)).toBeInTheDocument();
      expect(forgotSpy).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText(/E-posta Adresi/i), {
        target: { value: 'aday@test.tr' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Sıfırlama Bağlantısı Gönder/i }));

      await waitFor(() => {
        expect(forgotSpy).toHaveBeenCalledWith(JSON.stringify({ email: 'aday@test.tr' }));
      });
      expect(
        screen.getByText(/parola sıfırlama bağlantısı gönderildi/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Geliştirme Test Bağlantısı/i })
      ).toHaveAttribute('href', '/sifre-sifirla?token=dev-reset-123');
    });

    it('validates and resets password when token is present', async () => {
      mockSearchParams = new URLSearchParams('token=reset-tok-99');
      const resetSpy = vi.fn();

      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
          '/api/auth/reset-password': (_url, init) => {
            resetSpy(init?.body);
            return new Response(JSON.stringify({ reset: true }), { status: 200 });
          },
        })
      );

      render(<SifreSifirlaPage />);
      expect(
        screen.getByRole('heading', { level: 1, name: /Yeni Parola Belirle/i })
      ).toBeInTheDocument();

      // Short password
      fireEvent.change(screen.getByLabelText(/^Yeni Parola$/i), {
        target: { value: '12345' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Parolayı Güncelle/i }));
      expect(screen.getByText(/Yeni parola en az 8 karakter olmalıdır/i)).toBeInTheDocument();

      // Mismatched confirm password
      fireEvent.change(screen.getByLabelText(/^Yeni Parola$/i), {
        target: { value: 'YeniParola123' },
      });
      fireEvent.change(screen.getByLabelText(/Yeni Parola \(Tekrar\)/i), {
        target: { value: 'FarkliParola123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Parolayı Güncelle/i }));
      expect(screen.getByText(/Girdiğiniz parolalar eşleşmiyor/i)).toBeInTheDocument();
      expect(resetSpy).not.toHaveBeenCalled();

      // Matching valid password
      fireEvent.change(screen.getByLabelText(/Yeni Parola \(Tekrar\)/i), {
        target: { value: 'YeniParola123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Parolayı Güncelle/i }));

      await waitFor(() => {
        expect(resetSpy).toHaveBeenCalledWith(
          JSON.stringify({ token: 'reset-tok-99', newPassword: 'YeniParola123' })
        );
      });
      expect(screen.getByText(/Parolanız başarıyla güncellendi/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Giriş Sayfasına Git/i })).toHaveAttribute(
        'href',
        '/giris'
      );
    });
  });

  describe('EpostaDogrulaPage', () => {
    it('explains how to request verification from /ayarlar when token is absent', () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        })
      );

      render(<EpostaDogrulaPage />);
      expect(screen.getByText(/doğrulama anahtarı bulunamadı/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Ayarlar Sayfasına Git/i })).toHaveAttribute(
        'href',
        '/ayarlar'
      );
    });

    it('verifies email when valid token is present', async () => {
      mockSearchParams = new URLSearchParams('token=verify-ok-1');
      const verifySpy = vi.fn();

      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: true, user: { id: 'u1', email: 'a@b.tr' } }), { status: 200 }),
          '/api/auth/verify-email': (_url, init) => {
            verifySpy(init?.body);
            return new Response(
              JSON.stringify({ verified: true, emailVerifiedAt: '2026-11-26T10:00:00.000Z' }),
              { status: 200 }
            );
          },
        })
      );

      render(<EpostaDogrulaPage />);
      await waitFor(() => {
        expect(screen.getByText(/E-posta adresiniz başarıyla doğrulandı/i)).toBeInTheDocument();
      });
      expect(verifySpy).toHaveBeenCalledWith(JSON.stringify({ token: 'verify-ok-1' }));
    });

    it('shows error state and allows retry when token is invalid or expired', async () => {
      mockSearchParams = new URLSearchParams('token=verify-expired');
      let callCount = 0;

      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
          '/api/auth/verify-email': () => {
            callCount += 1;
            if (callCount === 1) {
              return new Response(
                JSON.stringify({ error: 'Doğrulama bağlantısı geçersiz veya süresi dolmuş.' }),
                { status: 400 }
              );
            }
            return new Response(
              JSON.stringify({ verified: true, emailVerifiedAt: '2026-11-26T10:05:00.000Z' }),
              { status: 200 }
            );
          },
        })
      );

      render(<EpostaDogrulaPage />);
      await waitFor(() => {
        expect(
          screen.getByText(/Doğrulama bağlantısı geçersiz veya süresi dolmuş/i)
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Tekrar Dene/i }));
      await waitFor(() => {
        expect(screen.getByText(/E-posta adresiniz başarıyla doğrulandı/i)).toBeInTheDocument();
      });
      expect(callCount).toBe(2);
    });
  });

  describe('GirisPage Forgot Password Link', () => {
    it('renders accessible Parolamı Unuttum link to /sifre-sifirla', () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        })
      );

      render(<GirisPage />);
      const forgotLink = screen.getByRole('link', { name: /Parolamı Unuttum/i });
      expect(forgotLink).toHaveAttribute('href', '/sifre-sifirla');
    });
  });

  describe('AyarlarPage Email Verification & Sync Status', () => {
    it('shows unverified email status, sends verification link, and shows empty sync state', async () => {
      const resendSpy = vi.fn();
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(
              JSON.stringify({
                authenticated: true,
                user: { id: 'u1', email: 'aday@test.tr', plan: 'free', emailVerifiedAt: null },
              }),
              { status: 200 }
            ),
          '/api/auth/resend-verification': () => {
            resendSpy();
            return new Response(
              JSON.stringify({ sent: true, provider: 'noop', previewToken: 'verify-preview-7' }),
              { status: 200 }
            );
          },
          '/api/notifications/preferences': () =>
            new Response(
              JSON.stringify({
                preferences: {
                  emailEnabled: true,
                  instantNewAnnouncements: false,
                  deadlineRemindersEnabled: true,
                  reminderDaysBefore: 3,
                  onlyMatchingProfile: true,
                },
              }),
              { status: 200 }
            ),
          '/api/billing': () =>
            new Response(JSON.stringify({ entitlements: { plan: 'free' } }), { status: 200 }),
          '/api/sync/status': () =>
            new Response(JSON.stringify({ lastRun: null, runs: [] }), { status: 200 }),
        })
      );

      render(<AyarlarPage />);
      await waitFor(() => {
        expect(screen.getByText(/Doğrulanmadı/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Henüz canlı senkronizasyon çalıştırılmadı/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Doğrulama Bağlantısı Gönder/i }));
      await waitFor(() => {
        expect(resendSpy).toHaveBeenCalled();
        expect(
          screen.getByText(/Doğrulama bağlantısı e-posta adresinize gönderildi/i)
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole('link', { name: /Geliştirme Test Bağlantısı/i })
      ).toHaveAttribute('href', '/eposta-dogrula?token=verify-preview-7');
    });

    it('shows verified timestamp and latest sync run summary when available', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(
              JSON.stringify({
                authenticated: true,
                user: {
                  id: 'u1',
                  email: 'aday@test.tr',
                  plan: 'premium',
                  emailVerifiedAt: '2026-11-25T14:30:00.000Z',
                },
              }),
              { status: 200 }
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
              { status: 200 }
            ),
          '/api/billing': () =>
            new Response(JSON.stringify({ entitlements: { plan: 'premium' } }), { status: 200 }),
          '/api/sync/status': () =>
            new Response(
              JSON.stringify({
                lastRun: {
                  id: 'sync-1',
                  triggeredBy: 'cron',
                  startedAt: '2026-11-26T00:00:00.000Z',
                  finishedAt: '2026-11-26T00:01:00.000Z',
                  status: 'success',
                  syncedCount: 28,
                  remindersSent: 2,
                  newAlertsSent: 1,
                },
                runs: [],
              }),
              { status: 200 }
            ),
        })
      );

      render(<AyarlarPage />);
      await waitFor(() => {
        expect(screen.getByText(/^Doğrulandı$/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/28 ilan/i)).toBeInTheDocument();
      expect(screen.getByText(/3 bildirim/i)).toBeInTheDocument();
    });
  });

  describe('PremiumPage Checkout Demo and Redirect Modes', () => {
    it('updates currentPlan in demo mode via POST /api/billing/checkout', async () => {
      const checkoutSpy = vi.fn();
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(
              JSON.stringify({
                authenticated: true,
                user: { id: 'u1', email: 'aday@test.tr', plan: 'free' },
              }),
              { status: 200 }
            ),
          '/api/billing/checkout': (_url, init) => {
            checkoutSpy(init?.body);
            return new Response(
              JSON.stringify({
                mode: 'demo',
                provider: 'demo',
                entitlements: { plan: 'premium' },
              }),
              { status: 200 }
            );
          },
          '/api/billing': () =>
            new Response(
              JSON.stringify({
                entitlements: { plan: 'free' },
                provider: 'demo',
              }),
              { status: 200 }
            ),
        })
      );

      render(<PremiumPage />);
      await waitFor(() => {
        expect(screen.getByText(/Ödeme Sağlayıcısı: Demo/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Premium Plana Geç/i }));
      await waitFor(() => {
        expect(checkoutSpy).toHaveBeenCalledWith(JSON.stringify({ plan: 'premium' }));
        expect(screen.getByText(/Premium plana geçiş tamamlandı/i)).toBeInTheDocument();
      });
    });

    it('navigates via window.location.assign when checkout returns redirect mode', async () => {
      const assignSpy = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, assign: assignSpy },
      });

      try {
        vi.stubGlobal(
          'fetch',
          mockFetchImplementation({
            '/api/auth/me': () =>
              new Response(
                JSON.stringify({
                  authenticated: true,
                  user: { id: 'u1', email: 'aday@test.tr', plan: 'free' },
                }),
                { status: 200 }
              ),
            '/api/billing/checkout': () =>
              new Response(
                JSON.stringify({
                  mode: 'redirect',
                  provider: 'stripe',
                  checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
                }),
                { status: 200 }
              ),
            '/api/billing': () =>
              new Response(
                JSON.stringify({
                  entitlements: { plan: 'free' },
                  provider: 'stripe',
                }),
                { status: 200 }
              ),
          })
        );

        render(<PremiumPage />);
        await waitFor(() => {
          expect(screen.getByText(/Ödeme Sağlayıcısı: Stripe/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Premium Plana Geç \(Stripe\)/i }));
        await waitFor(() => {
          expect(assignSpy).toHaveBeenCalledWith(
            'https://checkout.stripe.com/c/pay/cs_test_123'
          );
        });
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }
    });
  });
});
