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
  Smartphone,
  Bookmark,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import { useTheme } from '@/components/ThemeProvider';
import type { SourceCheckpoint } from '@/modules/announcements/types';
import type { SavedSearchRecord } from '@/modules/db/types';

interface PushSubscriptionItem {
  id: string;
  endpoint: string;
  userAgent?: string | null;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  kariyer_kapisi: 'Kariyer Kapısı',
  sbb: 'SBB Kamu İlan',
  iskur: 'İŞKUR',
  resmi_gazete: 'Resmî Gazete',
  osym_kpss: 'ÖSYM KPSS',
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

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

interface HealthReadinessResponse {
  status?: string;
  database?: {
    mode?: string;
    announcementsCount?: number;
  };
  providers?: {
    email?: string;
    payment?: string;
    configuredPayments?: string[];
    pushConfigured?: boolean;
    cronSecretConfigured?: boolean;
    sessionSecretConfigured?: boolean;
  };
}

interface ReadinessChip {
  label: string;
  value: string;
  tone: 'ready' | 'demo' | 'unconfigured';
}

function buildReadinessChips(health: HealthReadinessResponse | null): ReadinessChip[] {
  if (!health) {
    return [
      { label: 'Veritabanı', value: 'Durum Alınamadı', tone: 'unconfigured' },
      { label: 'E-posta', value: 'Durum Alınamadı', tone: 'unconfigured' },
      { label: 'Ödeme', value: 'Durum Alınamadı', tone: 'unconfigured' },
      { label: 'Web Push', value: 'Durum Alınamadı', tone: 'unconfigured' },
    ];
  }

  const dbMode = health.database?.mode?.trim().toLowerCase() ?? '';
  let dbChip: ReadinessChip;
  if (dbMode === 'd1') {
    dbChip = { label: 'Veritabanı', value: 'Hazır (D1)', tone: 'ready' };
  } else if (dbMode === 'd1_or_memory') {
    dbChip = { label: 'Veritabanı', value: 'Hazır (D1 / Bellek)', tone: 'ready' };
  } else if (dbMode === 'memory') {
    dbChip = { label: 'Veritabanı', value: 'Demo Modu (Bellek)', tone: 'demo' };
  } else if (dbMode) {
    dbChip = { label: 'Veritabanı', value: `Hazır (${dbMode})`, tone: 'ready' };
  } else {
    dbChip = { label: 'Veritabanı', value: 'Yapılandırılmadı', tone: 'unconfigured' };
  }

  const emailProvider = health.providers?.email?.trim() ?? '';
  const emailNorm = emailProvider.toLowerCase();
  let emailChip: ReadinessChip;
  if (!emailNorm || emailNorm === 'noop' || emailNorm === 'no-op') {
    emailChip = { label: 'E-posta', value: 'Yapılandırılmadı', tone: 'unconfigured' };
  } else if (emailNorm === 'demo' || emailNorm === 'memory') {
    emailChip = { label: 'E-posta', value: 'Demo Modu', tone: 'demo' };
  } else {
    emailChip = { label: 'E-posta', value: `Hazır (${emailProvider})`, tone: 'ready' };
  }

  const paymentProvider = health.providers?.payment?.trim() ?? '';
  const paymentNorm = paymentProvider.toLowerCase();
  let paymentChip: ReadinessChip;
  if (!paymentNorm || paymentNorm === 'noop' || paymentNorm === 'no-op') {
    paymentChip = { label: 'Ödeme', value: 'Yapılandırılmadı', tone: 'unconfigured' };
  } else if (paymentNorm === 'demo') {
    paymentChip = { label: 'Ödeme', value: 'Demo Modu', tone: 'demo' };
  } else {
    paymentChip = { label: 'Ödeme', value: `Hazır (${paymentProvider})`, tone: 'ready' };
  }

  const pushReady = Boolean(health.providers?.pushConfigured);
  const pushChip: ReadinessChip = pushReady
    ? { label: 'Web Push', value: 'Hazır', tone: 'ready' }
    : { label: 'Web Push', value: 'Yapılandırılmadı', tone: 'unconfigured' };

  return [dbChip, emailChip, paymentChip, pushChip];
}

function getChipToneClasses(tone: ReadinessChip['tone']): string {
  if (tone === 'ready') {
    return 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200';
  }
  if (tone === 'demo') {
    return 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100';
  }
  return 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200';
}

function formatSyncStatusLabel(status: string): string {
  if (status === 'success') return 'Başarılı';
  if (status === 'partial') return 'Kısmi Başarı';
  if (status === 'error') return 'Hata';
  return status;
}

function formatSavedSearchFilters(search: SavedSearchRecord): string[] {
  const tags: string[] = [];
  const f = search.filters;
  if (f.q) tags.push(`Arama: ${f.q}`);
  if (f.city) tags.push(`Şehir: ${f.city}`);
  if (f.source) tags.push(`Kaynak: ${SOURCE_LABELS[f.source] ?? f.source}`);
  if (f.category) tags.push(`Kategori: ${f.category}`);
  if (f.employmentType) tags.push(`Kadro: ${f.employmentType}`);
  if (f.examType === 'kpss_only') tags.push('Mülakatsız (KPSS)');
  return tags;
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
  const [checkpoints, setCheckpoints] = useState<SourceCheckpoint[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthReadinessResponse | null>(null);

  const [savedSearches, setSavedSearches] = useState<SavedSearchRecord[]>([]);
  const [savedSearchBusyId, setSavedSearchBusyId] = useState<string | null>(null);
  const [savedSearchMsg, setSavedSearchMsg] = useState<string | null>(null);
  const [savedSearchError, setSavedSearchError] = useState<string | null>(null);

  const [pushSupported, setPushSupported] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [pushSubscriptions, setPushSubscriptions] = useState<PushSubscriptionItem[]>([]);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

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
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window;

    Promise.all([
      fetch('/api/auth/me', { cache: 'no-store' }),
      fetch('/api/sync/status', { cache: 'no-store' }),
      fetch('/api/push/vapid-key', { cache: 'no-store' }).catch(() => null),
      fetch('/api/health', { cache: 'no-store' }).catch(() => null),
    ])
      .then(async ([meRes, syncRes, vapidRes, healthRes]) => {
        if (!active) return;
        setPushSupported(supported);

        let meData: {
          authenticated?: boolean;
          user?: { email?: string; emailVerifiedAt?: string | null } | null;
        } | null = null;
        if (meRes.ok) {
          meData = (await meRes.json()) as {
            authenticated?: boolean;
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
            checkpoints?: SourceCheckpoint[];
          };
          setLastSyncRun(syncData.lastRun ?? null);
          setCheckpoints(
            Array.isArray(syncData.checkpoints) ? syncData.checkpoints : []
          );
        }
        if (vapidRes && vapidRes.ok) {
          const vapidData = (await vapidRes.json()) as {
            configured?: boolean;
            publicKey?: string | null;
          };
          setVapidConfigured(Boolean(vapidData.configured && vapidData.publicKey));
          setVapidPublicKey(vapidData.publicKey ?? null);
        }
        if (healthRes && healthRes.ok) {
          try {
            const healthData = (await healthRes.json()) as HealthReadinessResponse;
            if (healthData && (healthData.database || healthData.providers)) {
              setHealthStatus(healthData);
            }
          } catch {
            // Ignore malformed /api/health payload
          }
        }

        if (meData && meData.authenticated === false) {
          setAuthRequired(true);
          return;
        }

        const [prefsRes, billingRes, pushSubRes, savedSearchRes] = await Promise.all([
          fetch('/api/notifications/preferences', { cache: 'no-store' }),
          fetch('/api/billing', { cache: 'no-store' }),
          fetch('/api/push/subscriptions', { cache: 'no-store' }).catch(() => null),
          fetch('/api/saved-searches', { cache: 'no-store' }).catch(() => null),
        ]);
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
        if (pushSubRes && pushSubRes.ok) {
          const subData = (await pushSubRes.json()) as {
            subscriptions?: PushSubscriptionItem[];
          };
          setPushSubscriptions(Array.isArray(subData.subscriptions) ? subData.subscriptions : []);
        }
        if (savedSearchRes && savedSearchRes.ok) {
          const ssData = (await savedSearchRes.json()) as {
            searches?: SavedSearchRecord[];
            items?: SavedSearchRecord[];
          };
          const list = ssData.searches ?? ssData.items;
          setSavedSearches(Array.isArray(list) ? list : []);
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

  const handleDeleteSavedSearch = async (searchId: string) => {
    setSavedSearchError(null);
    setSavedSearchMsg(null);
    setSavedSearchBusyId(searchId);
    try {
      const res = await fetch(`/api/saved-searches?id=${encodeURIComponent(searchId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSavedSearchError(data.error || 'Kayıtlı arama silinemedi.');
        return;
      }
      setSavedSearches((prev) => prev.filter((item) => item.id !== searchId));
      setSavedSearchMsg('Kayıtlı arama alarmı silindi.');
    } catch {
      setSavedSearchError('Sunucuya bağlanılamadı.');
    } finally {
      setSavedSearchBusyId(null);
    }
  };

  const handleEnablePush = async () => {
    setPushError(null);
    setPushMessage(null);

    if (!pushSupported) {
      setPushError('Tarayıcınız Web Push bildirimlerini desteklemiyor.');
      return;
    }
    if (!vapidConfigured || !vapidPublicKey) {
      setPushError('Sunucu VAPID anahtarı henüz tanımlanmadı.');
      return;
    }

    setPushBusy(true);
    try {
      if ('Notification' in window && typeof Notification.requestPermission === 'function') {
        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
          setPushError('Tarayıcı bildirim izni reddedildi. Tarayıcı ayarlarından izin verebilirsiniz.');
          return;
        }
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      const readyReg = navigator.serviceWorker.ready
        ? await navigator.serviceWorker.ready
        : reg;

      let subscription = await readyReg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });
      }

      const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : {};
      const endpoint = subscription.endpoint || json.endpoint || '';
      const p256dh =
        json.keys?.p256dh ||
        arrayBufferToBase64Url(
          typeof subscription.getKey === 'function' ? subscription.getKey('p256dh') : null
        );
      const auth =
        json.keys?.auth ||
        arrayBufferToBase64Url(
          typeof subscription.getKey === 'function' ? subscription.getKey('auth') : null
        );

      if (!endpoint || !p256dh || !auth) {
        setPushError('Tarayıcı abonelik anahtarları oluşturulamadı.');
        return;
      }

      const res = await fetch('/api/push/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          keys: { p256dh, auth },
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      });
      const data = (await res.json()) as {
        subscription?: PushSubscriptionItem;
        error?: string;
      };
      if (!res.ok) {
        setPushError(data.error || 'Tarayıcı bildirimi kaydedilemedi.');
        return;
      }

      if (data.subscription) {
        setPushSubscriptions((prev) => {
          const rest = prev.filter((item) => item.endpoint !== data.subscription!.endpoint);
          return [data.subscription!, ...rest];
        });
      }
      setPushMessage('Tarayıcı anlık bildirimleri etkinleştirildi.');
    } catch {
      setPushError('Tarayıcı bildirim aboneliği başlatılırken hata oluştu.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async (endpoint: string) => {
    setPushError(null);
    setPushMessage(null);
    setPushBusy(true);
    try {
      const res = await fetch('/api/push/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setPushError(data.error || 'Abonelik kaldırılamadı.');
        return;
      }

      if (pushSupported && typeof navigator.serviceWorker.getRegistration === 'function') {
        try {
          const reg = await navigator.serviceWorker.getRegistration('/sw.js');
          const sub = await reg?.pushManager?.getSubscription();
          if (sub && sub.endpoint === endpoint) {
            await sub.unsubscribe();
          }
        } catch {
          // Local SW unsubscribe is best-effort
        }
      }

      setPushSubscriptions((prev) => prev.filter((item) => item.endpoint !== endpoint));
      setPushMessage('Tarayıcı anlık bildirim aboneliği kaldırıldı.');
    } catch {
      setPushError('Sunucuya bağlanılamadı.');
    } finally {
      setPushBusy(false);
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
            <span className="text-xs font-semibold">Hesap ve Sistem Ayarları</span>
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
              Son başvuru hatırlatıcılarını, kayıtlı arama alarmlarınızı yönetmek ve hesap verilerinizi düzenlemek için oturum açmanız gerekir.
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

            {/* Saved Search Alarms */}
            <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Kayıtlı Arama Alarmlarım
                  </h2>
                </div>
                <span className="text-xs font-bold px-2.5 py-0.5 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 tabular-nums">
                  {savedSearches.length} Alarm
                </span>
              </div>

              {savedSearchError && (
                <div
                  role="alert"
                  className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{savedSearchError}</span>
                </div>
              )}

              {savedSearchMsg && (
                <div
                  role="status"
                  className="p-3 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{savedSearchMsg}</span>
                </div>
              )}

              {savedSearches.length === 0 ? (
                <div className="p-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-3">
                  <span>
                    Henüz kayıtlı arama alarmınız bulunmuyor. İlan Akışı sayfasındaki &quot;Bu Aramayı Alarm Yap&quot; butonu ile oluşturabilirsiniz.
                  </span>
                  <Link href="/" className="font-bold text-[#b91c1c] dark:text-[#ef4444] underline">
                    İlan Akışına Git
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {savedSearches.map((search) => {
                    const tags = formatSavedSearchFilters(search);
                    return (
                      <li
                        key={search.id}
                        className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {search.name}
                          </div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-300"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                            {search.notifyEmail && <span>E-posta Açık</span>}
                            {search.notifyPush && <span>Web Push Açık</span>}
                            <span>
                              Kayıt: {new Date(search.createdAt).toLocaleDateString('tr-TR')}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={savedSearchBusyId === search.id}
                          onClick={() => handleDeleteSavedSearch(search.id)}
                          aria-label={`${search.name} alarmını sil`}
                          className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Sil</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
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

            {/* Browser Web Push Notifications */}
            <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#b91c1c] dark:text-[#ef4444]" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Tarayıcı Anlık Bildirimleri (Web Push)
                  </h2>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 border tabular-nums ${
                    pushSubscriptions.length > 0
                      ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {pushSubscriptions.length > 0
                    ? `Aktif (${pushSubscriptions.length} Cihaz)`
                    : 'Kapalı'}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Yeni resmî ilanlar ve yaklaşan son başvuru tarihleri için tarayıcınız üzerinden anlık bildirim alabilirsiniz.
              </p>

              {pushError && (
                <div
                  role="alert"
                  className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{pushError}</span>
                </div>
              )}

              {pushMessage && (
                <div
                  role="status"
                  className="p-3 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{pushMessage}</span>
                </div>
              )}

              {!pushSupported ? (
                <div className="p-3 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300">
                  Mevcut tarayıcı ortamınız Service Worker veya PushManager API desteğine sahip değil.
                </div>
              ) : !vapidConfigured || !vapidPublicKey ? (
                <div
                  role="status"
                  className="p-3 border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-950 dark:text-amber-100"
                >
                  Sunucu VAPID anahtarı henüz tanımlanmadı. Ortam değişkenleri yapılandırıldığında tarayıcı bildirimleri buradan etkinleştirilebilir.
                </div>
              ) : (
                <div className="space-y-3">
                  {pushSubscriptions.length > 0 && (
                    <ul className="space-y-2">
                      {pushSubscriptions.map((sub) => (
                        <li
                          key={sub.id || sub.endpoint}
                          className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {sub.endpoint}
                            </div>
                            <div className="text-slate-600 dark:text-slate-400 tabular-nums">
                              Kayıt: {new Date(sub.createdAt).toLocaleString('tr-TR')}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={pushBusy}
                            onClick={() => handleDisablePush(sub.endpoint)}
                            className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold cursor-pointer disabled:opacity-60"
                          >
                            Aboneliği Kapat
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={pushBusy}
                      onClick={handleEnablePush}
                      className="min-h-[44px] px-5 py-2 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-xs sm:text-sm font-bold cursor-pointer"
                    >
                      {pushBusy
                        ? 'İşleniyor...'
                        : pushSubscriptions.length > 0
                          ? 'Bu Cihazı Yeniden Eşitle'
                          : 'Tarayıcı Bildirimlerini Etkinleştir'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Official Source Sync Status */}
            <section className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-6 space-y-4">
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

              {checkpoints.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Kaynak Bazlı Tazelik Kontrolleri
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs tabular-nums">
                    {checkpoints.map((cp) => (
                      <div
                        key={cp.source}
                        className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {SOURCE_LABELS[cp.source] ?? cp.source}
                          </div>
                          <div className="text-slate-600 dark:text-slate-400">
                            Son kontrol: {new Date(cp.lastCheckedAt).toLocaleString('tr-TR')}
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {cp.activeCount} aktif ilan
                          </div>
                          <span
                            className={`inline-block px-2 py-0.5 border font-semibold ${
                              cp.lastError
                                ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                                : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                            }`}
                          >
                            {cp.lastError ? 'Uyarı' : 'Güncel'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Sistem Altyapı Hazırlığı
                  </h3>
                  {!healthStatus && (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Altyapı durumu şu anda alınamadı
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs tabular-nums">
                  {buildReadinessChips(healthStatus).map((chip) => (
                    <div
                      key={chip.label}
                      className={`border px-2.5 py-1.5 font-semibold ${getChipToneClasses(chip.tone)}`}
                    >
                      {chip.label}: {chip.value}
                    </div>
                  ))}
                </div>
              </div>
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
