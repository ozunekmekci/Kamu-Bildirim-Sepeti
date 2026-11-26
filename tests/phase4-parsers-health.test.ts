import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getHealthHandler } from '@/app/api/health/route';
import {
  fetchOfficialAnnouncements,
  parseKariyerKapisiHtml,
  parseResmiGazeteHtml,
} from '@/modules/announcements';
import { resetMemoryDb } from '@/modules/db';

const ENV_KEYS_TO_RESTORE = [
  'RESEND_API_KEY',
  'MAILCHANNELS_API_KEY',
  'STRIPE_SECRET_KEY',
  'IYZICO_API_KEY',
  'IYZICO_SECRET_KEY',
  'PAYMENT_PROVIDER',
  'VAPID_PUBLIC_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'CRON_SECRET',
  'SESSION_SECRET',
] as const;

describe('Phase 4 hardened official announcement parsers', () => {
  it('extracts JSON-LD JobPosting from single object, array, and @graph structures', () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">{ invalid json </script>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "Kariyer Kapisi"
            }
          </script>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "name": "Kamu Kurumu"
                },
                {
                  "@type": "JobPosting",
                  "identifier": "KK-LD-101",
                  "title": "Sözleşmeli Bilişim Uzmanı Alımı",
                  "hiringOrganization": {
                    "@type": "Organization",
                    "name": "T.C. Hazine ve Maliye Bakanlığı"
                  },
                  "jobLocation": {
                    "@type": "Place",
                    "address": {
                      "@type": "PostalAddress",
                      "addressLocality": "Ankara"
                    }
                  },
                  "datePosted": "2026-11-22T09:00:00Z",
                  "validThrough": "2026-12-18T23:59:59Z",
                  "url": "/ilan/kk-ld-101",
                  "description": "Lisans mezunu, KPSS P3 en az 80 puan ve 4531 nitelik kodu ile 12 personel alınacaktır."
                }
              ]
            }
          </script>
          <script type="application/ld+json">
            [
              {
                "@type": ["JobPosting"],
                "title": "T.C. Ticaret Bakanlığı - Müfettiş Yardımcısı Alım İlanı",
                "jobLocation": [
                  { "address": { "addressLocality": "İstanbul" } }
                ],
                "datePosted": "2026-11-20",
                "validThrough": "2026-12-10",
                "url": "https://kariyerkapisi.gov.tr/ilan/kk-ld-102",
                "description": "KPSS P3 en az 75 puan. Lisans mezunları başvurabilir."
              }
            ]
          </script>
        </head>
        <body><nav><ul><li>Anasayfa</li></ul></nav></body>
      </html>
    `;

    const items = parseKariyerKapisiHtml(html, '2026-11-26');
    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      externalId: 'KK-LD-101',
      source: 'kariyer_kapisi',
      institution: 'T.C. Hazine ve Maliye Bakanlığı',
      title: 'Sözleşmeli Bilişim Uzmanı Alımı',
      city: 'ANKARA',
      publishedAt: '2026-11-22',
      deadlineAt: '2026-12-18',
      status: 'acik',
      quota: 12,
      sourceUrl: 'https://kariyerkapisi.gov.tr/ilan/kk-ld-101',
    });
    expect(items[0].criteria.kpssScoreTypes).toContain('P3');
    expect(items[0].criteria.minKpssScore).toBe(80);
    expect(items[0].criteria.qualificationCodes).toContain('4531');

    expect(items[1]).toMatchObject({
      institution: 'T.C. Ticaret Bakanlığı',
      title: 'Müfettiş Yardımcısı Alım İlanı',
      city: 'İSTANBUL',
      publishedAt: '2026-11-20',
      deadlineAt: '2026-12-10',
      status: 'acik',
      sourceUrl: 'https://kariyerkapisi.gov.tr/ilan/kk-ld-102',
    });
  });

  it('falls back to RSS <item> and Atom <entry> extraction when HTML containers are absent', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Resmî Gazete İlanları</title>
          <item>
            <title>T.C. Adalet Bakanlığı - İcra Katibi Personel Alım İlanı</title>
            <link>https://www.resmigazete.gov.tr/ilanlar/2026/11/adalet-1.pdf</link>
            <pubDate>Thu, 26 Nov 2026 08:00:00 +0300</pubDate>
            <category>Personel Alımı</category>
            <description><![CDATA[<p>Önlisans mezunu, KPSS P93 en az 70 puan, Şehir: Ankara, Son başvuru: 2026-12-15. <ul><li>Detay</li></ul></p>]]></description>
          </item>
        </channel>
      </rss>
    `;

    const rssItems = parseResmiGazeteHtml(rssXml, '2026-11-26');
    expect(rssItems).toHaveLength(1);
    expect(rssItems[0]).toMatchObject({
      source: 'resmi_gazete',
      institution: 'T.C. Adalet Bakanlığı',
      title: 'İcra Katibi Personel Alım İlanı',
      category: 'personel_alimi',
      city: 'ANKARA',
      publishedAt: '2026-11-26',
      deadlineAt: '2026-12-15',
      status: 'acik',
      sourceUrl: 'https://www.resmigazete.gov.tr/ilanlar/2026/11/adalet-1.pdf',
    });
    expect(rssItems[0].criteria.educationLevels).toContain('onlisans');
    expect(rssItems[0].criteria.kpssScoreTypes).toContain('P93');
    expect(rssItems[0].criteria.minKpssScore).toBe(70);

    const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Resmî Gazete Akışı</title>
        <entry>
          <id>rg-atom-1</id>
          <title>T.C. İçişleri Bakanlığı - Kaymakam Adaylığı Atama İlanı</title>
          <link rel="alternate" href="/eskiler/2026/11/kaymakam.pdf" />
          <updated>2026-11-25T10:00:00Z</updated>
          <category term="Atama" />
          <summary>Lisans mezunları için 2026-12-20 son başvuru tarihli ilan.</summary>
        </entry>
      </feed>
    `;

    const atomItems = parseResmiGazeteHtml(atomXml, '2026-11-26');
    expect(atomItems).toHaveLength(1);
    expect(atomItems[0]).toMatchObject({
      externalId: 'rg-atom-1',
      institution: 'T.C. İçişleri Bakanlığı',
      title: 'Kaymakam Adaylığı Atama İlanı',
      category: 'atama',
      publishedAt: '2026-11-25',
      deadlineAt: '2026-12-20',
      sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2026/11/kaymakam.pdf',
    });
  });

  it('extracts Resmî Gazete fihrist-item PDF links and splits institution and title cleanly', () => {
    const html = `
      <div class="fihrist-item" data-deadline="2026-12-22">
        <a href="/eskiler/2026/11/ozet.htm">Özet</a>
        <a href="/ilanlar/eskiilanlar/2026/11/20261126-4-1.pdf">
          T.C. Diyanet İşleri Başkanlığı - Sözleşmeli Personel Alım İlanı
        </a>
        <span class="summary">Lisans mezunu, KPSS P3 en az 65 puan ile 40 personel alınacaktır.</span>
      </div>
    `;

    const items = parseResmiGazeteHtml(html, '2026-11-26');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'resmi_gazete',
      sourceUrl: 'https://www.resmigazete.gov.tr/ilanlar/eskiilanlar/2026/11/20261126-4-1.pdf',
      institution: 'T.C. Diyanet İşleri Başkanlığı',
      title: 'Sözleşmeli Personel Alım İlanı',
      category: 'personel_alimi',
      deadlineAt: '2026-12-22',
      quota: 40,
      status: 'acik',
    });
  });

  it('sends clean User-Agent alongside Accept header in fetchOfficialAnnouncements', async () => {
    const mockFetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;
    await fetchOfficialAnnouncements(mockFetch, { timeoutMs: 1000 });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const firstCallInit = (mockFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    const headers = firstCallInit?.headers as Record<string, string> | undefined;
    expect(headers?.['User-Agent']).toBe(
      'KamuBildirimSepeti/1.0 (+https://kamubildirimsepeti.example)',
    );
    expect(headers?.Accept).toContain('text/html');
  });
});

describe('GET /api/health endpoint', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetMemoryDb();
    for (const key of ENV_KEYS_TO_RESTORE) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS_TO_RESTORE) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('returns safe provider readiness flags and never leaks secret values', async () => {
    const dummySecrets = {
      RESEND_API_KEY: 're_super_secret_test_value_999',
      STRIPE_SECRET_KEY: 'sk_test_super_secret_stripe_key_888',
      VAPID_PUBLIC_KEY: 'BPUBLIC_VAPID_TEST_KEY_SHOULD_NOT_APPEAR_777',
      VAPID_PRIVATE_KEY: 'PRIVATE_VAPID_SECRET_SHOULD_NOT_APPEAR_666',
      CRON_SECRET: 'cron_secret_should_never_leak_555',
      SESSION_SECRET: 'session_secret_should_never_leak_444',
    };

    Object.assign(process.env, dummySecrets);

    const response = await getHealthHandler();
    expect(response.status).toBe(200);
    const rawBody = await response.text();
    const data = JSON.parse(rawBody) as {
      status: string;
      app: string;
      timestamp: string;
      database: { mode: string; announcementsCount: number };
      providers: {
        email: string;
        payment: string;
        configuredPayments: string[];
        pushConfigured: boolean;
        cronSecretConfigured: boolean;
        sessionSecretConfigured: boolean;
      };
    };

    expect(data.status).toBe('ok');
    expect(data.app).toBe('Kamu Bildirim Sepeti');
    expect(typeof data.timestamp).toBe('string');
    expect(data.database.mode).toBe('memory');
    expect(data.database.announcementsCount).toBe(24);
    expect(data.providers).toEqual({
      email: 'resend',
      payment: 'stripe',
      configuredPayments: ['demo', 'stripe'],
      pushConfigured: true,
      cronSecretConfigured: true,
      sessionSecretConfigured: true,
    });

    for (const secretValue of Object.values(dummySecrets)) {
      expect(rawBody).not.toContain(secretValue);
    }
  });

  it('reports false/noop/demo readiness when secrets are absent', async () => {
    const response = await getHealthHandler();
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      providers: {
        email: string;
        payment: string;
        configuredPayments: string[];
        pushConfigured: boolean;
        cronSecretConfigured: boolean;
        sessionSecretConfigured: boolean;
      };
    };

    expect(data.providers).toEqual({
      email: 'noop',
      payment: 'demo',
      configuredPayments: ['demo'],
      pushConfigured: false,
      cronSecretConfigured: false,
      sessionSecretConfigured: false,
    });
  });
});

describe('scripts/setup-cloudflare.sh validation', () => {
  const scriptPath = join(process.cwd(), 'scripts', 'setup-cloudflare.sh');

  it('passes bash syntax check and prints Phase 3 migrations and secrets in --dry-run', () => {
    execFileSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
    const dryRunOut = execFileSync('bash', [scriptPath, '--dry-run'], { encoding: 'utf8' });

    expect(dryRunOut).toContain('0001_init.sql + 0002_phase2.sql + 0003_phase3.sql');
    expect(dryRunOut).toContain('NEXT_PUBLIC_SITE_URL');
    expect(dryRunOut).toContain('EMAIL_FROM');
    expect(dryRunOut).toContain('VAPID_PUBLIC_KEY');
    expect(dryRunOut).toContain('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    expect(dryRunOut).toContain('VAPID_PRIVATE_KEY');
    expect(dryRunOut.includes('\u2014')).toBe(false);
  });

  it('generates valid P-256 VAPID keypair lines in --generate-vapid mode', () => {
    const out = execFileSync('bash', [scriptPath, '--generate-vapid'], { encoding: 'utf8' });
    const lines = out.trim().split(/\r?\n/);
    const kv = Object.fromEntries(lines.map((line) => line.split('=')));

    expect(kv.VAPID_PUBLIC_KEY).toBeTruthy();
    expect(kv.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe(kv.VAPID_PUBLIC_KEY);
    expect(kv.VAPID_PRIVATE_KEY).toBeTruthy();

    const pubBytes = Buffer.from(kv.VAPID_PUBLIC_KEY, 'base64url');
    const privBytes = Buffer.from(kv.VAPID_PRIVATE_KEY, 'base64url');
    expect(pubBytes.length).toBe(65);
    expect(pubBytes[0]).toBe(0x04);
    expect(privBytes.length).toBe(32);
  });
});
