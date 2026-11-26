import { MetadataRoute } from 'next';
import { getCitySeoCatalog } from '@/modules/analytics';

const OFFICIAL_SOURCE_SLUGS = ['kariyer-kapisi', 'iskur', 'resmi-gazete'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kpssportal.pages.dev';
  const currentDate = new Date();
  const topCities = getCitySeoCatalog().slice(0, 15);

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/kpss-arsivi`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/analiz`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/premium`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/giris`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${siteUrl}/kayit`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/gizlilik-politikasi`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${siteUrl}/kullanim-kosullari`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  const sourceEntries: MetadataRoute.Sitemap = OFFICIAL_SOURCE_SLUGS.map((slug) => ({
    url: `${siteUrl}/kaynak/${slug}`,
    lastModified: currentDate,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const cityEntries: MetadataRoute.Sitemap = topCities.map((entry) => ({
    url: `${siteUrl}/sehir/${entry.slug}`,
    lastModified: currentDate,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...staticEntries, ...sourceEntries, ...cityEntries];
}
