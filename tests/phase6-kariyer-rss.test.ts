import { describe, expect, it, vi } from 'vitest';
import {
  fetchOfficialAnnouncements,
  OFFICIAL_SOURCE_URLS,
  parseKariyerKapisiHtml,
} from '@/modules/announcements';

const SAMPLE_KARIYER_KAPISI_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Kariyer Kapısı</title>
    <item>
      <guid isPermaLink="true">https://kariyerkapisi.gov.tr/IlanDetay?i=dea72757-7130-466f-bcf2-8d316d02add1</guid>
      <link>https://kariyerkapisi.gov.tr/IlanDetay?i=dea72757-7130-466f-bcf2-8d316d02add1</link>
      <category>Sözleşmeli Personel İlanları</category>
      <title>BURSA TEKNİK ÜNİVERSİTESİ REKTÖRLÜĞÜ - 1 Sözleşmeli Psikolog Alımı</title>
      <description>BURSA TEKNİK ÜNİVERSİTESİ REKTÖRLÜĞÜ - 1 Sözleşmeli Psikolog Alımı. Son başvuru: 2026-12-25.</description>
      <pubDate>Fri, 13 Nov 2026 09:00:00 +0300</pubDate>
    </item>
    <item>
      <guid isPermaLink="true">https://kariyerkapisi.gov.tr/IlanDetay?i=069150d6-ad89-4973-9410-25ae1fa56d67</guid>
      <link>https://kariyerkapisi.gov.tr/IlanDetay?i=069150d6-ad89-4973-9410-25ae1fa56d67</link>
      <category>Memur Alımı</category>
      <title>SAHİL GÜVENLİK KOMUTANLIĞI - SAHİL GÜVENLİK KOMUTANLIĞI 2026 YILI DEVLET MEMURU TEMİNİ</title>
      <description>KPSS P3 en az 70 puan, Lisans mezunları. Son başvuru: 2026-12-30.</description>
      <pubDate>Tue, 17 Nov 2026 17:00:00 +0300</pubDate>
    </item>
  </channel>
</rss>`;

describe('Phase 6 Kariyer Kapisi official RSS integration', () => {
  it('parses real Kariyer Kapisi RSS items with stable UUID externalId and institution splitting', () => {
    const items = parseKariyerKapisiHtml(SAMPLE_KARIYER_KAPISI_RSS, '2026-11-26');
    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      externalId: 'KARIYER_KAPISI-dea72757-7130-466f-bcf2-8d316d02add1',
      source: 'kariyer_kapisi',
      sourceName: 'Kariyer Kapısı',
      sourceUrl: 'https://kariyerkapisi.gov.tr/IlanDetay?i=dea72757-7130-466f-bcf2-8d316d02add1',
      institution: 'BURSA TEKNİK ÜNİVERSİTESİ REKTÖRLÜĞÜ',
      title: '1 Sözleşmeli Psikolog Alımı',
      category: 'personel_alimi',
      publishedAt: '2026-11-13',
      deadlineAt: '2026-12-25',
      status: 'acik',
    });

    expect(items[1]).toMatchObject({
      externalId: 'KARIYER_KAPISI-069150d6-ad89-4973-9410-25ae1fa56d67',
      institution: 'SAHİL GÜVENLİK KOMUTANLIĞI',
      title: 'SAHİL GÜVENLİK KOMUTANLIĞI 2026 YILI DEVLET MEMURU TEMİNİ',
      publishedAt: '2026-11-17',
      deadlineAt: '2026-12-30',
      status: 'acik',
    });
    expect(items[1].criteria.kpssScoreTypes).toContain('P3');
    expect(items[1].criteria.minKpssScore).toBe(70);
  });

  it('targets https://kariyerkapisi.gov.tr/RSS in fetchOfficialAnnouncements while preserving root landing url', async () => {
    expect(OFFICIAL_SOURCE_URLS.kariyer_kapisi.url).toBe('https://kariyerkapisi.gov.tr');
    expect(OFFICIAL_SOURCE_URLS.kariyer_kapisi.feedUrl).toBe('https://kariyerkapisi.gov.tr/RSS');

    const requestedUrls: string[] = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      requestedUrls.push(url);
      if (url === 'https://kariyerkapisi.gov.tr/RSS') {
        return new Response(SAMPLE_KARIYER_KAPISI_RSS, {
          status: 200,
          headers: { 'content-type': 'application/xml; charset=utf-8' },
        });
      }
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchOfficialAnnouncements(mockFetch, {
      timeoutMs: 1000,
      referenceDate: '2026-11-26',
    });

    expect(requestedUrls).toContain('https://kariyerkapisi.gov.tr/RSS');
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
  });
});
