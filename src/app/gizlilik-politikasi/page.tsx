import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, Lock, Database, Eye, Trash2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Gizlilik Politikası ve KVKK Aydınlatma Metni',
  description:
    'Kamu Bildirim Sepeti gizlilik politikası, 6698 sayılı KVKK kapsamında işlenen kişisel veriler, güvenlik esasları ve veri silme hakları.',
  alternates: {
    canonical: '/gizlilik-politikasi',
  },
};

export default function GizlilikPolitikasiPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-[#0b0f14] dark:text-slate-100 font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-10">
        {/* Navigation Back */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Ana Sayfaya ve Arama Tezgahına Dön</span>
          </Link>
          <Link
            href="/ayarlar"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b91c1c] dark:text-[#ef4444] hover:underline min-h-[44px]"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Hesap ve Veri Silme Ayarları</span>
          </Link>
        </div>

        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 mb-6">
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-2">
            <ShieldCheck className="w-6 h-6" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">
              T.C. 6698 Sayılı KVKK Aydınlatma Metni
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Gizlilik Politikası ve Kişisel Verilerin Korunması
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 tabular-nums">
            Son Güncelleme Tarihi: 26 Kasım 2026
          </p>
        </div>

        {/* Policy Body */}
        <div className="space-y-6 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              1. Veri Sorumlusu ve Amaç
            </h2>
            <p>
              Kamu Bildirim Sepeti, kamu personel alımı, atama ve görevlendirme ilanlarını takip etmenizi, kayıtlı ilan listenizi yönetmenizi ve aday profilinize göre uygun ilanları filtrelemenizi sağlayan bir bilgilendirme platformudur. Kişisel verileriniz 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) uyarınca yalnızca hizmetin sunulması amacıyla işlenir.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              2. Toplanan ve İşlenen Kişisel Veriler
            </h2>
            <p className="mb-2">
              Hesap oluşturmanız ve profil eşleştirme özelliklerini kullanmanız hâlinde yalnızca aşağıdaki veriler işlenir:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-700 dark:text-slate-300">
              <li>
                <strong>Ad (İsteğe bağlı):</strong> Hesabınızda size hitap edilmesi ve arayüz kişiselleştirmesi için.
              </li>
              <li>
                <strong>E-posta adresi:</strong> Kimlik doğrulama, oturum yönetimi ve bildirim tercihleriniz doğrultusunda ilan hatırlatmaları için.
              </li>
              <li>
                <strong>Kullanıcı kimlikleri:</strong> Hesabınıza ait kayıtlı ilanlar ve bildirim tercihlerinin güvenli biçimde eşleştirilmesi için üretilen teknik kullanıcı kimliği.
              </li>
              <li>
                <strong>Telefon numarası (İsteğe bağlı):</strong> Yalnızca kullanıcı tarafından girilmesi hâlinde hesap iletişim bilgisi olarak saklanır.
              </li>
              <li>
                <strong>Profil bilgileri:</strong> Eğitim düzeyi, mezun olunan bölüm, KPSS puan türü ve puanı, ikamet ili, askerlik durumu, ehliyet sınıfları ve sertifika bilgileri (yalnızca &quot;Bana Uygun&quot; ilan eşleştirmesi amacıyla kullanılır).
              </li>
            </ul>
          </section>

          <section className="border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 space-y-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              3. Veri Güvenliği ve Üçüncü Taraflarla Paylaşım İlkeleri
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Üçüncü taraflarla veri paylaşımı yok:</strong> Kişisel verileriniz reklam ağlarına, veri simsarlarına veya üçüncü taraf pazarlama şirketlerine aktarılmaz ve satılmaz.
              </li>
              <li>
                <strong>Veriler aktarım sırasında şifreleniyor:</strong> Platform üzerindeki tüm bağlantılar HTTPS/TLS üzerinden şifreli olarak gerçekleştirilir; parolalar tek yönlü kriptografik özet (PBKDF2) ile saklanır.
              </li>
              <li>
                <strong>Verilerin silinmesini talep edebilirsiniz:</strong> Hesabınızı ve ilişkili tüm profil, kayıtlı ilan ve bildirim verilerinizi{' '}
                <Link href="/ayarlar" className="text-[#b91c1c] dark:text-[#ef4444] font-semibold underline">
                  Ayarlar
                </Link>{' '}
                sayfasından tek adımda kalıcı olarak silebilirsiniz.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              4. Çerez (Cookie) Kullanımı
            </h2>
            <p>
              Platformda oturum güvenliği (HttpOnly oturum çerezi), tema seçimi ve çerez onay tercihinizi hatırlamak amacıyla zorunlu teknik çerezler kullanılır. Reklam hedeflemesi amacıyla üçüncü taraf çerezleri kullanılmaz.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">
              5. 6698 Sayılı KVKK Kapsamındaki Haklarınız
            </h2>
            <p>
              KVKK&apos;nın 11. maddesi uyarınca kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, düzeltme isteme ve verilerinizin silinmesini talep etme hakkına sahipsiniz. Hesap silme işlemini doğrudan{' '}
              <Link href="/ayarlar" className="text-[#b91c1c] dark:text-[#ef4444] font-semibold underline">
                Hesap ve Veri Ayarları
              </Link>{' '}
              ekranından gerçekleştirebilirsiniz.
            </p>
          </section>
        </div>

        {/* Footer Note */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Kamu Bildirim Sepeti: KVKK Uyumlu Kamu İlan Takip Platformu</span>
          <Link href="/kullanim-kosullari" className="text-[#b91c1c] dark:text-[#ef4444] font-semibold hover:underline">
            Kullanım Koşullarını İnceleyin →
          </Link>
        </div>
      </div>
    </div>
  );
}
