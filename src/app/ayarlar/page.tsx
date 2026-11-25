'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Bell,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sun,
  Moon,
  MailCheck,
  RefreshCw,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useTheme } from '@/components/ThemeProvider';

interface SyncRunSummary {
  id: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  syncedCount: number;
  remindersSent: number;
  newAlertsSent: number;
}

function formatSyncStatusLabel(status: string): string {
  if (status === 'success') return 'Başarılı';
  if (status === 'partial') return 'Kısmi Başarı';
  if (status === 'error') return 'Hata';
  return status;
}

export default function AyarlarPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationPreviewToken, setVerificationPreviewToken] = useState<string | null>(null);

  const [lastSyncRun, setLastSyncRun] = useState<SyncRunSummary | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [instantNewAnnouncements, setInstantNewAnnouncements] = useState(false);
  const [deadlineRemindersEnabled, setDeadlineRemindersEnabled] = useState(true);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(3);
  const [onlyMatchingProfile, setOnlyMatchingProfile] = useState(true);

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/notifications/preferences', { cache: 'no-store' }),
      fetch('/api/billing', { cache: 'no-store' }),
      fetch('/api/auth/me', { cache: 'no-store' }),
      fetch('/api/sync/status', { cache: 'no-store' }),
    ])
      .then(async ([prefsRes, billingRes, meRes, syncRes]) => {
        if (!active) return;
        if (prefsRes.status === 401) {
          setAuthRequired(true);
          return;
        }
        if (!prefsRes.ok) {
          setError('Bildirim tercihleri yüklenemedi.');
          return;
        }
        const prefsData = (await prefsRes.json()) as {
          preferences?: {
            emailEnabled: boolean;
            instantNewAnnouncements: boolean;
            deadlineRemindersEnabled: boolean;
            reminderDaysBefore: number;
            onlyMatchingProfile: boolean;
          };
        };
        if (prefsData.preferences) {
          setEmailEnabled(prefsData.preferences.emailEnabled);
          setInstantNewAnnouncements(prefsData.preferences.instantNewAnnouncements);
          setDeadlineRemindersEnabled(prefsData.preferences.deadlineRemindersEnabled);
          setReminderDaysBefore(prefsData.preferences.reminderDaysBefore);
          setOnlyMatchingProfile(prefsData.preferences.onlyMatchingProfile);
        }
        if (billingRes.ok) {
          const bData = (await billingRes.json()) as {
            entitlements?: { plan: 'free' | 'premium' };
          };
          if (bData.entitlements) {
            setPlan(bData.entitlements.plan);
          }
        }
        if (meRes.ok) {
          const meData = (await meRes.json()) as {
            user?: { email?: string; emailVerifiedAt?: string | null } | null;
          };
          if (meData.user) {
            setUserEmail(meData.user.email ?? null);
            setEmailVerifiedAt(meData.user.emailVerifiedAt ?? null);
          }
        }
        if (syncRes.ok) {
          const syncData = (await syncRes.json()) as {
            lastRun?: SyncRunSummary | null;
          };
          setLastSyncRun(syncData.lastRun ?? null);
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

  const handleResendVerification = async () => {
    setVerificationError(null);
    setVerificationMsg(null);
    setVerificationPreviewToken(null);
    setSendingVerification(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
      });
      const data = (await res.json()) as {
        sent?: boolean;
        alreadyVerified?: boolean;
        previewToken?: string;
        error?: string;
      };
      if (!res.ok) {
        setVerificationError(data.error || 'Doğrulama bağlantısı gönderilemedi.');
        return;
      }
      if (data.alreadyVerified) {
        setVerificationMsg('E-posta adresiniz zaten doğrulanmış.');
        return;
      }
      setVerificationMsg('Doğrulama bağlantısı e-posta adresinize gönderildi.');
      if (data.previewToken) {
        setVerificationPreviewToken(data.previewToken);
      }
    } catch {
      setVerificationError('Sunucuya bağlanılamadı.');
    } finally {
      setSendingVerification(false);
    }
  };

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!Number.isInteger(reminderDaysBefore) || reminderDaysBefore < 1 || reminderDaysBefore > 30) {
      setError('Hatırlatma günü 1 ile 30 arasında tam sayı olmalıdır.');
      return;
    }

    setSavingPrefs(true);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailEnabled,
          instantNewAnnouncements,
          deadlineRemindersEnabled,
          reminderDaysBefore,
          onlyMatchingProfile,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Tercihler kaydedilemedi.');
        return;
      }
      setSuccess('Bildirim tercihleriniz güncellendi.');
    } catch {
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    if (confirmText.trim() !== 'SIL') {
      setDeleteError('Kalıcı silme işlemini onaylamak için kutuya büyük harflerle SIL yazmalısınız.');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'SIL' }),
      });
      const data = (await res.json()) as { error?: string; deleted?: boolean };
      if (!res.ok) {
        setDeleteError(data.error || 'Hesap silme işlemi tamamlanamadı.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setDeleteError('Sunucuya bağlanılamadı.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-1">
            <Settings className="w-4 h-4" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">Hesap ve Sistem Ayarları</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Bildirim Tercihleri, Görünüm ve Veri Yönetimi
          </h1>
        </div>

        {/* Appearance / Theme Selection (available to everyone) */}
        <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Tema Tercihi
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Kamu Bildirim Sepeti arayüzünü açık veya koyu görünümde kullanabilirsiniz.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              className={`min-h-[44px] px-4 py-2 border text-xs font-bold inline-flex items-center gap-2 cursor-pointer ${
                theme === 'light'
                  ? 'border-[#b91c1c] bg-red-50 text-[#b91c1c]'
                  : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              <Sun className="w-4 h-4" aria-hidden="true" />
              <span>Açık Tema</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`min-h-[44px] px-4 py-2 border text-xs font-bold inline-flex items-center gap-2 cursor-pointer ${
                theme === 'dark'
                  ? 'border-[#ef4444] bg-red-950/60 text-red-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              <Moon className="w-4 h-4" aria-hidden="true" />
              <span>Koyu Tema</span>
            </button>
          </div>
        </section>

        {loading && (
          <div
            role="status"
            className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center text-sm text-slate-600 dark:text-slate-400"
          >
            Ayarlar yükleniyor...
          </div>
        )}

        {!loading && authRequired && (
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center space-y-3">
            <Lock className="w-7 h-7 text-[#b91c1c] dark:text-[#ef4444] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Bildirim ve Hesap Ayarları İçin Giriş Yapın
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Son başvuru hatırlatıcılarını yönetmek ve hesap verilerinizi düzenlemek için oturum açmanız gerekir.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5 pt-2">
              <Link
                href="/giris"
                className="min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white text-xs font-bold inline-flex items-center"
              >
                Giriş Yap
              </Link>
              <Link
                href="/kayit"
                className="min-h-[44px] px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center"
              >
                Ücretsiz Hesap Oluştur
              </Link>
            </div>
          </div>
        )}

        {!loading && !authRequired && (
          <>
            {/* Email Verification Status */}
            <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <MailCheck className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    E-posta Doğrulama Durumu
                  </h2>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 border tabular-nums ${
                    emailVerifiedAt
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                      : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  {emailVerifiedAt ? 'Doğrulandı' : 'Doğrulanmadı'}
                </span>
              </div>

              <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  {userEmail && (
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{userEmail}</p>
                  )}
                  {emailVerifiedAt ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      Doğrulama tarihi: {new Date(emailVerifiedAt).toLocaleString('tr-TR')}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Bildirimlerin kesintisiz ulaşması için e-posta adresinizi doğrulamanız önerilir.
                    </p>
                  )}
                </div>

                {!emailVerifiedAt && (
                  <button
                    type="button"
                    disabled={sendingVerification}
                    onClick={handleResendVerification}
                    className="min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors"
                  >
                    {sendingVerification ? 'Gönderiliyor...' : 'Doğrulama Bağlantısı Gönder'}
                  </button>
                )}
              </div>

              {verificationError && (
                <div
                  role="alert"
                  className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{verificationError}</span>
                </div>
              )}

              {verificationMsg && (
                <div
                  role="status"
                  className="p-3 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{verificationMsg}</span>
                  </div>
                  {verificationPreviewToken && (
                    <div>
                      <Link
                        href={`/eposta-dogrula?token=${encodeURIComponent(verificationPreviewToken)}`}
                        className="min-h-[44px] px-3 py-1.5 inline-flex items-center border border-emerald-700 dark:border-emerald-500 font-bold text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                      >
                        Geliştirme Test Bağlantısı
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Notification Preferences */}
            <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    E-posta Bildirim Tercihleri
                  </h2>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 border border-slate-300 dark:border-slate-700">
                  {plan === 'premium' ? 'Premium Plan' : 'Ücretsiz Plan'}
                </span>
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

              {plan === 'free' && (
                <div className="p-3 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Anlık yeni ilan ve son başvuru e-posta hatırlatıcıları Premium plan kapsamında aktif olarak gönderilir. Tercihlerinizi şimdiden kaydedebilirsiniz.
                  </span>
                  <Link href="/premium" className="font-bold text-[#b91c1c] dark:text-[#ef4444] underline">
                    Planları Gör
                  </Link>
                </div>
              )}

              <form onSubmit={handleSavePrefs} className="space-y-3">
                <label className="min-h-[44px] flex items-center gap-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#b91c1c]"
                  />
                  <span>E-posta bildirimleri etkinleştirilsin</span>
                </label>

                <label className="min-h-[44px] flex items-center gap-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={instantNewAnnouncements}
                    onChange={(e) => setInstantNewAnnouncements(e.target.checked)}
                    className="w-4 h-4 accent-[#b91c1c]"
                  />
                  <span>Yeni ilan yayımlandığında anlık bildirim gönder</span>
                </label>

                <label className="min-h-[44px] flex items-center gap-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deadlineRemindersEnabled}
                    onChange={(e) => setDeadlineRemindersEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#b91c1c]"
                  />
                  <span>Kayıtlı ilanların son başvuru tarihi yaklaştığında hatırlat</span>
                </label>

                <label className="min-h-[44px] flex items-center gap-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyMatchingProfile}
                    onChange={(e) => setOnlyMatchingProfile(e.target.checked)}
                    className="w-4 h-4 accent-[#b91c1c]"
                  />
                  <span>Yalnızca profilime uygun ilanlar için bildirim üret</span>
                </label>

                <div className="max-w-xs pt-1">
                  <label
                    htmlFor="pref-reminder-days"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1"
                  >
                    Son Başvurudan Kaç Gün Önce Hatırlatılsın? (1 - 30)
                  </label>
                  <input
                    id="pref-reminder-days"
                    type="number"
                    min={1}
                    max={30}
                    value={reminderDaysBefore}
                    onChange={(e) => setReminderDaysBefore(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 tabular-nums"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingPrefs}
                    className="min-h-[44px] px-5 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-xs sm:text-sm font-bold cursor-pointer"
                  >
                    {savingPrefs ? 'Kaydediliyor...' : 'Bildirim Tercihlerini Kaydet'}
                  </button>
                </div>
              </form>
            </section>

            {/* Official Source Sync Status */}
            <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Resmî Kaynak Senkronizasyon Durumu
                  </h2>
                </div>
                {lastSyncRun && (
                  <span className="text-xs font-bold px-2.5 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    {formatSyncStatusLabel(lastSyncRun.status)}
                  </span>
                )}
              </div>

              {!lastSyncRun ? (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Henüz canlı senkronizasyon çalıştırılmadı.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs tabular-nums">
                  <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
                    <div className="text-slate-600 dark:text-slate-400">Son Çalıştırma</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {new Date(lastSyncRun.finishedAt || lastSyncRun.startedAt).toLocaleString('tr-TR')}
                    </div>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
                    <div className="text-slate-600 dark:text-slate-400">Senkronize Edilen İlan</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {lastSyncRun.syncedCount} ilan
                    </div>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
                    <div className="text-slate-600 dark:text-slate-400">Durum / Hatırlatıcı</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {formatSyncStatusLabel(lastSyncRun.status)} ({lastSyncRun.remindersSent + lastSyncRun.newAlertsSent} bildirim)
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* KVKK & Account Deletion */}
            <section className="bg-white dark:bg-[#111827] border border-red-300 dark:border-red-900 p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444]">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <h2 className="text-base font-bold">
                  KVKK Veri Güvenliği ve Hesabı Kalıcı Silme
                </h2>
              </div>

              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 leading-relaxed">
                <p>
                  Kamu Bildirim Sepeti üzerinde saklanan veriler: Ad (İsteğe bağlı), E-posta adresi, Kullanıcı kimlikleri, Telefon numarası (İsteğe bağlı) ve Profil bilgileri. Üçüncü taraflarla veri paylaşımı yoktur; veriler aktarım sırasında şifrelenir.
                </p>
                <p>
                  6698 sayılı KVKK kapsamında verilerin silinmesini talep edebilirsiniz. Aşağıdaki onay kutusuna <strong>SIL</strong> yazarak hesabınızı, profilinizi, kayıtlı ilanlarınızı ve tüm bildirim tercihlerinizi tek seferde kalıcı olarak silebilirsiniz.
                </p>
              </div>

              {deleteError && (
                <div
                  role="alert"
                  className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{deleteError}</span>
                </div>
              )}

              <form onSubmit={handleDeleteAccount} className="space-y-3 max-w-md">
                <div>
                  <label
                    htmlFor="delete-confirm"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1"
                  >
                    Onay İçin &quot;SIL&quot; Yazınız
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="SIL"
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={deleting}
                  className="min-h-[44px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>{deleting ? 'Siliniyor...' : 'Hesabımı ve Tüm Verilerimi Kalıcı Olarak Sil'}</span>
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
