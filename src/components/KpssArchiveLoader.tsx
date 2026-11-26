'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const KpssArchiveClient = dynamic(() => import('@/components/KpssArchiveClient'), {
  ssr: false,
  loading: () => (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
      <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 p-6 space-y-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          KPSS Merkezi Yerleştirme Arşivi
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          9.703 yerleştirme kaydı ve nitelik kodu arama motoru hazırlanıyor...
        </p>
      </div>
    </div>
  ),
});

/** Loads the interactive 9,703-record KPSS archive strictly in the browser to stay within Worker CPU limits. */
export default function KpssArchiveLoader() {
  return <KpssArchiveClient />;
}
