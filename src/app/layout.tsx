import type { Metadata, Viewport } from 'next';
import './globals.css';
import SeoStructuredData from '@/components/SeoStructuredData';
import CookieBanner from '@/components/CookieBanner';
import ThemeProvider from '@/components/ThemeProvider';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kpssportal.pages.dev';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#b91c1c',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Kamu Bildirim Sepeti | Kamu Atama, Personel Alımı ve KPSS Arşivi',
    template: '%s | Kamu Bildirim Sepeti',
  },
  description:
    'Kariyer Kapısı, İŞKUR ve Resmî Gazete kamu personel alımı, atama ve görevlendirme ilanlarını takip edin; profilinize uygun kadroları filtreleyin ve 2024-2026 KPSS taban puanlarını inceleyin.',
  keywords: [
    'Kamu Bildirim Sepeti',
    'Kamu Personel Alımı',
    'Kariyer Kapısı İlanları',
    'İŞKUR Kamu İlanları',
    'Resmî Gazete Personel Alımı',
    'KPSS Atama',
    'KPSS Taban Puanları',
    'Nitelik Kodu',
    'KPSSP3',
    'KPSSP93',
    'KPSSP94',
  ],
  authors: [{ name: 'Kamu Bildirim Sepeti' }],
  creator: 'Kamu Bildirim Sepeti',
  publisher: 'Kamu Bildirim Sepeti',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Kamu Bildirim Sepeti | Resmî Kamu İlanları ve KPSS Atama Takibi',
    description:
      'Kariyer Kapısı, İŞKUR ve Resmî Gazete ilanlarını tek noktadan inceleyin, profilinizle eşleştirin ve KPSS merkezi yerleştirme arşivine erişin.',
    url: siteUrl,
    siteName: 'Kamu Bildirim Sepeti',
    locale: 'tr_TR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kamu Bildirim Sepeti | Resmî Kamu İlanları ve KPSS Atama Takibi',
    description:
      'Kamu atama, personel alımı ve görevlendirme ilanları ile KPSS taban puan analiz arşivi.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="light" style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <head>
        <SeoStructuredData />
      </head>
      <body className="min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-[#0b0f14] dark:text-slate-100 antialiased font-sans">
        <ThemeProvider>
          {children}
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
