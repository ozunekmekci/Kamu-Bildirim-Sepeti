'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, AlertCircle } from 'lucide-react';
import AppShell from '@/components/AppShell';

export default function GirisPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Geçerli bir e-posta adresi giriniz.');
      return;
    }
    if (!password) {
      setError('Parolanızı giriniz.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Giriş yapılamadı. Bilgilerinizi kontrol ediniz.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-2">
            <LogIn className="w-5 h-5" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">Hesap Erişimi</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
            Kamu Bildirim Sepeti Giriş
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-6">
            Kayıtlı ilanlarınıza, profil eşleşmelerinize ve bildirim ayarlarınıza erişin.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-200 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                E-posta Adresi
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@eposta.com"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  Parola
                </label>
                <Link
                  href="/sifre-sifirla"
                  className="min-h-[44px] inline-flex items-center text-xs font-semibold text-[#b91c1c] dark:text-[#ef4444] hover:underline"
                >
                  Parolamı Unuttum
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 8 karakter"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-sm font-bold transition-colors cursor-pointer"
            >
              {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span>Hesabınız yok mu?</span>
            <Link
              href="/kayit"
              className="font-bold text-[#b91c1c] dark:text-[#ef4444] hover:underline py-2"
            >
              Ücretsiz Hesap Oluştur
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
