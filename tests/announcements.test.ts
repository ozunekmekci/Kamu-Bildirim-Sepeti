import { describe, expect, it, vi } from 'vitest';
import {
  INITIAL_ANNOUNCEMENTS,
  fetchOfficialAnnouncements,
  filterAnnouncements,
  getAnnouncementFacets,
  getDeadlineDaysLeft,
  parseIskurHtml,
  parseKariyerKapisiHtml,
  parseResmiGazeteHtml,
  syncOfficialSources,
} from '@/modules/announcements';

describe('announcements seed dataset', () => {
  it('contains 24 unique announcements covering all required sources, categories, and statuses', () => {
    expect(INITIAL_ANNOUNCEMENTS).toHaveLength(24);

    const ids = new Set(INITIAL_ANNOUNCEMENTS.map((item) => item.id));
    const externalIds = new Set(INITIAL_ANNOUNCEMENTS.map((item) => item.externalId));
    expect(ids.size).toBe(24);
    expect(externalIds.size).toBe(24);

    const openItems = INITIAL_ANNOUNCEMENTS.filter((item) => item.status === 'acik');
    const closedItems = INITIAL_ANNOUNCEMENTS.filter((item) => item.status === 'kapali');
    expect(openItems).toHaveLength(18);
    expect(closedItems).toHaveLength(6);

    for (const item of openItems) {
      expect(item.deadlineAt >= '2026-11-26').toBe(true);
    }
    for (const item of closedItems) {
      expect(item.deadlineAt < '2026-11-26').toBe(true);
    }

    const sources = new Set(INITIAL_ANNOUNCEMENTS.map((item) => item.source));
    expect(sources.has('kariyer_kapisi')).toBe(true);
    expect(sources.has('iskur')).toBe(true);
    expect(sources.has('resmi_gazete')).toBe(true);

    const categories = new Set(INITIAL_ANNOUNCEMENTS.map((item) => item.category));
    expect(categories.has('atama')).toBe(true);
    expect(categories.has('personel_alimi')).toBe(true);
    expect(categories.has('gorevlendirme')).toBe(true);
  });

  it('uses official Turkish source URLs and avoids em-dash characters', () => {
    const allowedHosts = ['kariyerkapisi.gov.tr', 'www.iskur.gov.tr', 'www.resmigazete.gov.tr'];

    for (const item of INITIAL_ANNOUNCEMENTS) {
      const parsed = new URL(item.sourceUrl);
      expect(allowedHosts).toContain(parsed.hostname);
      expect(item.criteria.summaryLines.length).toBeGreaterThanOrEqual(2);

      const serialized = JSON.stringify(item);
      expect(serialized.includes('\u2014')).toBe(false);
    }
  });
});

describe('official HTML parsers', () => {
  it('parses Kariyer Kapısı announcement cards deterministically', () => {
    const html = `
      <section>
        <article data-id="KK-991" data-city="ANKARA" data-published="2026-11-20" data-deadline="2026-12-20" data-quota="50">
          <div class="institution">T.C. Ticaret Bakanlığı</div>
          <h3 class="title"><a href="/ilan/kk-991">Sözleşmeli Mühendis Personel Alımı</a></h3>
          <p class="summary">KPSS P3 en az 75 puan. Bilgisayar Mühendisliği (4531) mezunu, B sınıfı sürücü belgesi, 6225 sertifika ve askerlik şartı aranır.</p>
        </article>
      </section>
    `;

    const items = parseKariyerKapisiHtml(html, '2026-11-26');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: 'KK-991',
      source: 'kariyer_kapisi',
      sourceName: 'Kariyer Kapısı',
      sourceUrl: 'https://kariyerkapisi.gov.tr/ilan/kk-991',
      institution: 'T.C. Ticaret Bakanlığı',
      title: 'Sözleşmeli Mühendis Personel Alımı',
      category: 'personel_alimi',
      city: 'ANKARA',
      status: 'acik',
      publishedAt: '2026-11-20',
      deadlineAt: '2026-12-20',
      quota: 50,
    });
    expect(items[0].criteria.kpssScoreTypes).toContain('P3');
    expect(items[0].criteria.minKpssScore).toBe(75);
    expect(items[0].criteria.qualificationCodes).toContain('4531');
    expect(items[0].criteria.driverLicenses).toContain('B');
    expect(items[0].criteria.certificates).toContain('6225');
    expect(items[0].criteria.militaryRequired).toBe(true);
  });

  it('parses İŞKUR table rows and skips header row', () => {
    const html = `
      <table>
        <tr><th>Kurum</th><th>Pozisyon</th><th>Detay</th></tr>
        <tr data-id="ISK-55" data-city="İZMİR" data-deadline="2026-12-12" data-quota="18">
          <td>Devlet Su İşleri</td>
          <td><a href="/duyuru/isk-55">Elektrik Bakım İşçisi Alımı</a></td>
          <td>Ortaöğretim lise (2001) mezunu, C sınıfı ehliyet, SRC-2 belgesi. Yayın: 22.11.2026</td>
        </tr>
      </table>
    `;

    const items = parseIskurHtml(html, '2026-11-26');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: 'ISK-55',
      source: 'iskur',
      sourceUrl: 'https://www.iskur.gov.tr/duyuru/isk-55',
      institution: 'Devlet Su İşleri',
      title: 'Elektrik Bakım İşçisi Alımı',
      city: 'İZMİR',
      status: 'acik',
      publishedAt: '2026-11-22',
      deadlineAt: '2026-12-12',
      quota: 18,
    });
    expect(items[0].criteria.educationLevels).toContain('ortaogretim');
    expect(items[0].criteria.driverLicenses).toContain('C');
    expect(items[0].criteria.certificates).toContain('SRC-2');
  });

  it('parses Resmî Gazete announcements with nested divs and HTML entities', () => {
    const html = `
      <div class="fihrist-item" data-id="RG-321" data-city="TÜRKİYE GENELİ" data-deadline="2026-10-15">
        <div class="meta"><span class="institution">Hazine &amp; Maliye Bakanlığı</span></div>
        <a href="/eskiler/2026/10/rg-321.htm">Yurt Dışı Geçici Görevlendirme İlanı</a>
        <div class="summary">Lisans mezunu, YDS-B yabancı dil belgesi ve KPSS P3 en az 70 puan.</div>
      </div>
    `;

    const items = parseResmiGazeteHtml(html, '2026-11-26');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: 'RG-321',
      source: 'resmi_gazete',
      sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2026/10/rg-321.htm',
      institution: 'Hazine & Maliye Bakanlığı',
      category: 'gorevlendirme',
      status: 'kapali',
    });
    expect(items[0].criteria.certificates).toContain('YDS-B');
    expect(items[0].criteria.minKpssScore).toBe(70);
  });

  it('returns empty array safely for empty or unrelated HTML', () => {
    expect(parseKariyerKapisiHtml('')).toEqual([]);
    expect(parseIskurHtml('<html><body><nav>Menü</nav></body></html>')).toEqual([]);
    expect(parseResmiGazeteHtml('<div>Boş</div>')).toEqual([]);
  });
});

describe('fetchOfficialAnnouncements & syncOfficialSources', () => {
  it('aggregates valid sources and reports partial errors gracefully', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('kariyerkapisi.gov.tr')) {
        return new Response(
          `<article data-id="KK-LIVE-1" data-city="ANKARA" data-deadline="2026-12-30">
             <span class="institution">Adalet Bakanlığı</span>
             <a href="/ilan/1">Mühendis Alımı</a>
           </article>`,
          { status: 200 }
        );
      }
      if (url.includes('iskur.gov.tr')) {
        return new Response('Server error', { status: 503 });
      }
      throw new Error('Network unreachable');
    }) as unknown as typeof fetch;

    const result = await fetchOfficialAnnouncements(mockFetch, {
      timeoutMs: 1000,
      referenceDate: '2026-11-26',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].externalId).toBe('KK-LIVE-1');
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((e) => e.source)).toEqual(['iskur', 'resmi_gazete']);
  });

  it('handles aborted requests on timeout without throwing', async () => {
    const hangingFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    ) as unknown as typeof fetch;

    const result = await fetchOfficialAnnouncements(hangingFetch, { timeoutMs: 25 });
    expect(result.items).toEqual([]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].message).toContain('zaman aşımı');
  });

  it('syncOfficialSources calls upsertFn only when items exist', async () => {
    const upsertSpy = vi.fn(async (items) => items.length);
    const okFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('kariyerkapisi.gov.tr')) {
        return new Response(
          `<article data-id="KK-SYNC-1" data-deadline="2026-12-25">
             <span class="institution">TÜİK</span>
             <a href="/a">Uzman Yardımcısı Alımı</a>
           </article>`,
          { status: 200 }
        );
      }
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const synced = await syncOfficialSources(upsertSpy, okFetch);
    expect(synced.syncedCount).toBe(1);
    expect(upsertSpy).toHaveBeenCalledTimes(1);

    const failSpy = vi.fn();
    const failFetch = vi.fn(async () => new Response('fail', { status: 500 })) as unknown as typeof fetch;
    const failed = await syncOfficialSources(failSpy, failFetch);
    expect(failed.syncedCount).toBe(0);
    expect(failSpy).not.toHaveBeenCalled();
  });
});

describe('announcements filtering, facets, and deadline helpers', () => {
  it('filters by status, category, source, Turkish-normalized city, and ASCII query', () => {
    const openKariyer = filterAnnouncements(INITIAL_ANNOUNCEMENTS, {
      status: 'acik',
      source: 'kariyer_kapisi',
      q: 'bilgisayar muhendisligi',
    });
    expect(openKariyer.length).toBeGreaterThanOrEqual(2);
    expect(openKariyer.every((a) => a.status === 'acik' && a.source === 'kariyer_kapisi')).toBe(true);

    const eskisehirItems = filterAnnouncements(INITIAL_ANNOUNCEMENTS, {
      city: 'eskisehir',
    });
    expect(eskisehirItems.some((a) => a.city === 'ESKİŞEHİR')).toBe(true);

    const gorevlendirme = filterAnnouncements(INITIAL_ANNOUNCEMENTS, {
      category: 'gorevlendirme',
      status: 'acik',
    });
    expect(gorevlendirme.length).toBeGreaterThanOrEqual(2);
    expect(gorevlendirme.every((a) => a.category === 'gorevlendirme' && a.status === 'acik')).toBe(true);
  });

  it('computes accurate facets and deadline day differences', () => {
    const facets = getAnnouncementFacets(INITIAL_ANNOUNCEMENTS);
    expect(facets.statuses.acik).toBe(18);
    expect(facets.statuses.kapali).toBe(6);
    expect(facets.categories.atama + facets.categories.personel_alimi + facets.categories.gorevlendirme).toBe(24);
    expect(facets.cities.length).toBeGreaterThan(5);

    expect(getDeadlineDaysLeft('2026-12-06', '2026-11-26')).toBe(10);
    expect(getDeadlineDaysLeft('2026-11-26', '2026-11-26')).toBe(0);
    expect(getDeadlineDaysLeft('2026-11-20', '2026-11-26')).toBe(-6);
  });
});
