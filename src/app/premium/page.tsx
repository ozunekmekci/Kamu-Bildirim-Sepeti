'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import AppShell from '@/components/AppShell';

type BillingProvider = 'demo' | 'stripe' | 'iyzico';

function formatProviderLabel(provider: BillingProvider): string {
  if (provider === 'stripe') return 'Stripe';
  if (provider === 'iyzico') return 'iyzico';
  return 'Demo';
}

export default function PremiumPage() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<'free' | 'premium'>('free');
  const [provider, setProvider] = useState<BillingProvider>('demo');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/billing', { cache: 'no-store' })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) {
          setAuthenticated(false);
          setCurrentPlan('free');
          return;
        }
        if (!res.ok) {
          setError('Plan bilgisi alınamadı.');
          return;
        }
        const data = (await res.json()) as {
          entitlements?: { plan: 'free' | 'premium' };
          provider?: BillingProvider;
        };
        setAuthenticated(true);
        setCurrentPlan(data.entitlements?.plan ?? 'free');
        if (data.provider === 'stripe' || data.provider === 'iyzico' || data.provider === 'demo') {
          setProvider(data.provider);
        }
      })
      .catch(() => {
        if (active) setError('Sunucuya bağlanılamadı.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handlePlanChange = async (targetPlan: 'free' | 'premium') => {
    setError(null);
    setSuccess(null);
    setSwitching(true);
    try {
      let res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      });

      if (res.status === 401) {
        setError('Plan değişikliği için önce giriş yapmalısınız.');
        return;
      }

      let data = (await res.json()) as {
        error?: string;
        mode?: 'demo' | 'redirect';
        provider?: BillingProvider;
        checkoutUrl?: string;
        entitlements?: { plan: 'free' | 'premium' };
      };

      if (res.status === 404 || (res.ok && !data.mode && !data.checkoutUrl)) {
        res = await fetch('/api/billing/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: targetPlan }),
        });
        if (res.status === 401) {
          setError('Plan değişikliği için önce giriş yapmalısınız.');
          return;
        }
        data = (await res.json()) as typeof data;
      }

      if (!res.ok) {
        setError(data.error || 'Plan güncellenemedi.');
        return;
      }

      if (data.provider === 'stripe' || data.provider === 'iyzico' || data.provider === 'demo') {
        setProvider(data.provider);
      }

      if (data.mode === 'redirect' && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      const nextPlan = data.entitlements?.plan ?? targetPlan;
      setCurrentPlan(nextPlan);
      setSuccess(
        nextPlan === 'premium'
          ? 'Premium plana geçiş tamamlandı (Demo).'
          : 'Ücretsiz plana geçiş tamamlandı.'
      );
    } catch {
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setSwitching(false);
    }
  };

  const activeProviderLabel = formatProviderLabel(provider);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              Kamu Bildirim Sepeti Planları
            </h1>
            {authenticated && (
              <span className="text-xs font-semibold px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                Ödeme Sağlayıcısı: {activeProviderLabel}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Temel ilan takibi ve KPSS arşivi tüm kullanıcılar için ücretsizdir. Profil eşleştirme ve anlık hatırlatıcılar için Premium planı seçebilirsiniz.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="p-3 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Free Plan */}
          <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Ücretsiz Plan
                </h2>
                {authenticated && currentPlan === 'free' && (
                  <span className="px-2 py-0.5 text-xs font-bold border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                    Mevcut Planınız
                  </span>
                )}
              </div>

              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                0 TL <span className="text-xs font-normal text-slate-600 dark:text-slate-400">/ ay</span>
              </div>

              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="tabular-nums">Güncel ilan akışında ilk 15 ilanı görüntüleme</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="tabular-nums">En fazla 10 ilanı sepete kaydetme</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>İlan başvuru şartları özeti ve resmî kaynak bağlantıları</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Tam KPSS merkezi yerleştirme ve nitelik kodu arşivi</span>
                </li>
              </ul>
            </div>

            {!loading && authenticated ? (
              <button
                type="button"
                disabled={switching || currentPlan === 'free'}
                onClick={() => handlePlanChange('free')}
                className="w-full min-h-[44px] px-4 py-2.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                {currentPlan === 'free' ? 'Aktif Plan' : 'Ücretsiz Plana Geç'}
              </button>
            ) : (
              <Link
                href="/kayit"
                className="w-full min-h-[44px] px-4 py-2.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm font-bold text-center text-slate-900 dark:text-slate-100 flex items-center justify-center"
              >
                Ücretsiz Başla
              </Link>
            )}
          </section>

          {/* Premium Plan */}
          <section className="bg-white dark:bg-[#111827] border-2 border-[#b91c1c] dark:border-[#ef4444] p-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Premium Plan
                </h2>
                {authenticated && currentPlan === 'premium' && (
                  <span className="px-2 py-0.5 text-xs font-bold border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-[#b91c1c] dark:text-red-300">
                    Mevcut Planınız
                  </span>
                )}
              </div>

              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {provider === 'demo' ? (
                  <>
                    Demo Erişim <span className="text-xs font-normal text-slate-600 dark:text-slate-400">(Test Modu)</span>
                  </>
                ) : (
                  <>
                    Premium Erişim{' '}
                    <span className="text-xs font-normal text-slate-600 dark:text-slate-400">
                      ({activeProviderLabel})
                    </span>
                  </>
                )}
              </div>

              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Tüm açık ve kapalı ilanlara sınırsız erişim</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>&quot;Bana Uygun&quot; profil eşleştirme sekmesi ve gerekçe dökümü</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Sınırsız ilan kaydetme</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Anlık yeni ilan ve son başvuru hatırlatıcıları</span>
                </li>
              </ul>
            </div>

            {!loading && authenticated ? (
              <button
                type="button"
                disabled={switching || currentPlan === 'premium'}
                onClick={() => handlePlanChange('premium')}
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                {currentPlan === 'premium'
                  ? 'Aktif Plan'
                  : switching
                    ? 'Yönlendiriliyor...'
                    : provider === 'demo'
                      ? 'Premium Plana Geç (Demo)'
                      : `Premium Plana Geç (${activeProviderLabel})`}
              </button>
            ) : (
              <Link
                href="/giris"
                className="w-full min-h-[44px] px-4 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs sm:text-sm font-bold flex items-center justify-center"
              >
                Plan Seçmek İçin Giriş Yapın
              </Link>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
