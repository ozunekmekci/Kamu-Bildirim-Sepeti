'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, AlertCircle, Lock } from 'lucide-react';
import AppShell from '@/components/AppShell';

export default function KayitPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
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
    if (password.length < 8) {
      setError('Parola en az 8 karakter olmalıdır.');
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError('Devam etmek için Kullanım Koşullarını ve Gizlilik Politikasını (KVKK) onaylayınız.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          fullName: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          acceptedTerms,
          acceptedPrivacy,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Kayıt işlemi tamamlanamadı.');
        return;
      }
      router.push('/profil');
      router.refresh();
    } catch {
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-2">
            <UserPlus className="w-5 h-5" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">Yeni Hesap</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
            Ücretsiz Hesap Oluştur
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-6">
            Kamu Bildirim Sepeti ile ilanları kaydedin ve aday profilinize uygun fırsatları görün.
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
                htmlFor="reg-fullname"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Ad Soyad (İsteğe bağlı)
              </label>
              <input
                id="reg-fullname"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Örn. Ayşe Yılmaz"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="reg-email"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                E-posta Adresi (Zorunlu)
              </label>
              <input
                id="reg-email"
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
              <label
                htmlFor="reg-phone"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Telefon Numarası (İsteğe bağlı)
              </label>
              <input
                id="reg-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XX XXX XX XX"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="reg-password"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Parola (En az 8 karakter)
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 8 karakter"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            {/* KVKK Summary Box */}
            <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                <span>KVKK ve Veri Güvenliği Özeti</span>
              </div>
              <p>
                Toplanan veriler: Ad (İsteğe bağlı), E-posta adresi, Kullanıcı kimlikleri, Telefon numarası (İsteğe bağlı) ve Profil bilgileri. Üçüncü taraflarla veri paylaşımı yok. Veriler aktarım sırasında şifreleniyor. Verilerin silinmesini Ayarlar sayfasından dilediğiniz zaman talep edebilirsiniz.
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer min-h-[44px] py-1">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#b91c1c]"
                />
                <span>
                  <Link href="/kullanim-kosullari" className="text-[#b91c1c] dark:text-[#ef4444] font-semibold underline">
                    Kullanım Koşullarını
                  </Link>{' '}
                  ve resmî kaynak bağlayıcılık uyarısını okudum, kabul ediyorum.
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer min-h-[44px] py-1">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#b91c1c]"
                />
                <span>
                  <Link href="/gizlilik-politikasi" className="text-[#b91c1c] dark:text-[#ef4444] font-semibold underline">
                    Gizlilik Politikasını (KVKK)
                  </Link>{' '}
                  okudum, kişisel verilerimin belirtilen kapsamda işlenmesini onaylıyorum.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-sm font-bold transition-colors cursor-pointer"
            >
              {loading ? 'Hesap Oluşturuluyor...' : 'Ücretsiz Hesap Oluştur'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <span>Zaten hesabınız var mı?</span>
            <Link
              href="/giris"
              className="font-bold text-[#b91c1c] dark:text-[#ef4444] hover:underline py-2"
            >
              Giriş Yap
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
