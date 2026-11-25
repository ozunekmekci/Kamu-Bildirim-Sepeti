'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Bookmark,
  Menu,
  Moon,
  Sun,
  User,
  Settings,
  Sparkles,
  Archive,
  LogOut,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

interface AuthUser {
  id: string;
  email: string;
  fullName?: string | null;
  plan?: 'free' | 'premium';
}

export interface AppShellProps {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
}

const NAV_LINKS = [
  { href: '/', label: 'İlan Akışı', icon: Bell },
  { href: '/kpss-arsivi', label: 'KPSS Arşivi', icon: Archive },
  { href: '/kayitli', label: 'Kayıtlılar', icon: Bookmark },
  { href: '/profil', label: 'Profilim', icon: User },
  { href: '/premium', label: 'Planlar', icon: Sparkles },
  { href: '/ayarlar', label: 'Ayarlar', icon: Settings },
];

export default function AppShell({ children, initialUser = null }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [authLoaded, setAuthLoaded] = useState<boolean>(initialUser !== null);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { user?: AuthUser | null };
        return data.user ?? null;
      })
      .then((u) => {
        if (active) {
          setUser(u);
          setAuthLoaded(true);
        }
      })
      .catch(() => {
        if (active) setAuthLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setMobileOpen(false);
      router.push('/');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900 dark:bg-[#0b0f14] dark:text-slate-100">
      {/* Top Institutional Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white dark:bg-[#111827] border-b border-slate-300 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-3">
            {/* Brand Mark */}
            <Link
              href="/"
              className="flex items-center gap-2.5 min-h-[44px] pr-2 group focus-visible:outline-2"
            >
              <span
                aria-hidden="true"
                className="w-9 h-9 bg-[#b91c1c] dark:bg-[#dc2626] text-white font-black text-xs tracking-tight flex items-center justify-center border border-red-900 dark:border-red-400 shrink-0"
              >
                KBS
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 tracking-tight group-hover:text-[#b91c1c] dark:group-hover:text-[#ef4444] transition-colors">
                  Kamu Bildirim Sepeti
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 hidden sm:block">
                  Resmî İlan Takip ve KPSS Arşivi
                </span>
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav aria-label="Ana Menü" className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`min-h-[44px] px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                      isActive
                        ? 'bg-red-50 dark:bg-red-950/60 text-[#b91c1c] dark:text-red-300 border-red-200 dark:border-red-900'
                        : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right Utility Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
                title={theme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}
                className="min-h-[44px] min-w-[44px] px-2.5 inline-flex items-center justify-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Moon className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {authLoaded && user ? (
                <div className="hidden sm:flex items-center gap-2">
                  <Link
                    href="/profil"
                    className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 hover:border-slate-400 dark:hover:border-slate-600"
                  >
                    <span className="max-w-[140px] truncate">{user.fullName || user.email}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      {user.plan === 'premium' ? 'Premium' : 'Ücretsiz'}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Çıkış</span>
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <Link
                    href="/giris"
                    className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center"
                  >
                    Giriş Yap
                  </Link>
                  <Link
                    href="/kayit"
                    className="min-h-[44px] px-3.5 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center transition-colors"
                  >
                    Ücretsiz Kayıt
                  </Link>
                </div>
              )}

              {/* Mobile Menu Button */}
              <button
                type="button"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-expanded={mobileOpen}
                aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
                className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div
            role="dialog"
            aria-label="Mobil Menü"
            className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-3 py-3 space-y-1"
          >
            {NAV_LINKS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`min-h-[44px] px-3 py-2.5 text-sm font-semibold flex items-center gap-2 border ${
                    isActive
                      ? 'bg-red-50 dark:bg-red-950/60 text-[#b91c1c] dark:text-red-300 border-red-200 dark:border-red-900'
                      : 'border-transparent text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>Çıkış Yap ({user.email})</span>
                </button>
              ) : (
                <>
                  <Link
                    href="/giris"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 text-sm font-semibold text-center flex items-center justify-center text-slate-800 dark:text-slate-200"
                  >
                    Giriş Yap
                  </Link>
                  <Link
                    href="/kayit"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 min-h-[44px] px-3 py-2 bg-[#b91c1c] dark:bg-[#dc2626] text-white text-sm font-bold text-center flex items-center justify-center"
                  >
                    Ücretsiz Hesap Oluştur
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Institutional & Legal Footer */}
      <footer className="mt-12 border-t border-slate-300 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs text-slate-700 dark:text-slate-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Binding Disclaimer */}
          <div className="border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed text-slate-700 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-100">Resmî Bağlayıcılık Uyarısı:</strong>{' '}
              Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2">
                Kamu Bildirim Sepeti
              </h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Kariyer Kapısı, İŞKUR ve Resmî Gazete üzerinden yayımlanan atama, personel alımı ve görevlendirme ilanları ile KPSS merkezi yerleştirme arşivini tek platformda sunar.
              </p>
            </div>

            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2">
                Resmî Kaynaklar
              </h2>
              <ul className="space-y-1.5">
                <li>
                  <a
                    href="https://kariyerkapisi.gov.tr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline"
                  >
                    <span>Kariyer Kapısı Kamu İşe Alım</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.iskur.gov.tr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline"
                  >
                    <span>Türkiye İş Kurumu (İŞKUR)</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.resmigazete.gov.tr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline"
                  >
                    <span>T.C. Resmî Gazete</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-2">
                Platform ve Hukuki Metinler
              </h2>
              <nav aria-label="Alt Bilgi Bağlantıları" className="flex flex-wrap gap-x-4 gap-y-2">
                <Link href="/kpss-arsivi" className="hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline">
                  KPSS Arşivi
                </Link>
                <Link href="/premium" className="hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline">
                  Planlar
                </Link>
                <Link href="/gizlilik-politikasi" className="hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline">
                  Gizlilik Politikası (KVKK)
                </Link>
                <Link href="/kullanim-kosullari" className="hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline">
                  Kullanım Koşulları
                </Link>
                <Link href="/ayarlar" className="hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline">
                  Veri ve Hesap Silme
                </Link>
              </nav>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <span>Kamu Bildirim Sepeti: Bağımsız Kamu İlan Takip Platformu</span>
            <span>Veriler aktarım sırasında şifrelenir. Üçüncü taraflarla veri paylaşımı yoktur.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
