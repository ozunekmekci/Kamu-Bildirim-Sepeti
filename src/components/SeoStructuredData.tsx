import React from 'react';

export default function SeoStructuredData() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kpssportal.pages.dev';

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Kamu Bildirim Sepeti',
    url: siteUrl,
    description:
      'Kariyer Kapısı, İŞKUR ve Resmî Gazete kamu personel alımı, atama ve görevlendirme ilanları ile KPSS merkezi yerleştirme arşivi ve profil tabanlı eşleştirme platformu.',
    inLanguage: 'tr-TR',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Kamu Bildirim Sepeti',
    url: siteUrl,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    description:
      'Kamu kurumlarının atama, personel alımı ve görevlendirme ilanlarını profilinize göre filtreleyen ve son başvuru takibi sunan SaaS platformu.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'TRY',
    },
    provider: {
      '@type': 'Organization',
      name: 'Kamu Bildirim Sepeti',
      url: siteUrl,
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'KPSS 4001 nitelik kodu nedir ve kimler tercih edebilir?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '4001 nitelik kodu, "Herhangi bir lisans programından mezun olmak" şartıdır. Üniversitelerin 4 yıllık herhangi bir lisans bölümünden mezun olan ve KPSSP3 puan türüne sahip tüm adaylar bu kadroları tercih edebilir.',
        },
      },
      {
        '@type': 'Question',
        name: 'Kamu Bildirim Sepeti hangi resmî kaynakları takip eder?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Platformda Kariyer Kapısı (kariyerkapisi.gov.tr), İŞKUR (iskur.gov.tr) ve T.C. Resmî Gazete (resmigazete.gov.tr) üzerinden yayımlanan atama, personel alımı ve görevlendirme ilanları ile ÖSYM KPSS arşivi takip edilir.',
        },
      },
      {
        '@type': 'Question',
        name: 'İlanlarda hangi bilgiler bağlayıcıdır?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.',
        },
      },
      {
        '@type': 'Question',
        name: 'KPSS 3001 ve 2001 nitelik kodları ne anlama gelir?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '3001 herhangi bir önlisans (KPSSP93), 2001 ise herhangi bir ortaöğretim (KPSSP94) programından mezun olmayı ifade eden genel ÖSYM nitelik kodlarıdır.',
        },
      },
    ],
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Ana Sayfa',
        item: siteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'KPSS Merkezi Yerleştirme Arşivi',
        item: `${siteUrl}/kpss-arsivi`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
