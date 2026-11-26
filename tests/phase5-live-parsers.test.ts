import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchOfficialAnnouncements,
  parseIskurHtml,
  parseKariyerKapisiHtml,
  parseResmiGazeteHtml,
} from '@/modules/announcements';
import { probeSingleSource, runProbe } from '../scripts/probe-sources';

describe('Phase 5 realistic Turkish official HTML edge cases', () => {
  it('resolves root-relative, path-relative, protocol-relative, and query hrefs per official source', () => {
    const kkHtml = `
      <section>
        <article data-id="KK-REL-1" data-deadline="2026-12-30">
          <span class="institution">T.C. Çevre, Şehircilik ve İklim Değişikliği Bakanlığı</span>
          <a href="ilanlar/detay?id=42">Şehir Plancısı Alımı</a>
        </article>
        <article data-id="KK-REL-2" data-deadline="2026-12-30">
          <span class="institution">T.C. Tarım ve Orman Bakanlığı</span>
          <a href="?page=2">Ziraat Mühendisi Alımı</a>
        </article>
        <article data-id="KK-REL-3" data-deadline="2026-12-30">
          <span class="institution">T.C. Sağlık Bakanlığı</span>
          <a href="#top">Ebe ve Hemşire Atama Duyurusu</a>
        </article>
      </section>
    `;
    const kkItems = parseKariyerKapisiHtml(kkHtml, '2026-11-26');
    expect(kkItems).toHaveLength(3);
    expect(kkItems[0].sourceUrl).toBe('https://kariyerkapisi.gov.tr/ilanlar/detay?id=42');
    expect(kkItems[1].sourceUrl).toBe('https://kariyerkapisi.gov.tr/?page=2');
    expect(kkItems[2].sourceUrl).toBe('https://kariyerkapisi.gov.tr');

    const iskurHtml = `
      <table>
        <tr><th>Kurum</th><th>Pozisyon</th><th>Detay</th></tr>
        <tr data-id="ISK-REL-1" data-deadline="2026-12-20">
          <td>Karayolları Genel Müdürlüğü</td>
          <td><a href="//cdn.iskur.gov.tr/ilanlar/kgm-2026.pdf">İş Makinesi Operatörü Alımı</a></td>
          <td>Ortaöğretim mezunu, 15 kişi alınacaktır.</td>
        </tr>
        <tr data-id="ISK-REL-2" data-deadline="2026-12-20">
          <td>TCDD Taşımacılık</td>
          <td><a href="javascript:void(0)">Makinist İşçi Alımı</a></td>
          <td>Önlisans mezunu, KPSS P93 en az 60 puan.</td>
        </tr>
      </table>
    `;
    const iskurItems = parseIskurHtml(iskurHtml, '2026-11-26');
    expect(iskurItems).toHaveLength(2);
    expect(iskurItems[0].sourceUrl).toBe('https://cdn.iskur.gov.tr/ilanlar/kgm-2026.pdf');
    expect(iskurItems[1].sourceUrl).toBe('https://www.iskur.gov.tr/');

    const rgHtml = `
      <div class="fihrist-item" data-id="RG-REL-1" data-deadline="2026-12-18">
        <a href="./eskiler/2026/11/20261126-5.htm">T.C. Sağlık Bakanlığı - Uzman Tabip Atama İlanı</a>
      </div>
    `;
    const rgItems = parseResmiGazeteHtml(rgHtml, '2026-11-26');
    expect(rgItems).toHaveLength(1);
    expect(rgItems[0].sourceUrl).toBe('https://www.resmigazete.gov.tr/eskiler/2026/11/20261126-5.htm');
  });

  it('extracts mixed PDF and HTML Resmi Gazete fihrist rows while ignoring nav chrome and section card-titles', () => {
    const html = `
      <html>
        <body>
          <header>
            <nav>
              <ul>
                <li><a href="/fihrist">Bugünkü Gazete</a></li>
                <li><a href="/arsiv">Eski Sayılar</a></li>
              </ul>
            </nav>
          </header>
          <main id="html-content" class="html-content">
            <div class="card-title html-title">YÜRÜTME VE İDARE BÖLÜMÜ</div>
            <div class="fihrist-item mb-1" data-deadline="2026-12-20">
              <a href="/eskiler/2026/11/20261126-1.htm" data-modal="True">
                \u2013\u2013 T.C. Ticaret Bakanlığı - Gümrük Muhafaza Memuru Atama Yönetmeliği
              </a>
            </div>
            <div class="fihrist-item mb-1" data-deadline="2026-12-25">
              <a href="/eskiler/2026/11/20261126-2-ozet.htm">Özet</a>
              <a href="/ilanlar/2026/11/20261126-2.pdf">
                \u2013\u2013 T.C. Adalet Bakanlığı - Sözleşmeli Zabıt Katibi Personel Alım İlanı (KPSS P3 en az 70 puan)
              </a>
            </div>
          </main>
          <footer><ul><li>İletişim ve Künye</li></ul></footer>
        </body>
      </html>
    `;

    const items = parseResmiGazeteHtml(html, '2026-11-26');
    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      source: 'resmi_gazete',
      sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2026/11/20261126-1.htm',
      institution: 'T.C. Ticaret Bakanlığı',
      title: 'Gümrük Muhafaza Memuru Atama Yönetmeliği',
      category: 'atama',
      status: 'acik',
    });

    expect(items[1]).toMatchObject({
      source: 'resmi_gazete',
      sourceUrl: 'https://www.resmigazete.gov.tr/ilanlar/2026/11/20261126-2.pdf',
      institution: 'T.C. Adalet Bakanlığı',
      title: 'Sözleşmeli Zabıt Katibi Personel Alım İlanı (KPSS P3 en az 70 puan)',
      category: 'personel_alimi',
      status: 'acik',
    });
    expect(items[1].criteria.minKpssScore).toBe(70);
  });

  it('extracts ISKUR wrapped news-item anchor cards and skips nav/menu links and results-card wrappers', () => {
    const html = `
      <html>
        <body>
          <header>
            <nav>
              <ul>
                <li><a href="/kurumsal/teskilat/">Teşkilat Şeması ve Kurumsal Yapı</a></li>
                <li><a href="/kurumsal/yonetim/">Yönetim Kurulu Üyeleri Listesi</a></li>
              </ul>
            </nav>
          </header>
          <div class="results-card"><span>İstatistik Özeti</span></div>
          <div class="news-list">
            <a href="/duyurular/sozlesmeli-bilisim-personeli-alimi-2026/">
              <div class="news-item">
                <div class="news-date"><span class="day">21</span><span class="month">Kas</span></div>
                <div class="news-content">
                  <div class="news-title">Sözleşmeli Bilişim Personeli Alımı Duyurusu (KPSS P3)</div>
                </div>
              </div>
            </a>
            <a href="/duyurular/kamu-iscisi-alimi-ilanlari/">
              <div class="news-item">
                <div class="news-date"><span class="day">20</span><span class="month">Kas</span></div>
                <div class="news-content">
                  <div class="news-title">Kamu Kurumlarına Sürekli İşçi Alımı İlanı</div>
                </div>
              </div>
            </a>
          </div>
          <footer><ul><li>Gizlilik Politikası ve Kullanım Koşulları</li></ul></footer>
        </body>
      </html>
    `;

    const items = parseIskurHtml(html, '2026-11-26');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: 'iskur',
      sourceUrl: 'https://www.iskur.gov.tr/duyurular/sozlesmeli-bilisim-personeli-alimi-2026/',
      title: 'Sözleşmeli Bilişim Personeli Alımı Duyurusu (KPSS P3)',
      category: 'personel_alimi',
    });
    expect(items[1]).toMatchObject({
      source: 'iskur',
      sourceUrl: 'https://www.iskur.gov.tr/duyurular/kamu-iscisi-alimi-ilanlari/',
      title: 'Kamu Kurumlarına Sürekli İşçi Alımı İlanı',
    });
  });

  it('handles WAF 403 blocks, empty bodies, and timeouts safely in parsers, fetcher, and probe helper', async () => {
    const wafHtml = '<html><head><title>403 Forbidden</title></head><body>Access Denied by WAF</body></html>';
    expect(parseKariyerKapisiHtml(wafHtml)).toEqual([]);
    expect(parseIskurHtml('')).toEqual([]);
    expect(parseResmiGazeteHtml('   \n\t  ')).toEqual([]);

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('kariyerkapisi.gov.tr')) {
        return new Response(wafHtml, {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.includes('iskur.gov.tr')) {
        return new Response('', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const fetchRes = await fetchOfficialAnnouncements(mockFetch, { timeoutMs: 30 });
    expect(fetchRes.items).toEqual([]);
    expect(fetchRes.errors).toHaveLength(2);

    const kkProbe = await probeSingleSource('kariyer_kapisi', { fetcher: mockFetch, timeoutMs: 30 });
    expect(kkProbe.status).toBe(403);
    expect(kkProbe.parsedCount).toBe(0);
    expect(kkProbe.error).toContain('HTTP 403');

    const iskurProbe = await probeSingleSource('iskur', { fetcher: mockFetch, timeoutMs: 30 });
    expect(iskurProbe.status).toBe(200);
    expect(iskurProbe.byteLength).toBe(0);
    expect(iskurProbe.parsedCount).toBe(0);
    expect(iskurProbe.error).toBeNull();

    const rgProbe = await probeSingleSource('resmi_gazete', { fetcher: mockFetch, timeoutMs: 25 });
    expect(rgProbe.status).toBeNull();
    expect(rgProbe.parsedCount).toBe(0);
    expect(rgProbe.error).toContain('timed out');
  });
});

describe('scripts/probe-sources.ts offline mode and CLI', () => {
  it('runs offline probe helper across all 3 official sources without network calls', async () => {
    const summary = await runProbe({ offline: true, strict: true, referenceDate: '2026-11-26' });
    expect(summary.app).toBe('Kamu Bildirim Sepeti');
    expect(summary.mode).toBe('offline');
    expect(summary.hasFailures).toBe(false);
    expect(summary.totalParsed).toBe(3);
    expect(summary.sources).toHaveLength(3);
    for (const src of summary.sources) {
      expect(src.mode).toBe('offline');
      expect(src.parsedCount).toBe(1);
      expect(src.samples).toHaveLength(1);
      expect(src.error).toBeNull();
    }
  });

  it('executes probe-sources.ts --offline --json via tsx with clean JSON output', () => {
    const scriptPath = join(process.cwd(), 'scripts', 'probe-sources.ts');
    const stdout = execFileSync('npx', ['tsx', scriptPath, '--offline', '--json'], {
      encoding: 'utf8',
    });

    expect(stdout.includes('\u2014')).toBe(false);

    const parsed = JSON.parse(stdout) as {
      app: string;
      mode: string;
      totalParsed: number;
      hasFailures: boolean;
      sources: Array<{ source: string; parsedCount: number; samples: Array<{ title: string; url: string }> }>;
    };

    expect(parsed.app).toBe('Kamu Bildirim Sepeti');
    expect(parsed.mode).toBe('offline');
    expect(parsed.hasFailures).toBe(false);
    expect(parsed.totalParsed).toBe(3);
    expect(parsed.sources.map((s) => s.source)).toEqual(['kariyer_kapisi', 'iskur', 'resmi_gazete']);
  });
});
