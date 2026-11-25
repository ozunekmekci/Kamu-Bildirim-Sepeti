import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, ArrowLeft, Scale, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Kullanım Koşulları ve Hukuki Uyarı',
  description:
    'Kamu Bildirim Sepeti kullanım koşulları, resmî kaynak bağlantıları, yasal sorumluluk sınırları ve hizmet esasları.',
  alternates: {
    canonical: '/kullanim-kosullari',
  },
};

export default function KullanimKosullariPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-[#0b0f14] dark:text-slate-100 font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-10">
        {/* Navigation Back */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Ana Sayfaya ve İlan Akışına Dön</span>
          </Link>
        </div>

        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 mb-6">
          <div className="flex items-center gap-2 text-[#b91c1c] dark:text-[#ef4444] mb-2">
            <FileText className="w-6 h-6" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Hukuki Bildirim ve Hizmet Şartları
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Kullanım Koşulları ve Sorumluluk Reddi Beyanı
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 tabular-nums">
            Son Güncelleme Tarihi: 26 Kasım 2026
          </p>
        </div>

        {/* Terms Body */}
        <div className="space-y-6 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <section className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-4 text-amber-950 dark:text-amber-100 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="block font-bold mb-1">Resmi Hukuki Dayanak Uyarısı:</strong>
              <p>
                Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              1. Resmî Bilgi Kaynakları ve Doğruluk
            </h2>
            <p className="mb-3">
              Kamu Bildirim Sepeti üzerindeki ilanlar aşağıdaki resmî kamu kaynaklarından derlenen bilgilere dayanır. Başvuru öncesinde ilgili kurumun resmî duyuru sayfasını kontrol etmeniz zorunludur:
            </p>
            <ul className="space-y-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
              <li>
                <a
                  href="https://kariyerkapisi.gov.tr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#b91c1c] dark:text-[#ef4444] hover:underline"
                >
                  <span>Kariyer Kapısı Kamu İşe Alım Platformu (kariyerkapisi.gov.tr)</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.iskur.gov.tr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#b91c1c] dark:text-[#ef4444] hover:underline"
                >
                  <span>Türkiye İş Kurumu (iskur.gov.tr)</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.resmigazete.gov.tr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#b91c1c] dark:text-[#ef4444] hover:underline"
                >
                  <span>T.C. Resmî Gazete (resmigazete.gov.tr)</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
              2. Hizmetin Niteliği ve Plan Yapısı
            </h2>
            <p>
              Kamu Bildirim Sepeti üzerindeki temel ilan akışı ve KPSS merkezi yerleştirme arşivi kamu yararı gözetilerek adayların hizmetine <strong>tamamen ücretsiz</strong> olarak sunulmuştur. Profil tabanlı gelişmiş eşleştirme, sınırsız ilan takibi ve anlık hatırlatıcılar isteğe bağlı Premium plan kapsamında sağlanır.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">
              3. Adil Kullanım ve Sistem Güvenliği
            </h2>
            <p>
              Kullanıcılar, platformun olağan işleyişini sekteye uğratacak otomatik veri çekme veya sistem bütünlüğünü zorlayan isteklerde bulunamaz. Hesap güvenliği ve adil kullanım için sunucu tarafında erişim kontrolleri uygulanır.
            </p>
          </section>
        </div>

        {/* Footer Note */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Kamu Bildirim Sepeti: Resmî Kamu İlan Takip Platformu</span>
          <Link href="/gizlilik-politikasi" className="text-[#b91c1c] dark:text-[#ef4444] font-semibold hover:underline">
            Gizlilik Politikasını İnceleyin →
          </Link>
        </div>
      </div>
    </div>
  );
}
