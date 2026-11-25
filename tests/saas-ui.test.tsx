import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ThemeProvider, { THEME_STORAGE_KEY } from '@/components/ThemeProvider';
import AnnouncementFeed from '@/components/AnnouncementFeed';
import AnnouncementDetailClient from '@/components/AnnouncementDetailClient';
import ProfilPage from '@/app/profil/page';
import AyarlarPage from '@/app/ayarlar/page';
import PremiumPage from '@/app/premium/page';
import KayitliPage from '@/app/kayitli/page';
import GirisPage from '@/app/giris/page';
import KayitPage from '@/app/kayit/page';
import { INITIAL_ANNOUNCEMENTS } from '@/modules/announcements/seed';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

function mockFetchImplementation(handlers: Record<string, (url: string, init?: RequestInit) => Response | Promise<Response>>) {
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

describe('Kamu Bildirim Sepeti SaaS UI Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = 'light';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ThemeProvider', () => {
    it('defaults to light and toggles to dark while persisting to localStorage', () => {
      function DemoConsumer() {
        return <div data-testid="inside">Tema içeriği</div>;
      }

      render(
        <ThemeProvider>
          <DemoConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('inside')).toBeInTheDocument();
      expect(document.documentElement.classList.contains('light')).toBe(true);

      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      const { unmount } = render(
        <ThemeProvider>
          <div>Koyu Mod</div>
        </ThemeProvider>
      );
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      unmount();
    });
  });

  describe('AnnouncementFeed', () => {
    it('renders open/closed tabs, search/filters, criteria drawer with Escape close, and save 401 prompt', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/announcements?': () =>
            new Response(
              JSON.stringify({
                items: INITIAL_ANNOUNCEMENTS.slice(0, 15),
                total: INITIAL_ANNOUNCEMENTS.length,
                limited: true,
                limit: 15,
                plan: 'free',
              }),
              { status: 200 }
            ),
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
          '/api/saved': (_url, init) => {
            if (init?.method === 'POST') {
              return new Response(JSON.stringify({ error: 'Oturum açmanız gerekiyor.' }), {
                status: 401,
              });
            }
            return new Response(JSON.stringify({ error: 'Oturum açmanız gerekiyor.' }), {
              status: 401,
            });
          },
          '/api/announcements/matched': () =>
            new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        })
      );

      render(<AnnouncementFeed initialAnnouncements={INITIAL_ANNOUNCEMENTS} />);

      expect(
        screen.getByText(/Kamu Bildirim Sepeti: Resmî İlan Akışı ve Uygunluk Takibi/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Ücretsiz Hesap Oluştur/i })).toHaveAttribute(
        'href',
        '/kayit'
      );

      // Search filtering
      const searchInput = screen.getByLabelText(/İlan, Kurum, Şehir veya Nitelik Kodu Ara/i);
      fireEvent.change(searchInput, { target: { value: 'Adalet' } });
      expect(screen.getAllByText(/Adalet Bakanlığı/i).length).toBeGreaterThan(0);

      // Reset filters
      fireEvent.click(screen.getByRole('button', { name: /Sıfırla/i }));

      // Open criteria drawer and close with Escape
      const criteriaBtns = screen.getAllByRole('button', { name: /Şart Özeti/i });
      fireEvent.click(criteriaBtns[0]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Başvuru Şartları Özeti/i)).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Switch to Kapalı İlanlar tab
      fireEvent.click(screen.getByRole('tab', { name: /Kapalı İlanlar/i }));
      expect(screen.getAllByText(/Kapalı/i).length).toBeGreaterThan(0);

      // Switch to Bana Uygun tab (401 -> login prompt)
      fireEvent.click(screen.getByRole('tab', { name: /Bana Uygun/i }));
      await waitFor(() => {
        expect(screen.getByText(/Profil Eşleştirme İçin Oturum Açın/i)).toBeInTheDocument();
      });

      // Back to open tab and click Kaydet (401 feedback)
      fireEvent.click(screen.getByRole('tab', { name: /Açık İlanlar/i }));
      const saveBtns = screen.getAllByRole('button', { name: /^Kaydet$/i });
      fireEvent.click(saveBtns[0]);
      await waitFor(() => {
        expect(
          screen.getByText(/İlan kaydetmek için giriş yapmanız veya ücretsiz hesap oluşturmanız gerekir/i)
        ).toBeInTheDocument();
      });
    });

    it('shows Free plan locked match count on Bana Uygun tab', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/announcements/matched': () =>
            new Response(
              JSON.stringify({
                locked: true,
                items: [],
                totalMatches: 7,
                plan: 'free',
              }),
              { status: 200 }
            ),
          '/api/announcements?': () =>
            new Response(JSON.stringify({ items: INITIAL_ANNOUNCEMENTS }), { status: 200 }),
          '/api/auth/me': () =>
            new Response(
              JSON.stringify({
                authenticated: true,
                user: { id: 'u1', email: 'aday@test.tr', plan: 'free' },
              }),
              { status: 200 }
            ),
          '/api/saved': () =>
            new Response(JSON.stringify({ items: [], savedIds: [] }), { status: 200 }),
        })
      );

      render(<AnnouncementFeed initialAnnouncements={INITIAL_ANNOUNCEMENTS} />);
      fireEvent.click(screen.getByRole('tab', { name: /Bana Uygun/i }));

      await waitFor(() => {
        expect(screen.getByText(/Profilinizle Eşleşen 7 Açık İlan Bulundu/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('link', { name: /Premium Plana Geç/i })).toHaveAttribute(
        'href',
        '/premium'
      );
    });
  });

  describe('AnnouncementDetailClient', () => {
    it('renders announcement details and exact binding disclaimer', async () => {
      const sample = INITIAL_ANNOUNCEMENTS[0];
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
          [`/api/announcements/${sample.id}`]: () =>
            new Response(
              JSON.stringify({
                announcement: sample,
                saved: false,
                match: null,
                canUseProfileMatch: false,
                plan: 'free',
              }),
              { status: 200 }
            ),
        })
      );

      render(<AnnouncementDetailClient announcement={sample} />);
      expect(screen.getByRole('heading', { level: 1, name: sample.title })).toBeInTheDocument();
      expect(
        screen.getByText(
          /Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir/i
        )
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Resmî İlan Metnine Git/i })).toHaveAttribute(
        'href',
        sample.sourceUrl
      );
    });
  });

  describe('Account & SaaS Pages', () => {
    it('ProfilPage loads and updates user profile via PUT /api/profile', async () => {
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
          '/api/profile': (_url, init) => {
            if (init?.method === 'PUT') {
              return new Response(
                JSON.stringify({
                  user: { id: 'u1', email: 'aday@test.tr', fullName: 'Deniz Kaya' },
                  profile: { educationLevel: 'lisans', kpssScore: 86.5 },
                }),
                { status: 200 }
              );
            }
            return new Response(
              JSON.stringify({
                user: { id: 'u1', email: 'aday@test.tr', fullName: 'Deniz Kaya', phone: null },
                profile: {
                  educationLevel: 'lisans',
                  departmentId: 'bilgisayar-muhendisligi',
                  kpssScoreType: 'P3',
                  kpssScore: 86.5,
                  residenceCity: 'ANKARA',
                  militaryStatus: 'yapildi',
                  driverLicenses: ['B'],
                  certificates: ['6225'],
                  qualificationCodes: ['4531', '4001'],
                },
              }),
              { status: 200 }
            );
          },
        })
      );

      render(<ProfilPage />);
      await waitFor(() => {
        expect(screen.getByLabelText(/Ad Soyad/i)).toHaveValue('Deniz Kaya');
      });

      fireEvent.click(screen.getByRole('button', { name: /Profili Kaydet/i }));
      await waitFor(() => {
        expect(screen.getByText(/Aday profiliniz başarıyla kaydedildi/i)).toBeInTheDocument();
      });
    });

    it('AyarlarPage renders notification prefs and enforces SIL confirmation for account delete', async () => {
      const deleteSpy = vi.fn();
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
          '/api/account': (_url, init) => {
            deleteSpy(init?.body);
            return new Response(JSON.stringify({ deleted: true }), { status: 200 });
          },
        })
      );

      render(<AyarlarPage />);
      await waitFor(() => {
        expect(screen.getByLabelText(/Onay İçin "SIL" Yazınız/i)).toBeInTheDocument();
      });

      // Submit without SIL -> validation error
      fireEvent.click(
        screen.getByRole('button', { name: /Hesabımı ve Tüm Verilerimi Kalıcı Olarak Sil/i })
      );
      expect(screen.getByText(/kutuya büyük harflerle SIL yazmalısınız/i)).toBeInTheDocument();
      expect(deleteSpy).not.toHaveBeenCalled();

      // Submit with SIL
      fireEvent.change(screen.getByLabelText(/Onay İçin "SIL" Yazınız/i), {
        target: { value: 'SIL' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: /Hesabımı ve Tüm Verilerimi Kalıcı Olarak Sil/i })
      );

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalled();
      });
    });

    it('PremiumPage renders Free vs Premium without Most Popular badge and switches plan', async () => {
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
          '/api/billing/plan': () =>
            new Response(
              JSON.stringify({ entitlements: { plan: 'premium' } }),
              { status: 200 }
            ),
          '/api/billing': () =>
            new Response(JSON.stringify({ entitlements: { plan: 'free' } }), { status: 200 }),
        })
      );

      render(<PremiumPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Premium Plana Geç/i })).toBeInTheDocument();
      });
      expect(screen.queryByText(/En Popüler|Most Popular/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Premium Plana Geç/i }));
      await waitFor(() => {
        expect(screen.getByText(/Premium plana geçiş tamamlandı/i)).toBeInTheDocument();
      });
    });

    it('KayitliPage displays saved announcements and removes item', async () => {
      const sample = INITIAL_ANNOUNCEMENTS[0];
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
          '/api/saved': (_url, init) => {
            if (init?.method === 'DELETE') {
              return new Response(JSON.stringify({ removed: true }), { status: 200 });
            }
            return new Response(
              JSON.stringify({
                items: [{ savedAt: '2026-11-26T00:00:00Z', announcement: sample }],
                savedIds: [sample.id],
              }),
              { status: 200 }
            );
          },
          '/api/billing': () =>
            new Response(
              JSON.stringify({ entitlements: { plan: 'free', maxSaved: 10 } }),
              { status: 200 }
            ),
        })
      );

      render(<KayitliPage />);
      await waitFor(() => {
        expect(screen.getByText(sample.title)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Kayıttan Çıkar/i }));
      await waitFor(() => {
        expect(screen.getByText(/Henüz kayıtlı ilanınız bulunmuyor/i)).toBeInTheDocument();
      });
    });

    it('GirisPage and KayitPage validate forms cleanly', () => {
      vi.stubGlobal(
        'fetch',
        mockFetchImplementation({
          '/api/auth/me': () =>
            new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 }),
        })
      );

      const { unmount } = render(<GirisPage />);
      fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/i }));
      expect(screen.getByText(/Geçerli bir e-posta adresi giriniz/i)).toBeInTheDocument();
      unmount();

      render(<KayitPage />);
      fireEvent.change(screen.getByLabelText(/E-posta Adresi/i), {
        target: { value: 'aday@test.tr' },
      });
      fireEvent.change(screen.getByLabelText(/Parola/i), {
        target: { value: '12345678' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Ücretsiz Hesap Oluştur/i }));
      expect(
        screen.getByText(/Kullanım Koşullarını ve Gizlilik Politikasını \(KVKK\) onaylayınız/i)
      ).toBeInTheDocument();
    });
  });
});
