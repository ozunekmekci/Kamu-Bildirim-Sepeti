'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MailCheck, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import AppShell from '@/components/AppShell';

interface VerifyResult {
  token: string;
  attempt: number;
  ok: boolean;
  verifiedAt: string | null;
  error: string | null;
}

function EpostaDogrulaContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!token) return;

    let active = true;

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!active) return;
        const data = (await res.json()) as {
          verified?: boolean;
          emailVerifiedAt?: string | null;
          error?: string;
        };
        if (!res.ok) {
          setResult({
            token,
            attempt,
            ok: false,
            verifiedAt: null,
            error: data.error || 'Doğrulama bağlantısı geçersiz veya süresi dolmuş olabilir.',
          });
          return;
        }
        setResult({
          token,
          attempt,
          ok: true,
          verifiedAt: data.emailVerifiedAt ?? null,
          error: null,
        });
      })
      .catch(() => {
        if (!active) return;
        setResult({
          token,
          attempt,
          ok: false,
          verifiedAt: null,
          error: 'Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.',
        });
      });

    return () => {
      active = false;
    };
  }, [token, attempt]);

  const currentResult =
    token && result && result.token === token && result.attempt === attempt ? result : null;
  const isLoading = Boolean(token) && currentResult === null;
  const isSuccess = Boolean(currentResult?.ok);
  const errorMessage = currentResult && !currentResult.ok ? currentResult.error : null;

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8 space-y-5">
      <div>
        <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-2">
          <MailCheck className="w-5 h-5" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider">E-posta Doğrulama</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
          E-posta Adresi Doğrulama
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Kamu Bildirim Sepeti bildirimlerinin güvenle iletilebilmesi için e-posta adresinizi doğrulayın.
        </p>
      </div>

      {!token && (
        <div className="space-y-4">
          <div className="p-4 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Bu sayfada doğrulama anahtarı bulunamadı. Hesabınıza yeni bir doğrulama bağlantısı göndermek için oturum açtıktan sonra{' '}
            <strong className="text-slate-900 dark:text-slate-100">Ayarlar</strong> sayfasındaki{' '}
            <strong className="text-slate-900 dark:text-slate-100">E-posta Doğrulama Durumu</strong> bölümünden &quot;Doğrulama Bağlantısı Gönder&quot; düğmesini kullanabilirsiniz.
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/ayarlar"
              className="min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center transition-colors"
            >
              Ayarlar Sayfasına Git
            </Link>
            <Link
              href="/giris"
              className="min-h-[44px] px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Giriş Yap
            </Link>
          </div>
        </div>
      )}

      {isLoading && (
        <div
          role="status"
          className="p-4 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm text-slate-700 dark:text-slate-300"
        >
          E-posta adresiniz doğrulanıyor...
        </div>
      )}

      {isSuccess && (
        <div className="space-y-4">
          <div
            role="status"
            className="p-4 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 space-y-1.5"
          >
            <div className="flex items-start gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>E-posta adresiniz başarıyla doğrulandı.</span>
            </div>
            {currentResult?.verifiedAt && (
              <p className="text-xs tabular-nums pl-6">
                Doğrulama zamanı: {new Date(currentResult.verifiedAt).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/ayarlar"
              className="min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center transition-colors"
            >
              Ayarlara Dön
            </Link>
            <Link
              href="/"
              className="min-h-[44px] px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              İlan Akışına Git
            </Link>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="space-y-4">
          <div
            role="alert"
            className="p-4 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs sm:text-sm text-red-900 dark:text-red-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAttempt((prev) => prev + 1)}
              className="min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Tekrar Dene</span>
            </button>
            <Link
              href="/ayarlar"
              className="min-h-[44px] px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Ayarlardan Yeni Bağlantı İste
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EpostaDogrulaPage() {
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
          <EpostaDogrulaContent />
        </Suspense>
      </div>
    </AppShell>
  );
}
