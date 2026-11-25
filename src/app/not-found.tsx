import React from 'react';
import Link from 'next/link';
import { FileQuestion, ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-[#0b0f14] dark:text-slate-100 font-sans flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 sm:p-8 text-center">
        {/* Institutional Icon */}
        <div className="w-14 h-14 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 mx-auto flex items-center justify-center text-[#b91c1c] dark:text-[#ef4444] mb-4">
          <FileQuestion className="w-7 h-7" aria-hidden="true" />
        </div>

        {/* Status Code & Title */}
        <span className="inline-block px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold uppercase tracking-wider mb-2 tabular-nums">
          Hata 404: Sayfa Bulunamadı
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-2">
          Aradığınız Kayıt veya Sayfa Mevcut Değil
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
          Ulaşmaya çalıştığınız sayfa kaldırılmış, bağlantı adresi değişmiş ya da geçersiz bir parametre girilmiş olabilir.
        </p>

        {/* Primary Action CTA */}
        <div className="space-y-2.5">
          <Link
            href="/"
            className="w-full min-h-[44px] bg-[#b91c1c] hover:bg-[#991b1b] dark:bg-[#dc2626] dark:hover:bg-[#b91c1c] text-white font-bold py-2.5 px-4 text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Ana Sayfaya ve Arama Tezgahına Dön</span>
          </Link>

          <Link
            href="/kpss-arsivi#results-section"
            className="w-full min-h-[44px] bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold py-2 px-4 text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>KPSS Kadro ve Taban Puan Arşivini Aç</span>
          </Link>
        </div>

        {/* Quick Reference Links */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-left">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">
            Hızlı Bağlantılar:
          </span>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link
              href="/gizlilik-politikasi"
              className="text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline py-1"
            >
              Gizlilik Politikası
            </Link>
            <span className="text-slate-400 dark:text-slate-600 py-1">•</span>
            <Link
              href="/kullanim-kosullari"
              className="text-slate-700 dark:text-slate-300 hover:text-[#b91c1c] dark:hover:text-[#ef4444] underline py-1"
            >
              Kullanım Koşulları
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
