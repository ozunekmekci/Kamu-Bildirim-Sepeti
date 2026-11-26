import { describe, expect, it, vi } from 'vitest';
import {
  classifyAnnouncement,
  cleanBbCodeAndHtml,
  computeContentHash,
  enrichKariyerKapisiDetail,
  fetchAllOfficialSourcesV2,
  fetchIskurKamuMemur,
  fetchKariyerKapisiApi,
  inferCityFromInstitutionOrText,
  isPublicRecruitmentResmiGazeteItem,
  mergeCrossSourceAnnouncements,
  OFFICIAL_SOURCE_URLS,
  parseCityAndDistrict,
  parseIskurCityMapHtml,
  parseIskurCityTableHtml,
  parseSbbKamuIlanHtml,
  parseTurkishDateRange,
} from '@/modules/announcements';

describe('Phase 7 Turkish taxonomy, city inference, and date parsing', () => {
  it('infers all major Turkish provinces, districts, universities, and slash locations accurately', () => {
    expect(inferCityFromInstitutionOrText('BOĞAZİÇİ ÜNİVERSİTESİ')).toBe('İSTANBUL');
    expect(inferCityFromInstitutionOrText('TÜRK-ALMAN ÜNİVERSİTESİ')).toBe('İSTANBUL');
    expect(inferCityFromInstitutionOrText('ODTÜ Rektörlüğü')).toBe('ANKARA');
    expect(inferCityFromInstitutionOrText('Hacettepe Üniversitesi')).toBe('ANKARA');
    expect(inferCityFromInstitutionOrText('Ege Üniversitesi')).toBe('İZMİR');
    expect(inferCityFromInstitutionOrText('Karamanoğlu Mehmetbey Üniversitesi')).toBe('KARAMAN');
    expect(inferCityFromInstitutionOrText('Sütçü İmam Üniversitesi')).toBe('KAHRAMANMARAŞ');
    expect(inferCityFromInstitutionOrText('Karadeniz Teknik Üniversitesi')).toBe('TRABZON');
    expect(inferCityFromInstitutionOrText('Ondokuz Mayıs Üniversitesi')).toBe('SAMSUN');
    expect(inferCityFromInstitutionOrText('Anadolu Üniversitesi Rektörlüğü')).toBe('ESKİŞEHİR');
    expect(inferCityFromInstitutionOrText('Karabağlar Belediyesi')).toBe('İZMİR');
    expect(inferCityFromInstitutionOrText('Çankaya Kaymakamlığı')).toBe('ANKARA');
    expect(inferCityFromInstitutionOrText('Kadıköy Belediyesi')).toBe('İSTANBUL');
    expect(inferCityFromInstitutionOrText('Şanlıurfa Valiliği')).toBe('ŞANLIURFA');
    expect(inferCityFromInstitutionOrText('Afyonkarahisar Belediyesi')).toBe('AFYONKARAHİSAR');

    // Word boundary guard: 'unvan' must not match VAN, 'karsilastirma' must not match KARS
    expect(
      inferCityFromInstitutionOrText(
        'DEVLET TİYATROLARI GENEL MÜDÜRLÜĞÜ',
        'Unvan Değişikliği ve Karşılaştırma Sınavı'
      )
    ).toBe('TÜRKİYE GENELİ');

    expect(parseCityAndDistrict('BURSA / YILDIRIM')).toEqual({
      city: 'BURSA',
      district: 'YILDIRIM',
    });
    expect(parseCityAndDistrict('ANKARA / ÇANKAYA')).toEqual({
      city: 'ANKARA',
      district: 'ÇANKAYA',
    });
    expect(parseCityAndDistrict('ADANA DT')).toEqual({
      city: 'ADANA',
      district: null,
    });
    expect(parseCityAndDistrict('MERKEZ', 'Anadolu Üniversitesi')).toEqual({
      city: 'ESKİŞEHİR',
      district: null,
    });
  });

  it('parses Turkish date ranges including December to January rollover', () => {
    expect(parseTurkishDateRange('26 Kasım - 10 Aralık', 2026)).toEqual({
      startDate: '2026-11-26',
      endDate: '2026-12-10',
    });
    expect(parseTurkishDateRange('20 Aralık - 05 Ocak', 2026)).toEqual({
      startDate: '2026-12-20',
      endDate: '2027-01-05',
    });
    expect(parseTurkishDateRange('28.11.2026 - 12.12.2026', 2026)).toEqual({
      startDate: '2026-11-28',
      endDate: '2026-12-12',
    });
  });

  it('classifies noticeType, employmentType, category, and examType accurately', () => {
    expect(
      classifyAnnouncement({
        source: 'sbb',
        institution: 'Karamanoğlu Mehmetbey Üniversitesi',
        title: 'İPTAL İLANI',
      })
    ).toMatchObject({
      noticeType: 'iptal',
    });

    expect(
      classifyAnnouncement({
        source: 'sbb',
        institution: 'Düzce Üniversitesi',
        title: 'Düzeltme İlanı Öğretim Görevlisi',
      })
    ).toMatchObject({
      noticeType: 'duzeltme',
      employmentType: 'akademik',
      category: 'personel_alimi',
    });

    expect(
      classifyAnnouncement({
        source: 'kariyer_kapisi',
        institution: 'Rekabet Kurumu Başkanlığı',
        title: '55 Rekabet Uzman Yardımcısı Alımı',
        description: 'Yazılı sınav ve sözlü sınav yapılacaktır.',
      })
    ).toMatchObject({
      employmentType: 'memur_a',
      examType: 'written_and_oral',
      noticeType: 'ilan',
    });

    expect(
      classifyAnnouncement({
        source: 'kariyer_kapisi',
        institution: 'Bursa Teknik Üniversitesi',
        title: '1 Sözleşmeli Psikolog Alımı',
        rawType: 'Sözleşmeli Personel İlanları',
        evaluationSteps: [{ asamaAdi: 'KPSS', turu: 'KPSS', sinavsizAsama: 0 }],
      })
    ).toMatchObject({
      employmentType: 'sozlesmeli_4b',
      examType: 'kpss_only',
      category: 'personel_alimi',
    });

    expect(
      classifyAnnouncement({
        source: 'kariyer_kapisi',
        institution: 'Devlet Tiyatroları Genel Müdürlüğü',
        title: 'Görevde Yükselme ve Unvan Değişikliği Sınavı',
        evaluationSteps: [
          { asamaAdi: 'Yazılı Sınav', turu: 'Genel' },
          { asamaAdi: 'Sözlü Sınav', turu: 'Genel' },
        ],
      })
    ).toMatchObject({
      employmentType: 'gorevde_yukselme',
      category: 'gorevlendirme',
      examType: 'written_and_oral',
    });

    expect(
      classifyAnnouncement({
        source: 'iskur',
        institution: 'Ağrı Eleşkirt Belediyesi',
        title: 'İtfaiye Eri Alım İlanı',
        description: 'Uygulamalı sınav yapılacaktır.',
      })
    ).toMatchObject({
      employmentType: 'memur_b',
      examType: 'practice_exam',
    });

    expect(
      classifyAnnouncement({
        source: 'iskur',
        institution: 'Afet ve Acil Durum Yönetimi Başkanlığı',
        title: 'AFAD Afet ve Acil Durum Yönetimi Uzman Yardımcısı Sınav İlanı',
      })
    ).toMatchObject({
      employmentType: 'memur_a',
    });

    expect(
      classifyAnnouncement({
        source: 'iskur',
        institution: 'T.C. Ticaret Bakanlığı',
        title: 'Müfettiş Yardımcısı Alım İlanı',
      })
    ).toMatchObject({
      employmentType: 'memur_a',
    });

    expect(
      classifyAnnouncement({
        source: 'iskur',
        institution: 'Orta Anadolu Kalkınma Ajansı',
        title: 'Sözleşmeli Uzman Personel Alım İlanı',
      })
    ).toMatchObject({
      employmentType: 'sozlesmeli_4b',
    });

    expect(
      classifyAnnouncement({
        source: 'iskur',
        institution: 'Karayolları Genel Müdürlüğü',
        title: 'Temizlik Görevlisi Alımı',
      })
    ).toMatchObject({
      employmentType: 'isci',
    });
  });

  it('filters Resmi Gazete items positively for public recruitment and rejects unrelated regulations/court decisions', () => {
    expect(
      isPublicRecruitmentResmiGazeteItem(
        'Hatay Mustafa Kemal Üniversitesi Yönetmeliğinin Yürürlükten Kaldırılmasına Dair Yönetmelik'
      )
    ).toBe(false);
    expect(
      isPublicRecruitmentResmiGazeteItem(
        'Anayasa Mahkemesinin 25/6/2026 Tarihli ve E: 2025/211, K: 2026/146 Sayılı Kararı'
      )
    ).toBe(false);
    expect(
      isPublicRecruitmentResmiGazeteItem(
        'İthalatta Haksız Rekabetin Önlenmesine İlişkin Tebliğ (No: 2026/33)'
      )
    ).toBe(false);

    expect(
      isPublicRecruitmentResmiGazeteItem(
        'T.C. Adalet Bakanlığı - Sözleşmeli Zabıt Katibi Personel Alım İlanı'
      )
    ).toBe(true);
    expect(
      isPublicRecruitmentResmiGazeteItem(
        'Boğaziçi Üniversitesi Rektörlüğü - Öğretim Üyesi Alım İlanı'
      )
    ).toBe(true);
    expect(
      isPublicRecruitmentResmiGazeteItem(
        'T.C. İçişleri Bakanlığı - Kaymakam Adaylığı Giriş Sınavı İlanı'
      )
    ).toBe(true);
  });

  it('computes deterministic hashes and deduplicates announcements across SBB, KK, and ISKUR', () => {
    expect(computeContentHash({ a: 1 })).toBe(computeContentHash({ a: 1 }));
    expect(computeContentHash({ a: 1 })).not.toBe(computeContentHash({ a: 2 }));

    const merged = mergeCrossSourceAnnouncements([
      {
        id: 'sbb-1',
        externalId: 'SBB-1',
        source: 'sbb',
        sourceName: 'SBB Kamu İlan',
        sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=abc',
        institution: 'BURSA TEKNİK ÜNİVERSİTESİ',
        title: '1 SÖZLEŞMELİ PSİKOLOG ALACAK',
        category: 'personel_alimi',
        city: 'BURSA',
        status: 'acik',
        publishedAt: '2026-11-13',
        deadlineAt: '2026-11-27',
        quota: 1,
        summary: 'SBB Özeti',
        criteria: {
          educationLevels: ['lisans'],
          kpssScoreTypes: ['P3'],
          minKpssScore: null,
          cities: ['BURSA'],
          militaryRequired: false,
          driverLicenses: [],
          certificates: [],
          qualificationCodes: [],
          summaryLines: [],
        },
      },
      {
        id: 'kariyer_kapisi-kariyer_kapisi-uuid-1',
        externalId: 'KARIYER_KAPISI-uuid-1',
        source: 'kariyer_kapisi',
        sourceName: 'Kariyer Kapısı',
        sourceUrl: 'https://kariyerkapisi.gov.tr/IlanDetay?i=uuid-1',
        institution: 'BURSA TEKNİK ÜNİVERSİTESİ REKTÖRLÜĞÜ',
        title: '1 Sözleşmeli Psikolog Alımı',
        category: 'personel_alimi',
        city: 'TÜRKİYE GENELİ',
        status: 'acik',
        publishedAt: '2026-11-13',
        deadlineAt: '2026-11-27',
        quota: null,
        summary: 'Kariyer Kapısı detaylı özeti ve başvuru bilgileri',
        applyUrl: 'https://www.turkiye.gov.tr/bursa-teknik',
        criteria: {
          educationLevels: [],
          kpssScoreTypes: [],
          minKpssScore: 70,
          cities: ['TÜRKİYE GENELİ'],
          militaryRequired: true,
          driverLicenses: [],
          certificates: [],
          qualificationCodes: ['4131'],
          summaryLines: ['KPSS P3 en az 70 puan'],
        },
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('kariyer_kapisi');
    expect(merged[0].city).toBe('BURSA');
    expect(merged[0].quota).toBe(1);
    expect(merged[0].applyUrl).toBe('https://www.turkiye.gov.tr/bursa-teknik');
    expect(merged[0].verifiedSources).toHaveLength(2);
    expect(merged[0].verifiedSources?.map((v) => v.source)).toEqual(['kariyer_kapisi', 'sbb']);
  });
});

describe('Phase 7 live official connectors', () => {
  it('registers SBB in OFFICIAL_SOURCE_URLS', () => {
    expect(OFFICIAL_SOURCE_URLS.sbb).toEqual({
      name: 'SBB Kamu İlan',
      url: 'https://kamuilan.sbb.gov.tr/',
    });
  });

  it('fetches Kariyer Kapisi JSON API and enriches preview + altilan positions cleanly', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/ilan/GetIseAlimPage')) {
        expect(init?.method).toBe('POST');
        const headers = init?.headers as Record<string, string>;
        expect(headers.Origin).toBe('https://kariyerkapisi.gov.tr');
        expect(headers.Referer).toBe('https://kariyerkapisi.gov.tr/isealim');
        return new Response(
          JSON.stringify({
            searchIlan: [
              {
                guid: 'dea72757-7130-466f-bcf2-8d316d02add1',
                kurumAdi: 'BURSA TEKNİK ÜNİVERSİTESİ REKTÖRLÜĞÜ',
                birimAdi: 'PERSONEL DAİRE BAŞKANLIĞI',
                ilanBaslik: 'BURSA TEKNİK ÜNİVERSİTESİ REKTÖRLÜĞÜ - 1 Sözleşmeli Psikolog Alımı',
                ilanTuru: 'Sözleşmeli Personel İlanları,',
                basTarih: '2026-11-13T09:00:00',
                bitTarih: '2026-12-27T13:00:00',
                basvuruLinki: '',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/api/ilan/GetIlanPreviewPublic')) {
        return new Response(
          JSON.stringify({
            kurumAdi: 'BURSA TEKNİK ÜNİVERSİTESİ REKTÖRLÜĞÜ',
            birimAdi: 'PERSONEL DAİRE BAŞKANLIĞI',
            ilanBaslik: '1 Sözleşmeli Psikolog Alımı',
            ilanMetni: '[justify][size=14pt]657 sayılı Kanun 4/B kapsamında alım yapılacaktır.[/size][/justify]',
            eDevletServisURL: 'https://www.turkiye.gov.tr/bursa-teknik-kariyer-kapisi',
            basvuruLinki: '',
            kontenjan: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/api/altilan/GetAltIlanInfoByIlanIdPublic')) {
        return new Response(
          JSON.stringify([
            {
              ilanBaslik: 'Psikolog',
              unvan: 'PSİKOLOG',
              ilanMetni:
                '[justify]MEZUNİYET : Lisans\n2026 KPSS(P3) en az 70 puan.\n35 yaşından gün almamış olmak.\nAskerliğini yapmış olmak.\nNitelik: 4131[/justify]',
              kontenjanList: [{ il: 'BURSA / YILDIRIM', kontenjan: 1 }],
              degerlemeAsamaList: [{ asamaAdi: 'KPSS', turu: 'KPSS', agirlik: 100 }],
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const listRes = await fetchKariyerKapisiApi(mockFetch, { referenceDate: '2026-11-26' });
    expect(listRes.error).toBeNull();
    expect(listRes.usedFallback).toBe(false);
    expect(listRes.items).toHaveLength(1);
    expect(listRes.items[0]).toMatchObject({
      externalId: 'KARIYER_KAPISI-dea72757-7130-466f-bcf2-8d316d02add1',
      city: 'BURSA',
      organizationUnit: 'PERSONEL DAİRE BAŞKANLIĞI',
      enrichmentStatus: 'pending',
      employmentType: 'sozlesmeli_4b',
      publishedAt: '2026-11-13',
      deadlineAt: '2026-12-27',
    });

    expect(cleanBbCodeAndHtml('[justify][size=14pt]Merhaba&nbsp;Dünya[/size][/justify]')).toBe(
      'Merhaba Dünya'
    );

    const enriched = await enrichKariyerKapisiDetail(
      'dea72757-7130-466f-bcf2-8d316d02add1',
      listRes.items[0],
      mockFetch
    );
    expect(enriched.enrichmentStatus).toBe('enriched');
    expect(enriched.examType).toBe('kpss_only');
    expect(enriched.applyUrl).toBe('https://www.turkiye.gov.tr/bursa-teknik-kariyer-kapisi');
    expect(enriched.quota).toBe(1);
    expect(enriched.positions).toHaveLength(1);
    expect(enriched.positions?.[0]).toMatchObject({
      city: 'BURSA',
      district: 'YILDIRIM',
      quota: 1,
      educationLevel: 'lisans',
      kpssScoreType: 'P3',
      minKpssScore: 70,
      maxAge: 35,
      militaryRequired: true,
      isInterviewFree: true,
    });
  });

  it('falls back to Kariyer Kapisi RSS only when the JSON API fails', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/ilan/GetIseAlimPage')) {
        return new Response('Forbidden', { status: 403 });
      }
      if (url === 'https://kariyerkapisi.gov.tr/RSS') {
        return new Response(
          `<?xml version="1.0"?><rss><channel><item>
            <guid>https://kariyerkapisi.gov.tr/IlanDetay?i=fallback-guid-1</guid>
            <link>https://kariyerkapisi.gov.tr/IlanDetay?i=fallback-guid-1</link>
            <title>ANADOLU ÜNİVERSİTESİ REKTÖRLÜĞÜ - Sözleşmeli Büro Personeli Alımı</title>
            <description>Son başvuru: 2026-12-20</description>
            <pubDate>Thu, 26 Nov 2026 09:00:00 +0300</pubDate>
          </item></channel></rss>`,
          { status: 200 }
        );
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const res = await fetchKariyerKapisiApi(mockFetch, { referenceDate: '2026-11-26' });
    expect(res.usedFallback).toBe(true);
    expect(res.error).toBeNull();
    expect(res.checkpoint.lastError).toContain('HTTP 403');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].city).toBe('ESKİŞEHİR');
  });

  it('parses SBB Kamu Ilan timeline and manset HTML with deduping and date rollover', () => {
    const html = `
      <div id="manset">
        <ul class="slides">
          <li>
            <a href="ilanDetay.aspx?kod=AAA111" target="_blank">
              <div class="avatar"><img src="./ilan_dosyalar/logolar/425.png#26.11.2026 00:00:00" /></div>
              <h5><span class="black">BOĞAZİÇİ ÜNİVERSİTESİ</span><span class="patrol">4 ÖĞRETİM ELEMANI ALACAK</span><span class="h5date">26 Kasım - 10 Aralık</span></h5>
            </a>
          </li>
        </ul>
      </div>
      <ul id="nav2" class="cbp_tmtimeline">
        <li>
          <div class="cbp_tmlabel">
            <a href="ilanDetay.aspx?kod=AAA111" target="_blank">
              <div>
                <img src="./ilan_dosyalar/logolar/425.png#26.11.2026 00:00:00" />
                <p class="alt_p1">BOĞAZİÇİ ÜNİVERSİTESİ</p>
                <p class="alt_p2">4 ÖĞRETİM ELEMANI ALACAK<em> ( 26 Kasım - 10 Aralık) </em></p>
              </div>
            </a>
            <a href="ilanDetay.aspx?kod=BBB222" target="_blank">
              <div>
                <img src="./ilan_dosyalar/logolar/556.png#20.12.2026 00:00:00" />
                <p class="alt_p1">KARAMANOĞLU MEHMETBEY ÜNİVERSİTESİ</p>
                <p class="alt_p2">İPTAL İLANI<em> ( 20 Aralık - 05 Ocak) </em></p>
              </div>
            </a>
          </div>
        </li>
      </ul>
    `;

    const items = parseSbbKamuIlanHtml(html, '2026-11-26');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: 'sbb',
      institution: 'BOĞAZİÇİ ÜNİVERSİTESİ',
      city: 'İSTANBUL',
      quota: 4,
      employmentType: 'akademik',
      publishedAt: '2026-11-26',
      deadlineAt: '2026-12-10',
      sourceUrl: 'https://kamuilan.sbb.gov.tr/ilanDetay.aspx?kod=AAA111',
    });
    expect(items[1]).toMatchObject({
      source: 'sbb',
      institution: 'KARAMANOĞLU MEHMETBEY ÜNİVERSİTESİ',
      city: 'KARAMAN',
      noticeType: 'iptal',
      publishedAt: '2026-12-20',
      deadlineAt: '2027-01-05',
    });
  });

  it('parses ISKUR Kamu Memur city map and city PDF table without tender/TV noise', async () => {
    const mapHtml = `
      <svg>
        <g id="adana" data-plakakodu="1" data-iladi="Adana" data-count=""></g>
        <g id="agri" data-plakakodu="4" data-iladi="A&#x11F;r&#x131;" data-count="1"></g>
      </svg>
    `;
    const cityHtml = `
      <table>
        <tr class="clickable-row" data-file-url="/medya/1i1gywes/agri-eleskirt-itfaiye.pdf">
          <td><span>11.12.2026 17:00 </span></td>
          <td>Ağrı Eleşkirt Belediyesi İtfaiye Eri Alım ilanı 11.12.2026</td>
          <td><a href="/medya/1i1gywes/agri-eleskirt-itfaiye.pdf">PDF</a></td>
        </tr>
      </table>
    `;

    const active = parseIskurCityMapHtml(mapHtml);
    expect(active).toEqual([{ cityId: '4', cityName: 'Ağrı', count: 1 }]);

    const tableItems = parseIskurCityTableHtml(cityHtml, 'Ağrı', '2026-11-26');
    expect(tableItems).toHaveLength(1);
    expect(tableItems[0]).toMatchObject({
      source: 'iskur',
      institution: 'Ağrı Eleşkirt Belediyesi',
      title: 'İtfaiye Eri Alım ilanı',
      city: 'AĞRI',
      deadlineAt: '2026-12-11',
      employmentType: 'memur_b',
      sourceUrl: 'https://www.iskur.gov.tr/medya/1i1gywes/agri-eleskirt-itfaiye.pdf',
    });

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('?idId=4')) {
        return new Response(cityHtml, { status: 200 });
      }
      return new Response(mapHtml, { status: 200 });
    }) as unknown as typeof fetch;

    const fetched = await fetchIskurKamuMemur(mockFetch, { referenceDate: '2026-11-26' });
    expect(fetched.activeCitiesCount).toBe(1);
    expect(fetched.items).toHaveLength(1);
    expect(fetched.errors).toHaveLength(0);
  });

  it('aggregates all V2 sources, filters Resmi Gazete noise, and tracks checkpoints', async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/ilan/GetIseAlimPage')) {
        return new Response(
          JSON.stringify({
            searchIlan: [
              {
                guid: 'kk-v2-1',
                kurumAdi: 'REKABET KURUMU BAŞKANLIĞI',
                birimAdi: 'PERSONEL DAİRESİ',
                ilanBaslik: '55 Rekabet Uzman Yardımcısı Alımı',
                ilanTuru: 'Memur Alımı',
                basTarih: '2026-11-26T00:00:00',
                bitTarih: '2026-12-21T23:59:00',
                basvuruLinki: 'https://turkiye.gov.tr/rekabet',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('kamuilan.sbb.gov.tr')) {
        return new Response(
          `<ul id="nav2"><li><div class="cbp_tmlabel"><a href="ilanDetay.aspx?kod=SBB1">
            <img src="./l.png#26.11.2026 00:00:00" />
            <p class="alt_p1">REKABET KURUMU BAŞKANLIĞI</p>
            <p class="alt_p2">55 REKABET UZMAN YARDIMCISI ALACAK<em> ( 26 Kasım - 21 Aralık) </em></p>
          </a></div></li></ul>`,
          { status: 200 }
        );
      }
      if (url.includes('iskur.gov.tr')) {
        return new Response('<svg></svg>', { status: 200 });
      }
      if (url.includes('resmigazete.gov.tr')) {
        return new Response(
          `
            <div class="fihrist-item" data-deadline="2026-12-20">
              <a href="/eskiler/2026/11/rg-aym.htm">Anayasa Mahkemesinin 25/6/2026 Tarihli Kararı</a>
            </div>
            <div class="fihrist-item" data-deadline="2026-12-25">
              <a href="/ilanlar/2026/11/rg-adalet.pdf">T.C. Adalet Bakanlığı - Sözleşmeli Zabıt Katibi Personel Alım İlanı</a>
            </div>
          `,
          { status: 200 }
        );
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await fetchAllOfficialSourcesV2(mockFetch, { referenceDate: '2026-11-26' });
    expect(result.errors).toHaveLength(0);
    expect(result.rawCount).toBe(3); // 1 KK + 1 SBB + 1 filtered RG (AYM dropped!)
    expect(result.dedupedCount).toBe(2); // KK + SBB merged!
    expect(result.sourceCheckpoints).toHaveLength(4);
    const rekabet = result.items.find((i) => i.institution.includes('REKABET KURUMU'));
    expect(rekabet?.verifiedSources?.map((s) => s.source)).toEqual(['kariyer_kapisi', 'sbb']);
  });
});
