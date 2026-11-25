'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { User, CheckCircle2, AlertCircle, Lock, RefreshCw } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { DEPARTMENTS } from '@/data/departments';
import type { MilitaryStatus } from '@/modules/announcements/types';
import type { EducationLevel, KpssScoreType } from '@/modules/db/types';

const DRIVER_LICENSE_OPTIONS = ['B', 'A2', 'A', 'C', 'D', 'E'];
const COMMON_CERTIFICATES = ['6225', 'YDS-A', 'YDS-B', 'YDS-C', 'YDS-D'];

const TURKISH_CITIES = [
  'ADANA', 'ADIYAMAN', 'AFYONKARAHİSAR', 'AĞRI', 'AKSARAY', 'AMASYA', 'ANKARA', 'ANTALYA',
  'ARDAHAN', 'ARTVİN', 'AYDIN', 'BALIKESİR', 'BARTIN', 'BATMAN', 'BAYBURT', 'BİLECİK',
  'BİNGÖL', 'BİTLİS', 'BOLU', 'BURDUR', 'BURSA', 'ÇANAKKALE', 'ÇANKIRI', 'ÇORUM',
  'DENİZLİ', 'DİYARBAKIR', 'DÜZCE', 'EDİRNE', 'ELAZIĞ', 'ERZİNCAN', 'ERZURUM', 'ESKİŞEHİR',
  'GAZİANTEP', 'GİRESUN', 'GÜMÜŞHANE', 'HAKKARİ', 'HATAY', 'IĞDIR', 'ISPARTA', 'İSTANBUL',
  'İZMİR', 'KAHRAMANMARAŞ', 'KARABÜK', 'KARAMAN', 'KARS', 'KASTAMONU', 'KAYSERİ', 'KIRIKKALE',
  'KIRKLARELİ', 'KIRŞEHİR', 'KİLİS', 'KOCAELİ', 'KONYA', 'KÜTAHYA', 'MALATYA', 'MANİSA',
  'MARDİN', 'MERSİN', 'MUĞLA', 'MUŞ', 'NEVŞEHİR', 'NİĞDE', 'ORDU', 'OSMANİYE',
  'RİZE', 'SAKARYA', 'SAMSUN', 'SİİRT', 'SİNOP', 'SİVAS', 'ŞANLIURFA', 'ŞIRNAK',
  'TEKİRDAĞ', 'TOKAT', 'TRABZON', 'TUNCELİ', 'UŞAK', 'VAN', 'YALOVA', 'YOZGAT', 'ZONGULDAK',
];

export default function ProfilPage() {
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [educationLevel, setEducationLevel] = useState<EducationLevel | ''>('');
  const [departmentId, setDepartmentId] = useState('');
  const [kpssScoreType, setKpssScoreType] = useState<KpssScoreType | ''>('');
  const [kpssScore, setKpssScore] = useState('');
  const [residenceCity, setResidenceCity] = useState('');
  const [militaryStatus, setMilitaryStatus] = useState<MilitaryStatus | ''>('');
  const [driverLicenses, setDriverLicenses] = useState<string[]>([]);
  const [certificates, setCertificates] = useState<string[]>([]);
  const [customCertificates, setCustomCertificates] = useState('');
  const [qualificationCodesText, setQualificationCodesText] = useState('');

  const applyProfileData = useCallback(
    (data: {
      user?: { fullName?: string | null; phone?: string | null };
      profile?: {
        educationLevel?: EducationLevel | null;
        departmentId?: string | null;
        kpssScoreType?: KpssScoreType | null;
        kpssScore?: number | null;
        residenceCity?: string | null;
        militaryStatus?: MilitaryStatus | null;
        driverLicenses?: string[];
        certificates?: string[];
        qualificationCodes?: string[];
      };
    }) => {
      setFullName(data.user?.fullName ?? '');
      setPhone(data.user?.phone ?? '');
      const p = data.profile;
      if (p) {
        setEducationLevel(p.educationLevel ?? '');
        setDepartmentId(p.departmentId ?? '');
        setKpssScoreType(p.kpssScoreType ?? '');
        setKpssScore(p.kpssScore !== null && p.kpssScore !== undefined ? String(p.kpssScore) : '');
        setResidenceCity(p.residenceCity ?? '');
        setMilitaryStatus(p.militaryStatus ?? '');
        setDriverLicenses(p.driverLicenses ?? []);
        const knownCerts = (p.certificates ?? []).filter((c) => COMMON_CERTIFICATES.includes(c));
        const extraCerts = (p.certificates ?? []).filter((c) => !COMMON_CERTIFICATES.includes(c));
        setCertificates(knownCerts);
        setCustomCertificates(extraCerts.join(', '));
        setQualificationCodesText((p.qualificationCodes ?? []).join(', '));
      }
    },
    []
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthRequired(false);
    try {
      const res = await fetch('/api/profile', { cache: 'no-store' });
      if (res.status === 401) {
        setAuthRequired(true);
        return;
      }
      if (!res.ok) {
        setError('Profil bilgileri yüklenemedi.');
        return;
      }
      const data = (await res.json()) as Parameters<typeof applyProfileData>[0];
      applyProfileData(data);
    } catch {
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  }, [applyProfileData]);

  useEffect(() => {
    let active = true;
    fetch('/api/profile', { cache: 'no-store' })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) {
          setAuthRequired(true);
          return;
        }
        if (!res.ok) {
          setError('Profil bilgileri yüklenemedi.');
          return;
        }
        const data = (await res.json()) as Parameters<typeof applyProfileData>[0];
        applyProfileData(data);
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
  }, [applyProfileData]);

  const filteredDepartments = useMemo(() => {
    if (!educationLevel) return DEPARTMENTS;
    return DEPARTMENTS.filter((d) => d.ogrenimDuzeyi === educationLevel);
  }, [educationLevel]);

  const handleToggleLicense = (lic: string) => {
    setDriverLicenses((prev) =>
      prev.includes(lic) ? prev.filter((item) => item !== lic) : [...prev, lic]
    );
  };

  const handleToggleCertificate = (cert: string) => {
    setCertificates((prev) =>
      prev.includes(cert) ? prev.filter((item) => item !== cert) : [...prev, cert]
    );
  };

  const handleDepartmentChange = (nextDeptId: string) => {
    setDepartmentId(nextDeptId);
    const dept = DEPARTMENTS.find((d) => d.id === nextDeptId);
    if (dept) {
      if (!educationLevel) setEducationLevel(dept.ogrenimDuzeyi);
      if (!kpssScoreType) {
        setKpssScoreType(
          dept.ogrenimDuzeyi === 'lisans'
            ? 'P3'
            : dept.ogrenimDuzeyi === 'onlisans'
              ? 'P93'
              : 'P94'
        );
      }
      if (!qualificationCodesText.trim()) {
        const codes = [dept.nitelikKodu, dept.genelNitelikKodu, ...(dept.esdegerKodlar || [])];
        setQualificationCodesText(Array.from(new Set(codes)).join(', '));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    let parsedScore: number | null = null;
    if (kpssScore.trim() !== '') {
      parsedScore = Number(kpssScore.replace(',', '.'));
      if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
        setError('KPSS puanı 0 ile 100 arasında olmalıdır.');
        return;
      }
    }

    const combinedCerts = [
      ...certificates,
      ...customCertificates
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    ];
    const codes = qualificationCodesText
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim() || null,
          phone: phone.trim() || null,
          educationLevel: educationLevel || null,
          departmentId: departmentId || null,
          kpssScoreType: kpssScoreType || null,
          kpssScore: parsedScore,
          residenceCity: residenceCity || null,
          militaryStatus: militaryStatus || null,
          driverLicenses,
          certificates: Array.from(new Set(combinedCerts)),
          qualificationCodes: Array.from(new Set(codes)),
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Profil güncellenemedi.');
        return;
      }
      setSuccess('Aday profiliniz başarıyla kaydedildi.');
    } catch {
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-1">
            <User className="w-4 h-4" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">Aday Profili</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Eğitim, KPSS ve Nitelik Bilgilerim
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Bu bilgiler yalnızca &quot;Bana Uygun&quot; ilan eşleştirmesi için kullanılır ve üçüncü taraflarla paylaşılmaz.
          </p>
        </div>

        {loading && (
          <div
            role="status"
            className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center text-sm text-slate-600 dark:text-slate-400"
          >
            Profiliniz yükleniyor...
          </div>
        )}

        {!loading && authRequired && (
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-8 text-center space-y-3">
            <Lock className="w-7 h-7 text-[#b91c1c] dark:text-[#ef4444] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Profil Oluşturmak İçin Oturum Açın
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Öğrenim düzeyinizi ve KPSS bilgilerinizi kaydedip ilanlarla eşleştirmek için giriş yapın veya ücretsiz hesap oluşturun.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5 pt-2">
              <Link
                href="/giris"
                className="min-h-[44px] px-4 py-2 bg-[#b91c1c] dark:bg-[#dc2626] text-white text-xs font-bold inline-flex items-center"
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
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-5 sm:p-7 space-y-5"
          >
            {error && (
              <div
                role="alert"
                className="p-3 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 flex items-center justify-between gap-2"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {error}
                </span>
                <button
                  type="button"
                  onClick={loadProfile}
                  className="text-xs font-bold underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Yenile
                </button>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="prof-fullname"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Ad Soyad (İsteğe bağlı)
                </label>
                <input
                  id="prof-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="prof-phone"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Telefon Numarası (İsteğe bağlı)
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="prof-education"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Öğrenim Düzeyi
                </label>
                <select
                  id="prof-education"
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value as EducationLevel | '')}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Seçiniz</option>
                  <option value="lisans">Lisans</option>
                  <option value="onlisans">Ön Lisans</option>
                  <option value="ortaogretim">Ortaöğretim (Lise)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="prof-department"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Mezun Olunan Bölüm
                </label>
                <select
                  id="prof-department"
                  value={departmentId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Bölüm Seçiniz</option>
                  {filteredDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.ad} ({d.nitelikKodu})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="prof-kpss-type"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  KPSS Puan Türü
                </label>
                <select
                  id="prof-kpss-type"
                  value={kpssScoreType}
                  onChange={(e) => setKpssScoreType(e.target.value as KpssScoreType | '')}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Seçiniz</option>
                  <option value="P3">KPSSP3 (Lisans)</option>
                  <option value="P93">KPSSP93 (Ön Lisans)</option>
                  <option value="P94">KPSSP94 (Ortaöğretim)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="prof-kpss-score"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  KPSS Puanı (0 - 100)
                </label>
                <input
                  id="prof-kpss-score"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={kpssScore}
                  onChange={(e) => setKpssScore(e.target.value)}
                  placeholder="Örn. 84.50"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="prof-city"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  İkamet İli
                </label>
                <select
                  id="prof-city"
                  value={residenceCity}
                  onChange={(e) => setResidenceCity(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="">İl Seçiniz</option>
                  {TURKISH_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="prof-military"
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
                >
                  Askerlik Durumu
                </label>
                <select
                  id="prof-military"
                  value={militaryStatus}
                  onChange={(e) => setMilitaryStatus(e.target.value as MilitaryStatus | '')}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Seçiniz</option>
                  <option value="yapildi">Yapıldı</option>
                  <option value="muaf">Muaf</option>
                  <option value="tecilli">Tecilli</option>
                  <option value="ilgisiz">Muaf / İlgisiz</option>
                </select>
              </div>
            </div>

            {/* Driver Licenses */}
            <div>
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Sürücü Belgesi (Ehliyet)
              </span>
              <div className="flex flex-wrap gap-2">
                {DRIVER_LICENSE_OPTIONS.map((lic) => (
                  <label
                    key={lic}
                    className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={driverLicenses.includes(lic)}
                      onChange={() => handleToggleLicense(lic)}
                      className="w-4 h-4 accent-[#b91c1c]"
                    />
                    <span>{lic} Sınıfı</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Certificates */}
            <div className="space-y-3">
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Sertifika ve Dil Belgeleri
              </span>
              <div className="flex flex-wrap gap-2">
                {COMMON_CERTIFICATES.map((cert) => (
                  <label
                    key={cert}
                    className="min-h-[44px] px-3 py-2 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={certificates.includes(cert)}
                      onChange={() => handleToggleCertificate(cert)}
                      className="w-4 h-4 accent-[#b91c1c]"
                    />
                    <span>{cert}</span>
                  </label>
                ))}
              </div>
              <div>
                <label
                  htmlFor="prof-extra-certs"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Diğer Sertifikalar (Virgülle ayırınız)
                </label>
                <input
                  id="prof-extra-certs"
                  type="text"
                  value={customCertificates}
                  onChange={(e) => setCustomCertificates(e.target.value)}
                  placeholder="Örn. 7225, SRC2, İş Güvenliği C"
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="prof-qual-codes"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
              >
                Nitelik Kodlarınız (Virgülle ayırınız)
              </label>
              <input
                id="prof-qual-codes"
                type="text"
                value={qualificationCodesText}
                onChange={(e) => setQualificationCodesText(e.target.value)}
                placeholder="Örn. 4531, 4001"
                className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 tabular-nums"
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-6 py-2.5 bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
              >
                {saving ? 'Kaydediliyor...' : 'Profili Kaydet'}
              </button>
              <Link
                href="/"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:underline py-2"
              >
                İlan Akışına Dön →
              </Link>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
