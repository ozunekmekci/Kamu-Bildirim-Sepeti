'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound, Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import AppShell from '@/components/AppShell';

function SifreSifirlaContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';

  const [email, setEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);
    setPreviewToken(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setRequestError('Geçerli bir e-posta adresi giriniz.');
      return;
    }

    setRequestLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = (await res.json()) as {
        accepted?: boolean;
        previewToken?: string;
        error?: string;
      };
      if (!res.ok) {
        setRequestError(data.error || 'Parola sıfırlama talebi gönderilemedi.');
        return;
      }
      setRequestSent(true);
      if (data.previewToken) {
        setPreviewToken(data.previewToken);
      }
    } catch {
      setRequestError('Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (newPassword.length < 8) {
      setResetError('Yeni parola en az 8 karakter olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Girdiğiniz parolalar eşleşmiyor.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = (await res.json()) as { reset?: boolean; error?: string };
      if (!res.ok) {
        setResetError(
          data.error || 'Parola sıfırlama bağlantısı geçersiz veya süresi dolmuş olabilir.'
        );
        return;
      }
      setResetSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setResetError('Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
    } finally {
      setResetLoading(false);
    }
  };

  if (token) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8 space-y-5">
        <div>
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-2">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">Parola Yenileme</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
            Yeni Parola Belirle
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Hesabınız için en az 8 karakterden oluşan yeni bir parola belirleyiniz.
          </p>
        </div>

        {resetError && (
          <div
            role="alert"
            className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{resetError}</span>
          </div>
        )}

        {resetSuccess ? (
          <div className="space-y-4">
            <div
              role="status"
              className="p-4 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Parolanız başarıyla güncellendi. Güvenliğiniz için önceki oturumlarınız sonlandırıldı.
              </span>
            </div>
            <Link
              href="/giris"
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-sm font-bold flex items-center justify-center transition-colors"
            >
              Giriş Sayfasına Git
            </Link>
          </div>
        ) : (
          <form onSubmit={handleResetSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="reset-new-password"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Yeni Parola
              </label>
              <input
                id="reset-new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="En az 8 karakter"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="reset-confirm-password"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Yeni Parola (Tekrar)
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni parolanızı tekrar giriniz"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-sm font-bold transition-colors cursor-pointer"
            >
              {resetLoading ? 'Güncelleniyor...' : 'Parolayı Güncelle'}
            </button>
          </form>
        )}

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <Link
            href="/sifre-sifirla"
            className="min-h-[44px] inline-flex items-center font-semibold text-slate-700 dark:text-slate-300 hover:underline"
          >
            Yeni Sıfırlama Bağlantısı İste
          </Link>
          <Link
            href="/giris"
            className="min-h-[44px] inline-flex items-center gap-1 font-bold text-[#b91c1c] dark:text-[#ef4444] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Giriş Yap</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8 space-y-5">
      <div>
        <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-2">
          <Mail className="w-5 h-5" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider">Hesap Kurtarma</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
          Parola Sıfırlama Bağlantısı İste
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Kayıtlı e-posta adresinizi girin. Hesabınız bulunuyorsa parola yenileme bağlantısı gönderilecektir.
        </p>
      </div>

      {requestError && (
        <div
          role="alert"
          className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{requestError}</span>
        </div>
      )}

      {requestSent && (
        <div
          role="status"
          className="p-4 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 space-y-3"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              E-posta adresiniz sistemimizde kayıtlıysa parola sıfırlama bağlantısı gönderildi. Lütfen gelen kutunuzu ve gereksiz e-posta klasörünüzü kontrol ediniz.
            </span>
          </div>
          {previewToken && (
            <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800">
              <Link
                href={`/sifre-sifirla?token=${encodeURIComponent(previewToken)}`}
                className="min-h-[44px] px-3 py-2 inline-flex items-center border border-emerald-700 dark:border-emerald-500 font-bold text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
              >
                Geliştirme Test Bağlantısı
              </Link>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleRequestSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="forgot-email"
            className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
          >
            E-posta Adresi
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@eposta.com"
            className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
          />
        </div>

        <button
          type="submit"
          disabled={requestLoading}
          className="w-full min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-sm font-bold transition-colors cursor-pointer"
        >
          {requestLoading ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
        </button>
      </form>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>Parolanızı hatırladınız mı?</span>
        <Link
          href="/giris"
          className="min-h-[44px] inline-flex items-center gap-1 font-bold text-[#b91c1c] dark:text-[#ef4444] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Giriş Yap</span>
        </Link>
      </div>
    </div>
  );
}

export default function SifreSifirlaPage() {
  return (
    <AppShell>
      <div className="max-w-md mx-auto px-4 py-10">
        <Suspense
          fallback={
            <div
              role="status"
              className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 text-center text-sm text-slate-600 dark:text-slate-400"
            >
              Sayfa yükleniyor...
            </div>
          }
        >
          <SifreSifirlaContent />
        </Suspense>
      </div>
    </AppShell>
  );
}
