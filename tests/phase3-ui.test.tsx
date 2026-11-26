import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppShell from '@/components/AppShell';
import PublicInsightsClient from '@/components/PublicInsightsClient';
import AnalizPage from '@/app/analiz/page';
import SehirLandingPage, {
  generateMetadata as generateSehirMetadata,
  generateStaticParams as generateSehirStaticParams,
} from '@/app/sehir/[slug]/page';
import KaynakLandingPage, {
  generateMetadata as generateKaynakMetadata,
  generateStaticParams as generateKaynakStaticParams,
} from '@/app/kaynak/[slug]/page';
import AyarlarPage from '@/app/ayarlar/page';
import ProfilPage from '@/app/profil/page';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/analiz',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  notFound: () => mockNotFound(),
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

const VALID_TEST_VAPID_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

describe('Kamu Bildirim Sepeti Phase 3 UI Tests', () => {
  const originalPushManager = Object.getOwnPropertyDescriptor(window, 'PushManager');
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification');

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = 'light';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalPushManager) {
      Object.defineProperty(window, 'PushManager', originalPushManager);
    } else {
      delete (window as unknown as Record<string, unknown>).PushManager;
    }
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    }
    if (originalNotification) {
      Object.defineProperty(window, 'Notification', originalNotification);
    } else {
      delete (window as unknown as Record<string, unknown>).Notification;
    }
  });

  describe('AppShell Phase 3 Navigation & Footer', () => {
    it('includes /analiz in primary nav and SEO landing links in footer', () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        })
      );

      render(
        <AppShell>
          <div>İçerik</div>
        </AppShell>
      );

      const analizLinks = screen.getAllByRole('link', { name: /Analiz/i });
      expect(analizLinks.some((el) => el.getAttribute('href') === '/analiz')).toBe(true);
      expect(screen.getByRole('link', { name: /Ankara İlanları/i })).toHaveAttribute(
        'href',
        '/sehir/ankara'
      );
      expect(screen.getByRole('link', { name: /İstanbul İlanları/i })).toHaveAttribute(
        'href',
        '/sehir/istanbul'
      );
      expect(screen.getByRole('link', { name: /^Kariyer Kapısı$/i })).toHaveAttribute(
        'href',
        '/kaynak/kariyer-kapisi'
      );
    });
  });

  describe('PublicInsightsClient & /analiz', () => {
    it('renders metric cards, breakdowns, city links, official source links, and binding disclaimer', () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        })
      );

      const { unmount } = render(<PublicInsightsClient />);

      expect(screen.getByText(/Aktif Açık İlan/i)).toBeInTheDocument();
      expect(screen.getByText(/Toplam Arşiv Kadrosu/i)).toBeInTheDocument();
      expect(screen.getByText(/Toplam Arşiv Kontenjanı/i)).toBeInTheDocument();
      expect(screen.getByText(/İzlenen İl Sayısı/i)).toBeInTheDocument();
      expect(screen.getByText(/En Çok Kontenjan Açan Kurumlar/i)).toBeInTheDocument();
      expect(screen.getByText(/Öne Çıkan İller/i)).toBeInTheDocument();
      expect(screen.getByText(/Sık Aranan Nitelik Kodları/i)).toBeInTheDocument();
      expect(screen.getByText(/KPSS Dönem Dağılımı/i)).toBeInTheDocument();
      expect(screen.getByText(/İlan Türü Dağılımı/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde/i
        )
      ).toBeInTheDocument();

      const sourceLinks = screen.getAllByRole('link', { name: /Kaynak İlanlarını İncele/i });
      expect(sourceLinks).toHaveLength(3);

      unmount();

      render(<AnalizPage />);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /Kamu İlanları, Şehir Dağılımı ve KPSS Arşiv Analizi/i,
        })
      ).toBeInTheDocument();
    });
  });

  describe('Dynamic SEO Pages (/sehir/[slug] & /kaynak/[slug])', () => {
    it('resolves SehirLandingPage params, metadata, content, and calls notFound on invalid slug', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        })
      );

      const staticParams = await generateSehirStaticParams();
      expect(staticParams.length).toBeGreaterThan(0);
      expect(staticParams.length).toBeLessThanOrEqual(30);
      expect(staticParams.some((p) => p.slug === 'ankara')).toBe(true);

      const meta = await generateSehirMetadata({ params: Promise.resolve({ slug: 'ankara' }) });
      expect(String(meta.title)).toContain('ANKARA');
      expect(meta.alternates?.canonical).toBe('/sehir/ankara');

      const ui = await SehirLandingPage({ params: Promise.resolve({ slug: 'ankara' }) });
      render(ui);

      expect(
        screen.getByRole('heading', { level: 1, name: /ANKARA Kamu İlanları ve KPSS Arşivi/i })
      ).toBeInTheDocument();
      expect(screen.getAllByText(/KPSS Arşiv Kadrosu/i).length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(
          /Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde/i
        ).length
      ).toBeGreaterThan(0);

      await expect(
        SehirLandingPage({ params: Promise.resolve({ slug: 'olmayan-il-999' }) })
      ).rejects.toThrow('NEXT_NOT_FOUND');
      expect(mockNotFound).toHaveBeenCalled();
    });

    it('resolves KaynakLandingPage params, metadata, announcements, and calls notFound on invalid slug', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        })
      );

      const staticParams = await generateKaynakStaticParams();
      expect(staticParams.map((p) => p.slug)).toEqual([
        'kariyer-kapisi',
        'iskur',
        'resmi-gazete',
      ]);

      const meta = await generateKaynakMetadata({
        params: Promise.resolve({ slug: 'kariyer-kapisi' }),
      });
      expect(String(meta.title)).toContain('Kariyer Kapısı');
      expect(meta.alternates?.canonical).toBe('/kaynak/kariyer-kapisi');

      const ui = await KaynakLandingPage({ params: Promise.resolve({ slug: 'kariyer-kapisi' }) });
      render(ui);

      expect(
        screen.getByRole('heading', { level: 1, name: /Kariyer Kapısı İlanları/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Resmî Kaynak Sitesine Git/i })).toHaveAttribute(
        'href',
        'https://kariyerkapisi.gov.tr'
      );

      const kariyerItem = INITIAL_ANNOUNCEMENTS.find((a) => a.source === 'kariyer_kapisi');
      if (kariyerItem) {
        expect(screen.getByRole('link', { name: kariyerItem.title })).toHaveAttribute(
          'href',
          `/ilan/${kariyerItem.id}`
        );
      }

      await expect(
        KaynakLandingPage({ params: Promise.resolve({ slug: 'gecersiz-kaynak' }) })
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  describe('AyarlarPage Web Push Section', () => {
    it('shows honest unconfigured status when VAPID_PUBLIC_KEY is unset on server', async () => {
      Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { register: vi.fn() },
      });

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
            new Response(JSON.stringify({ lastRun: null }), { status: 200 }),
          '/api/push/vapid-key': () =>
            new Response(JSON.stringify({ configured: false, publicKey: null }), { status: 200 }),
          '/api/push/subscriptions': () =>
            new Response(JSON.stringify({ subscriptions: [] }), { status: 200 }),
        })
      );

      render(<AyarlarPage />);
      await waitFor(() => {
        expect(
          screen.getByText(/Sunucu VAPID anahtarı henüz tanımlanmadı/i)
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole('button', { name: /Tarayıcı Bildirimlerini Etkinleştir/i })
      ).not.toBeInTheDocument();
    });

    it('subscribes and unsubscribes Web Push when VAPID key is configured', async () => {
      const unsubscribeMock = vi.fn(async () => true);
      const fakeSubscription = {
        endpoint: 'https://push.example.com/sub/123',
        toJSON: () => ({
          endpoint: 'https://push.example.com/sub/123',
          keys: { p256dh: 'p256dh-key-test', auth: 'auth-key-test' },
        }),
        unsubscribe: unsubscribeMock,
      };
      let currentSub: typeof fakeSubscription | null = null;
      const pushManagerMock = {
        getSubscription: vi.fn(async () => currentSub),
        subscribe: vi.fn(async () => {
          currentSub = fakeSubscription;
          return fakeSubscription;
        }),
      };
      const regMock = { pushManager: pushManagerMock };

      Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { requestPermission: vi.fn(async () => 'granted') },
      });
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          register: vi.fn(async () => regMock),
          ready: Promise.resolve(regMock),
          getRegistration: vi.fn(async () => regMock),
        },
      });

      const postSubSpy = vi.fn();
      const deleteSubSpy = vi.fn();

      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(
              JSON.stringify({
                authenticated: true,
                user: { id: 'u1', email: 'aday@test.tr', plan: 'premium' },
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
            new Response(JSON.stringify({ lastRun: null }), { status: 200 }),
          '/api/push/vapid-key': () =>
            new Response(
              JSON.stringify({ configured: true, publicKey: VALID_TEST_VAPID_KEY }),
              { status: 200 }
            ),
          '/api/push/subscriptions': (_url, init) => {
            if (init?.method === 'POST') {
              postSubSpy(init.body);
              return new Response(
                JSON.stringify({
                  subscription: {
                    id: 'sub-1',
                    endpoint: 'https://push.example.com/sub/123',
                    userAgent: 'Vitest',
                    createdAt: '2026-11-26T00:00:00.000Z',
                  },
                }),
                { status: 201 }
              );
            }
            if (init?.method === 'DELETE') {
              deleteSubSpy(init.body);
              return new Response(JSON.stringify({ deleted: true }), { status: 200 });
            }
            return new Response(JSON.stringify({ subscriptions: [] }), { status: 200 });
          },
        })
      );

      render(<AyarlarPage />);
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Tarayıcı Bildirimlerini Etkinleştir/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole('button', { name: /Tarayıcı Bildirimlerini Etkinleştir/i })
      );

      await waitFor(() => {
        expect(postSubSpy).toHaveBeenCalled();
        expect(
          screen.getByText(/Tarayıcı anlık bildirimleri etkinleştirildi/i)
        ).toBeInTheDocument();
      });
      expect(screen.getByText(/Aktif \(1 Cihaz\)/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Aboneliği Kapat/i }));
      await waitFor(() => {
        expect(deleteSubSpy).toHaveBeenCalledWith(
          JSON.stringify({ endpoint: 'https://push.example.com/sub/123' })
        );
        expect(screen.getByText(/Tarayıcı anlık bildirim aboneliği kaldırıldı/i)).toBeInTheDocument();
      });
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('ProfilPage Senaryo Karşılaştırma', () => {
    it('computes open announcement gain/loss live when comparing alternate score, city, or license', async () => {
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
          '/api/profile': () =>
            new Response(
              JSON.stringify({
                user: { id: 'u1', email: 'aday@test.tr', fullName: 'Deniz Kaya', phone: null },
                profile: {
                  educationLevel: 'lisans',
                  departmentId: 'bilgisayar-muhendisligi',
                  kpssScoreType: 'P3',
                  kpssScore: 55,
                  residenceCity: 'ANKARA',
                  militaryStatus: 'yapildi',
                  driverLicenses: [],
                  certificates: ['6225'],
                  qualificationCodes: ['4531', '4001'],
                },
              }),
              { status: 200 }
            ),
        })
      );

      render(<ProfilPage />);
      await waitFor(() => {
        expect(screen.getByLabelText(/Alternatif KPSS Puanı/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Alternatif KPSS Puanı/i), {
        target: { value: '95' },
      });
      fireEvent.click(screen.getByLabelText(/Senaryo B Sınıfı/i));
      fireEvent.click(screen.getByRole('button', { name: /Senaryoyu Karşılaştır/i }));

      expect(screen.getByText(/Mevcut Uygun İlan/i)).toBeInTheDocument();
      expect(screen.getByText(/Senaryo Uygun İlan/i)).toBeInTheDocument();
      expect(screen.getByText(/Net Fark/i)).toBeInTheDocument();
    });
  });
});
