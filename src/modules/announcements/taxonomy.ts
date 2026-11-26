import { normalizeTrSearch, toTurkishUpper } from '@/lib/turkish';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementSource,
  EmploymentType,
  ExamType,
  NoticeType,
  VerifiedSourceRef,
} from './types';

const TURKISH_PROVINCES = [
  'ADANA',
  'ADIYAMAN',
  'AFYONKARAHİSAR',
  'AĞRI',
  'AKSARAY',
  'AMASYA',
  'ANKARA',
  'ANTALYA',
  'ARDAHAN',
  'ARTVİN',
  'AYDIN',
  'BALIKESİR',
  'BARTIN',
  'BATMAN',
  'BAYBURT',
  'BİLECİK',
  'BİNGÖL',
  'BİTLİS',
  'BOLU',
  'BURDUR',
  'BURSA',
  'ÇANAKKALE',
  'ÇANKIRI',
  'ÇORUM',
  'DENİZLİ',
  'DİYARBAKIR',
  'DÜZCE',
  'EDİRNE',
  'ELAZIĞ',
  'ERZİNCAN',
  'ERZURUM',
  'ESKİŞEHİR',
  'GAZİANTEP',
  'GİRESUN',
  'GÜMÜŞHANE',
  'HAKKARİ',
  'HATAY',
  'IĞDIR',
  'ISPARTA',
  'İSTANBUL',
  'İZMİR',
  'KAHRAMANMARAŞ',
  'KARABÜK',
  'KARAMAN',
  'KARS',
  'KASTAMONU',
  'KAYSERİ',
  'KIRIKKALE',
  'KIRKLARELİ',
  'KIRŞEHİR',
  'KİLİS',
  'KOCAELİ',
  'KONYA',
  'KÜTAHYA',
  'MALATYA',
  'MANİSA',
  'MARDİN',
  'MERSİN',
  'MUĞLA',
  'MUŞ',
  'NEVŞEHİR',
  'NİĞDE',
  'ORDU',
  'OSMANİYE',
  'RİZE',
  'SAKARYA',
  'SAMSUN',
  'SİİRT',
  'SİNOP',
  'SİVAS',
  'ŞANLIURFA',
  'ŞIRNAK',
  'TEKİRDAĞ',
  'TOKAT',
  'TRABZON',
  'TUNCELİ',
  'UŞAK',
  'VAN',
  'YALOVA',
  'YOZGAT',
  'ZONGULDAK',
] as const;

const PROVINCE_BY_NORM = new Map<string, string>(
  TURKISH_PROVINCES.map((province) => [normalizeTrSearch(province), province])
);

const PROVINCE_ALIASES: Record<string, string> = {
  afyon: 'AFYONKARAHİSAR',
  icel: 'MERSİN',
  maras: 'KAHRAMANMARAŞ',
  urfa: 'ŞANLIURFA',
  antep: 'GAZİANTEP',
  izmit: 'KOCAELİ',
  adapazari: 'SAKARYA',
  antakya: 'HATAY',
};

const NAMED_INSTITUTION_TO_PROVINCE: Array<[string, string]> = [
  ['bogazici', 'İSTANBUL'],
  ['istanbul teknik', 'İSTANBUL'],
  ['yildiz teknik', 'İSTANBUL'],
  ['turk alman', 'İSTANBUL'],
  ['marmara universitesi', 'İSTANBUL'],
  ['mimar sinan', 'İSTANBUL'],
  ['galatasaray universitesi', 'İSTANBUL'],
  ['istanbul medeniyet', 'İSTANBUL'],
  ['saglik bilimleri universitesi', 'İSTANBUL'],
  ['cerrahpasa', 'İSTANBUL'],
  ['istanbul universitesi', 'İSTANBUL'],
  ['orta dogu teknik', 'ANKARA'],
  ['odtu', 'ANKARA'],
  ['hacettepe', 'ANKARA'],
  ['gazi universitesi', 'ANKARA'],
  ['yildirim beyazit', 'ANKARA'],
  ['haci bayram veli', 'ANKARA'],
  ['ankara sosyal bilimler', 'ANKARA'],
  ['ankara muzik ve guzel sanatlar', 'ANKARA'],
  ['ankara universitesi', 'ANKARA'],
  ['rekabet kurumu', 'ANKARA'],
  ['kamu ihale kurumu', 'ANKARA'],
  ['ege universitesi', 'İZMİR'],
  ['dokuz eylul', 'İZMİR'],
  ['katip celebi', 'İZMİR'],
  ['izmir yuksek teknoloji', 'İZMİR'],
  ['bakircay', 'İZMİR'],
  ['izmir demokrasi', 'İZMİR'],
  ['karamanoglu mehmetbey', 'KARAMAN'],
  ['sutcu imam', 'KAHRAMANMARAŞ'],
  ['kahramanmaras istiklal', 'KAHRAMANMARAŞ'],
  ['akdeniz universitesi', 'ANTALYA'],
  ['alanya alaaddin keykubat', 'ANTALYA'],
  ['uludag universitesi', 'BURSA'],
  ['bursa uludag', 'BURSA'],
  ['bursa teknik', 'BURSA'],
  ['erciyes universitesi', 'KAYSERİ'],
  ['abdullah gul', 'KAYSERİ'],
  ['kayseri universitesi', 'KAYSERİ'],
  ['selcuk universitesi', 'KONYA'],
  ['necmettin erbakan', 'KONYA'],
  ['konya teknik', 'KONYA'],
  ['ataturk universitesi', 'ERZURUM'],
  ['erzurum teknik', 'ERZURUM'],
  ['karadeniz teknik', 'TRABZON'],
  ['trabzon universitesi', 'TRABZON'],
  ['ondokuz mayis', 'SAMSUN'],
  ['samsun universitesi', 'SAMSUN'],
  ['cukurova universitesi', 'ADANA'],
  ['alparslan turkes', 'ADANA'],
  ['firat universitesi', 'ELAZIĞ'],
  ['inonu universitesi', 'MALATYA'],
  ['malatya turgut ozal', 'MALATYA'],
  ['dicle universitesi', 'DİYARBAKIR'],
  ['harran universitesi', 'ŞANLIURFA'],
  ['namik kemal', 'TEKİRDAĞ'],
  ['trakya universitesi', 'EDİRNE'],
  ['pamukkale universitesi', 'DENİZLİ'],
  ['anadolu universitesi', 'ESKİŞEHİR'],
  ['osmangazi universitesi', 'ESKİŞEHİR'],
  ['eskisehir teknik', 'ESKİŞEHİR'],
  ['cumhuriyet universitesi', 'SİVAS'],
  ['sivas bilim ve teknoloji', 'SİVAS'],
  ['suleyman demirel', 'ISPARTA'],
  ['isparta uygulamali bilimler', 'ISPARTA'],
  ['mugla sitki kocman', 'MUĞLA'],
  ['sitki kocman', 'MUĞLA'],
  ['celal bayar', 'MANİSA'],
  ['adnan menderes', 'AYDIN'],
  ['abant izzet baysal', 'BOLU'],
  ['mustafa kemal universitesi', 'HATAY'],
  ['iskenderun teknik', 'HATAY'],
  ['mehmet akif ersoy', 'BURDUR'],
  ['onsekiz mart', 'ÇANAKKALE'],
  ['hitit universitesi', 'ÇORUM'],
  ['kafkas universitesi', 'KARS'],
  ['dumlupinar universitesi', 'KÜTAHYA'],
  ['kutahya saglik bilimleri', 'KÜTAHYA'],
  ['bozok universitesi', 'YOZGAT'],
  ['ahi evran', 'KIRŞEHİR'],
  ['omer halisdemir', 'NİĞDE'],
  ['haci bektas veli', 'NEVŞEHİR'],
  ['seyh edebali', 'BİLECİK'],
  ['afyon kocatepe', 'AFYONKARAHİSAR'],
  ['tokat gaziosmanpasa', 'TOKAT'],
  ['bulent ecevit', 'ZONGULDAK'],
  ['recep tayyip erdogan universitesi', 'RİZE'],
  ['gebze teknik', 'KOCAELİ'],
  ['kocaeli universitesi', 'KOCAELİ'],
  ['sakarya universitesi', 'SAKARYA'],
  ['van yuzuncu yil', 'VAN'],
  ['yuzuncu yil universitesi', 'VAN'],
  ['bandirma onyedi eylul', 'BALIKESİR'],
  ['korkut ata universitesi', 'OSMANİYE'],
  ['mus alparslan', 'MUŞ'],
  ['bitlis eren', 'BİTLİS'],
  ['munzur universitesi', 'TUNCELİ'],
  ['artuklu universitesi', 'MARDİN'],
  ['artvin coruh', 'ARTVİN'],
  ['cankiri karatekin', 'ÇANKIRI'],
  ['kilis 7 aralik', 'KİLİS'],
  ['ibrahim cecen', 'AĞRI'],
  ['binali yildirim', 'ERZİNCAN'],
  ['mersin universitesi', 'MERSİN'],
  ['tarsus universitesi', 'MERSİN'],
];

const DISTRICT_TO_PROVINCE: Record<string, string> = {
  // Istanbul
  kadikoy: 'İSTANBUL',
  besiktas: 'İSTANBUL',
  uskudar: 'İSTANBUL',
  sisli: 'İSTANBUL',
  fatih: 'İSTANBUL',
  beyoglu: 'İSTANBUL',
  bakirkoy: 'İSTANBUL',
  atasehir: 'İSTANBUL',
  maltepe: 'İSTANBUL',
  kartal: 'İSTANBUL',
  pendik: 'İSTANBUL',
  tuzla: 'İSTANBUL',
  umraniye: 'İSTANBUL',
  beykoz: 'İSTANBUL',
  sariyer: 'İSTANBUL',
  eyupsultan: 'İSTANBUL',
  bahcelievler: 'İSTANBUL',
  bagcilar: 'İSTANBUL',
  kucukcekmece: 'İSTANBUL',
  buyukcekmece: 'İSTANBUL',
  avcilar: 'İSTANBUL',
  esenyurt: 'İSTANBUL',
  basaksehir: 'İSTANBUL',
  zeytinburnu: 'İSTANBUL',
  beylikduzu: 'İSTANBUL',
  gungoren: 'İSTANBUL',
  esenler: 'İSTANBUL',
  kagithane: 'İSTANBUL',
  gaziosmanpasa: 'İSTANBUL',
  sancaktepe: 'İSTANBUL',
  sultanbeyli: 'İSTANBUL',
  sultangazi: 'İSTANBUL',
  arnavutkoy: 'İSTANBUL',
  catalca: 'İSTANBUL',
  silivri: 'İSTANBUL',
  cekmekoy: 'İSTANBUL',
  // Ankara
  cankaya: 'ANKARA',
  yenimahalle: 'ANKARA',
  kecioren: 'ANKARA',
  mamak: 'ANKARA',
  etimesgut: 'ANKARA',
  sincan: 'ANKARA',
  altindag: 'ANKARA',
  pursaklar: 'ANKARA',
  polatli: 'ANKARA',
  beypazari: 'ANKARA',
  kahramankazan: 'ANKARA',
  elmadag: 'ANKARA',
  // Izmir
  karabaglar: 'İZMİR',
  konak: 'İZMİR',
  bornova: 'İZMİR',
  buca: 'İZMİR',
  karsiyaka: 'İZMİR',
  bayrakli: 'İZMİR',
  cigli: 'İZMİR',
  gaziemir: 'İZMİR',
  balcova: 'İZMİR',
  narlidere: 'İZMİR',
  guzelbahce: 'İZMİR',
  menemen: 'İZMİR',
  torbali: 'İZMİR',
  aliaga: 'İZMİR',
  odemis: 'İZMİR',
  bergama: 'İZMİR',
  cesme: 'İZMİR',
  urla: 'İZMİR',
  seferihisar: 'İZMİR',
  // Bursa
  yildirim: 'BURSA',
  nilufer: 'BURSA',
  osmangazi: 'BURSA',
  inegol: 'BURSA',
  gemlik: 'BURSA',
  mudanya: 'BURSA',
  mustafakemalpasa: 'BURSA',
  karacabey: 'BURSA',
  gursu: 'BURSA',
  kestel: 'BURSA',
  orhangazi: 'BURSA',
  // Antalya
  muratpasa: 'ANTALYA',
  kepez: 'ANTALYA',
  konyaalti: 'ANTALYA',
  alanya: 'ANTALYA',
  manavgat: 'ANTALYA',
  serik: 'ANTALYA',
  kumluca: 'ANTALYA',
  dosemealti: 'ANTALYA',
  // Adana
  seyhan: 'ADANA',
  cukurova: 'ADANA',
  yuregir: 'ADANA',
  saricam: 'ADANA',
  ceyhan: 'ADANA',
  kozan: 'ADANA',
  // Konya
  selcuklu: 'KONYA',
  meram: 'KONYA',
  karatay: 'KONYA',
  // Gaziantep
  sahinbey: 'GAZİANTEP',
  sehitkamil: 'GAZİANTEP',
  nizip: 'GAZİANTEP',
  // Kocaeli
  gebze: 'KOCAELİ',
  darica: 'KOCAELİ',
  korfez: 'KOCAELİ',
  golcuk: 'KOCAELİ',
  derince: 'KOCAELİ',
  kartepe: 'KOCAELİ',
  basiskele: 'KOCAELİ',
  cayirova: 'KOCAELİ',
  // Eskisehir
  tepebasi: 'ESKİŞEHİR',
  odunpazari: 'ESKİŞEHİR',
  // Kayseri
  melikgazi: 'KAYSERİ',
  kocasinan: 'KAYSERİ',
  talas: 'KAYSERİ',
  // Samsun
  ilkadim: 'SAMSUN',
  atakum: 'SAMSUN',
  canik: 'SAMSUN',
  bafra: 'SAMSUN',
  carsamba: 'SAMSUN',
  // Trabzon
  ortahisar: 'TRABZON',
  akcaabat: 'TRABZON',
  // Diyarbakir
  kayapinar: 'DİYARBAKIR',
  baglar: 'DİYARBAKIR',
  // Sanliurfa
  haliliye: 'ŞANLIURFA',
  eyyubiye: 'ŞANLIURFA',
  karakopru: 'ŞANLIURFA',
  siverek: 'ŞANLIURFA',
  // Kahramanmaras
  onikisubat: 'KAHRAMANMARAŞ',
  dulkadiroglu: 'KAHRAMANMARAŞ',
  elbistan: 'KAHRAMANMARAŞ',
  // Hatay
  iskenderun: 'HATAY',
  defne: 'HATAY',
  dortyol: 'HATAY',
  // Aydin
  efeler: 'AYDIN',
  kusadasi: 'AYDIN',
  nazilli: 'AYDIN',
  soke: 'AYDIN',
  // Mugla
  mentese: 'MUĞLA',
  bodrum: 'MUĞLA',
  fethiye: 'MUĞLA',
  marmaris: 'MUĞLA',
  milas: 'MUĞLA',
  ortaca: 'MUĞLA',
  datca: 'MUĞLA',
  // Denizli
  pamukkale: 'DENİZLİ',
  merkezefendi: 'DENİZLİ',
  // Tekirdag
  suleymanpasa: 'TEKİRDAĞ',
  corlu: 'TEKİRDAĞ',
  cerkezkoy: 'TEKİRDAĞ',
  // Balikesir
  karesi: 'BALIKESİR',
  altieylul: 'BALIKESİR',
  bandirma: 'BALIKESİR',
  ayvalik: 'BALIKESİR',
  // Manisa
  yunusemre: 'MANİSA',
  sehzadeler: 'MANİSA',
  akhisar: 'MANİSA',
  turgutlu: 'MANİSA',
  salihli: 'MANİSA',
  // Malatya
  battalgazi: 'MALATYA',
  // Erzurum
  yakutiye: 'ERZURUM',
  palandoken: 'ERZURUM',
  aziziye: 'ERZURUM',
  // Sakarya
  serdivan: 'SAKARYA',
  erenler: 'SAKARYA',
  arifiye: 'SAKARYA',
  // Other distinct districts
  eleskirt: 'AĞRI',
  dogubayazit: 'AĞRI',
  patnos: 'AĞRI',
  kesan: 'EDİRNE',
  uzunkopru: 'EDİRNE',
  gerede: 'BOLU',
  gelibolu: 'ÇANAKKALE',
  biga: 'ÇANAKKALE',
  egirdir: 'ISPARTA',
  yalvac: 'ISPARTA',
  artuklu: 'MARDİN',
  kiziltepe: 'MARDİN',
  midyat: 'MARDİN',
  nusaybin: 'MARDİN',
  karadeniz_eregli: 'ZONGULDAK',
  caycuma: 'ZONGULDAK',
  ipekyolu: 'VAN',
  tusba: 'VAN',
  merkez_mersin: 'MERSİN',
  tarsus: 'MERSİN',
};

const TURKISH_MONTHS: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
};

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWordPhrase(normalizedText: string, phrase: string): boolean {
  if (!normalizedText || !phrase) return false;
  const regex = new RegExp(`(?:^|\\s)${escapeRegex(phrase)}(?:$|\\s)`);
  return regex.test(normalizedText);
}

function findProvinceInNormalizedText(norm: string): string | null {
  if (!norm) return null;

  for (const [pattern, province] of NAMED_INSTITUTION_TO_PROVINCE) {
    if (hasWordPhrase(norm, pattern)) {
      return province;
    }
  }

  for (const [normProv, canonical] of PROVINCE_BY_NORM.entries()) {
    if (hasWordPhrase(norm, normProv)) {
      return canonical;
    }
  }

  for (const [alias, canonical] of Object.entries(PROVINCE_ALIASES)) {
    if (hasWordPhrase(norm, alias)) {
      return canonical;
    }
  }

  for (const [districtKey, canonical] of Object.entries(DISTRICT_TO_PROVINCE)) {
    const phrase = districtKey.replace(/_/g, ' ');
    if (hasWordPhrase(norm, phrase)) {
      return canonical;
    }
  }

  return null;
}

/**
 * Splits structured location labels such as `BURSA / YILDIRIM` or `ADANA DT`
 * into canonical Turkish province and optional district names.
 */
export function parseCityAndDistrict(
  rawLocation: string | null | undefined,
  fallbackInstitution = '',
  fallbackText = ''
): { city: string; district: string | null } {
  const cleaned = (rawLocation ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return {
      city: inferCityFromInstitutionOrText(fallbackInstitution, fallbackText),
      district: null,
    };
  }

  const slashParts = cleaned.split('/').map((part) => part.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    const leftUpper = toTurkishUpper(slashParts[0]);
    const rightUpper = toTurkishUpper(slashParts.slice(1).join(' / '));
    const inferredLeft =
      PROVINCE_BY_NORM.get(normalizeTrSearch(leftUpper)) ??
      findProvinceInNormalizedText(normalizeTrSearch(leftUpper));
    if (inferredLeft) {
      return {
        city: inferredLeft,
        district: rightUpper && rightUpper !== 'MERKEZ' ? rightUpper : null,
      };
    }
  }

  const dtStripped = cleaned.replace(/\s+DT$/i, '').trim();
  const normLoc = normalizeTrSearch(dtStripped);
  if (normLoc === 'merkez' || normLoc === 'turkiye geneli' || normLoc === 'genel') {
    return {
      city: inferCityFromInstitutionOrText(fallbackInstitution, fallbackText),
      district: null,
    };
  }

  const directProvince =
    PROVINCE_BY_NORM.get(normLoc) ?? findProvinceInNormalizedText(normLoc);
  if (directProvince) {
    return { city: directProvince, district: null };
  }

  return {
    city: inferCityFromInstitutionOrText(fallbackInstitution, `${cleaned} ${fallbackText}`),
    district: null,
  };
}

/**
 * Infers the canonical Turkish province from an institution name and optional text.
 * Checks institution first so central/university names override incidental text mentions.
 */
export function inferCityFromInstitutionOrText(
  institution: string,
  text = ''
): string {
  const instNorm = normalizeTrSearch(institution);
  const instSlashMatch = institution.split('/').map((part) => part.trim());
  if (instSlashMatch.length >= 2) {
    const leftProvince =
      PROVINCE_BY_NORM.get(normalizeTrSearch(instSlashMatch[0])) ??
      findProvinceInNormalizedText(normalizeTrSearch(instSlashMatch[0]));
    if (leftProvince) return leftProvince;
  }

  const fromInstitution = findProvinceInNormalizedText(instNorm);
  if (fromInstitution) return fromInstitution;

  const textNorm = normalizeTrSearch(text);
  const fromText = findProvinceInNormalizedText(textNorm);
  if (fromText) return fromText;

  return 'TÜRKİYE GENELİ';
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface ParsedDateToken {
  year: number | null;
  month: number;
  day: number;
}

function parseSingleTurkishToken(rawToken: string): ParsedDateToken | null {
  const numeric = rawToken.trim().match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}))?$/);
  if (numeric) {
    return {
      day: Number(numeric[1]),
      month: Number(numeric[2]),
      year: numeric[3] ? Number(numeric[3]) : null,
    };
  }

  const iso = rawToken.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  const norm = normalizeTrSearch(rawToken);
  const named = norm.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (named) {
    const month = TURKISH_MONTHS[named[2]];
    if (month) {
      return {
        day: Number(named[1]),
        month,
        year: named[3] ? Number(named[3]) : null,
      };
    }
  }

  return null;
}

/**
 * Parses Turkish date ranges such as `"26 Kasım - 10 Aralık"`, `"20 Aralık - 05 Ocak"`,
 * and `"28.11.2026 - 12.12.2026"` into ISO YYYY-MM-DD bounds, handling Dec->Jan rollover.
 */
export function parseTurkishDateRange(
  raw: string,
  referenceYear = new Date().getUTCFullYear()
): { startDate: string | null; endDate: string | null } {
  if (!raw || typeof raw !== 'string') {
    return { startDate: null, endDate: null };
  }

  const cleaned = raw.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const rangeParts = cleaned.split(/\s*[-\u2013\u2014]\s*/);

  if (rangeParts.length >= 2) {
    const startToken = parseSingleTurkishToken(rangeParts[0]);
    const endToken = parseSingleTurkishToken(rangeParts[1]);

    if (startToken && endToken) {
      const startYear = startToken.year ?? referenceYear;
      let endYear = endToken.year ?? startYear;
      if (endToken.year === null && endToken.month < startToken.month) {
        endYear = startYear + 1;
      }
      return {
        startDate: formatIsoDate(startYear, startToken.month, startToken.day),
        endDate: formatIsoDate(endYear, endToken.month, endToken.day),
      };
    }
  }

  const single = parseSingleTurkishToken(cleaned);
  if (single) {
    const iso = formatIsoDate(single.year ?? referenceYear, single.month, single.day);
    return { startDate: iso, endDate: iso };
  }

  return { startDate: null, endDate: null };
}

export interface ClassifyAnnouncementInput {
  source?: AnnouncementSource;
  institution?: string;
  title: string;
  rawType?: string | null;
  description?: string | null;
  evaluationSteps?: Array<{
    asamaAdi?: string | null;
    turu?: string | null;
    sinavsizAsama?: number | null;
  }>;
}

export interface AnnouncementClassification {
  category: AnnouncementCategory;
  employmentType: EmploymentType;
  noticeType: NoticeType;
  examType: ExamType;
}

function detectNoticeType(headNorm: string): NoticeType {
  if (
    hasWordPhrase(headNorm, 'iptal') ||
    headNorm.includes('iptal ilani') ||
    headNorm.includes('ilan iptal')
  ) {
    return 'iptal';
  }
  if (
    hasWordPhrase(headNorm, 'duzeltme') ||
    headNorm.includes('duzeltme ilani') ||
    headNorm.includes('zeyilname')
  ) {
    return 'duzeltme';
  }
  if (
    headNorm.includes('sonuclari') ||
    headNorm.includes('sonuc ilani') ||
    headNorm.includes('hak kazananlar') ||
    headNorm.includes('nihai liste') ||
    headNorm.includes('asil ve yedek') ||
    hasWordPhrase(headNorm, 'kazananlar')
  ) {
    return 'sonuc';
  }
  return 'ilan';
}

function detectExamType(
  fullNorm: string,
  evaluationSteps?: ClassifyAnnouncementInput['evaluationSteps']
): ExamType {
  if (evaluationSteps && evaluationSteps.length > 0) {
    const stepNorms = evaluationSteps.map((step) =>
      normalizeTrSearch(`${step.asamaAdi ?? ''} ${step.turu ?? ''}`)
    );
    const hasWritten = stepNorms.some((s) => s.includes('yazili'));
    const hasOral = stepNorms.some((s) => s.includes('sozlu') || s.includes('mulakat'));
    const hasPractice = stepNorms.some(
      (s) =>
        s.includes('uygulamali') ||
        s.includes('uygulama') ||
        s.includes('performans') ||
        s.includes('yeterlilik')
    );
    const hasKpss = stepNorms.some((s) => s.includes('kpss'));

    if (hasWritten && hasOral) return 'written_and_oral';
    if (hasPractice) return 'practice_exam';
    if (hasOral) return 'oral_exam';
    if (hasKpss) return 'kpss_only';
  }

  if (
    fullNorm.includes('yazili ve sozlu') ||
    (fullNorm.includes('yazili sinav') &&
      (fullNorm.includes('sozlu sinav') || fullNorm.includes('mulakat')))
  ) {
    return 'written_and_oral';
  }

  if (
    fullNorm.includes('uygulamali sinav') ||
    fullNorm.includes('uygulama sinavi') ||
    fullNorm.includes('sozlu uygulamali') ||
    fullNorm.includes('direksiyon sinavi') ||
    fullNorm.includes('fiziki yeterlilik') ||
    fullNorm.includes('parkur sinavi')
  ) {
    return 'practice_exam';
  }

  const explicitlyInterviewFree =
    fullNorm.includes('mulakatsiz') ||
    fullNorm.includes('mulakat yapilmaksizin') ||
    fullNorm.includes('sozlu sinav yapilmaksizin') ||
    fullNorm.includes('sozlu yapilmaksizin');

  if (explicitlyInterviewFree) {
    return 'kpss_only';
  }

  if (
    fullNorm.includes('sozlu sinav') ||
    fullNorm.includes('mulakat') ||
    fullNorm.includes('sozlu degerlendirme')
  ) {
    return 'oral_exam';
  }

  if (
    fullNorm.includes('kpss b grubu puan siralamasi') ||
    fullNorm.includes('kpss puan siralamasi') ||
    fullNorm.includes('kpss puan ustunlugu') ||
    fullNorm.includes('kpss puanina gore') ||
    (fullNorm.includes('kpss') && fullNorm.includes('sinavsiz'))
  ) {
    return 'kpss_only';
  }

  return 'unspecified';
}

function detectEmploymentType(
  source: AnnouncementSource | undefined,
  instNorm: string,
  headNorm: string,
  fullNorm: string
): EmploymentType {
  if (
    fullNorm.includes('gorevde yukselme') ||
    fullNorm.includes('unvan degisikligi') ||
    fullNorm.includes('unvan yukselmesi')
  ) {
    return 'gorevde_yukselme';
  }

  if (
    headNorm.includes('ogretim uyesi') ||
    headNorm.includes('ogretim gorevlisi') ||
    headNorm.includes('ogretim elemani') ||
    headNorm.includes('arastirma gorevlisi') ||
    headNorm.includes('akademik personel') ||
    headNorm.includes('doktor ogretim uyesi') ||
    headNorm.includes('profesor') ||
    headNorm.includes('docent') ||
    fullNorm.includes('2547 sayili')
  ) {
    return 'akademik';
  }

  const isUniformedMilitaryOrSecurity =
    headNorm.includes('subay') ||
    headNorm.includes('astsubay') ||
    headNorm.includes('uzman erbas') ||
    headNorm.includes('uzman cavus') ||
    headNorm.includes('sozlesmeli er') ||
    headNorm.includes('polis memuru') ||
    headNorm.includes('pomem') ||
    headNorm.includes('pmyo') ||
    headNorm.includes('carsi ve mahalle bekcisi') ||
    headNorm.includes('bekci alim') ||
    ((instNorm.includes('jandarma') ||
      instNorm.includes('sahil guvenlik') ||
      instNorm.includes('milli savunma') ||
      instNorm.includes('emniyet genel')) &&
      !headNorm.includes('devlet memuru') &&
      !headNorm.includes('sozlesmeli') &&
      !headNorm.includes('isci'));

  if (isUniformedMilitaryOrSecurity) {
    return 'askeri_guvenlik';
  }

  if (
    headNorm.includes('surekli isci') ||
    headNorm.includes('gecici isci') ||
    headNorm.includes('daimi isci') ||
    headNorm.includes('isci alim') ||
    headNorm.includes('kamu iscisi') ||
    headNorm.includes('eski hukumlu') ||
    headNorm.includes('engelli isci')
  ) {
    return 'isci';
  }

  if (
    headNorm.includes('sozlesmeli') ||
    headNorm.includes('4 b') ||
    fullNorm.includes('4 uncu maddesinin b') ||
    fullNorm.includes('4 uncu maddesinin (b)') ||
    fullNorm.includes('657 sayili kanunun 4 b') ||
    fullNorm.includes('sozlesmeli personel calistirilmasina')
  ) {
    return 'sozlesmeli_4b';
  }

  if (
    headNorm.includes('mufettis yardimci') ||
    headNorm.includes('uzman yardimci') ||
    headNorm.includes('denetmen yardimci') ||
    headNorm.includes('kontrolor yardimci') ||
    headNorm.includes('kaymakam') ||
    headNorm.includes('hakim') ||
    headNorm.includes('savci') ||
    headNorm.includes('kariyer meslek') ||
    headNorm.includes('a grubu') ||
    headNorm.includes('vergi mufettis') ||
    headNorm.includes('sayistay denetci')
  ) {
    return 'memur_a';
  }

  if (
    headNorm.includes('devlet memuru') ||
    headNorm.includes('aciktan memur') ||
    headNorm.includes('zabita memuru') ||
    headNorm.includes('itfaiye eri') ||
    headNorm.includes('memur alim') ||
    hasWordPhrase(headNorm, 'memur') ||
    headNorm.includes('b grubu')
  ) {
    return 'memur_b';
  }

  if (source === 'iskur') {
    return 'isci';
  }

  return 'diger';
}

function detectCategory(
  headNorm: string,
  employmentType: EmploymentType,
  source?: AnnouncementSource
): AnnouncementCategory {
  if (
    headNorm.includes('gorevlendirme') ||
    headNorm.includes('gecici gorev') ||
    headNorm.includes('vekalet') ||
    headNorm.includes('yurt disi egitim') ||
    employmentType === 'gorevde_yukselme'
  ) {
    return 'gorevlendirme';
  }

  if (
    headNorm.includes('atama') ||
    headNorm.includes('yerlestirme') ||
    headNorm.includes('merkezi yerlestirme')
  ) {
    return 'atama';
  }

  if (
    source === 'resmi_gazete' &&
    (headNorm.includes('kaymakam') || headNorm.includes('hakim') || headNorm.includes('savci'))
  ) {
    return 'atama';
  }

  return 'personel_alimi';
}

/**
 * Classifies an announcement into category, employment type, notice type, and exam type.
 */
export function classifyAnnouncement(
  input: ClassifyAnnouncementInput
): AnnouncementClassification {
  const instNorm = normalizeTrSearch(input.institution ?? '');
  const headNorm = normalizeTrSearch(`${input.title} ${input.rawType ?? ''}`);
  const fullNorm = normalizeTrSearch(
    `${input.institution ?? ''} ${input.title} ${input.rawType ?? ''} ${input.description ?? ''}`
  );

  const noticeType = detectNoticeType(headNorm);
  const employmentType = detectEmploymentType(input.source, instNorm, headNorm, fullNorm);
  const examType = detectExamType(fullNorm, input.evaluationSteps);
  const category = detectCategory(headNorm, employmentType, input.source);

  return {
    category,
    employmentType,
    noticeType,
    examType,
  };
}

/**
 * Positive filter for Resmi Gazete fihrist items: keeps real public recruitment
 * announcements while dropping unrelated regulations, communiques, court rulings, and tenders.
 */
export function isPublicRecruitmentResmiGazeteItem(
  title: string,
  description = ''
): boolean {
  const norm = normalizeTrSearch(`${title} ${description}`);
  if (!norm) return false;

  const explicitRecruitmentPhrase =
    norm.includes('alim ilani') ||
    norm.includes('alimi ilani') ||
    norm.includes('personel alim') ||
    norm.includes('memur alim') ||
    norm.includes('isci alim') ||
    norm.includes('sozlesmeli personel') ||
    norm.includes('ogretim uyesi') ||
    norm.includes('ogretim gorevlisi') ||
    norm.includes('arastirma gorevlisi') ||
    norm.includes('ogretim elemani') ||
    norm.includes('mufettis yardimci') ||
    norm.includes('uzman yardimci') ||
    norm.includes('denetmen yardimci') ||
    norm.includes('kaymakam aday') ||
    norm.includes('hakim ve savci') ||
    norm.includes('giris sinavi') ||
    norm.includes('alinacaktir') ||
    norm.includes('personel istihdami');

  const unrelatedOfficialNoise =
    norm.includes('anayasa mahkemesi') ||
    norm.includes('yonetmeligi') ||
    norm.includes('yonetmeliginin') ||
    norm.includes('yonetmelik') ||
    norm.includes('teblig') ||
    norm.includes('tebligi') ||
    norm.includes('yargi ilani') ||
    norm.includes('ihale ilani') ||
    norm.includes('artirma eksiltme') ||
    norm.includes('konkordato') ||
    norm.includes('iflas') ||
    norm.includes('ithalatta haksiz rekabet');

  if (unrelatedOfficialNoise && !explicitRecruitmentPhrase) {
    return false;
  }

  const positiveKeywords = [
    'memur',
    'sozlesmeli',
    'personel',
    'ogretim uyesi',
    'ogretim gorevlisi',
    'arastirma gorevlisi',
    'ogretim elemani',
    'mufettis',
    'uzman yardimci',
    'kaymakam',
    'hakim',
    'savci',
    'atama',
    'isci alim',
    'sinav',
    'alinacaktir',
    'gorevlendirme',
  ];

  return positiveKeywords.some((kw) => norm.includes(kw));
}

/**
 * Computes a deterministic 16-hex-character FNV-1a 64-bit hash compatible with Workers & Node.
 */
export function computeContentHash(payload: unknown): string {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
  let hash = BigInt('0xcbf29ce484222325');
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');

  for (let i = 0; i < serialized.length; i++) {
    hash ^= BigInt(serialized.charCodeAt(i));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, '0');
}

const SOURCE_PRIORITY: Record<AnnouncementSource, number> = {
  kariyer_kapisi: 5,
  sbb: 4,
  iskur: 3,
  resmi_gazete: 2,
  osym_kpss: 1,
};

function normalizeInstitutionFingerprint(institution: string): string {
  return normalizeTrSearch(institution)
    .replace(/^t\s*c\s+/g, '')
    .replace(/\b(?:rektorlugu|baskanligi|genel mudurlugu|mudurlugu)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleFingerprint(title: string, institutionNorm: string): string {
  let norm = normalizeTrSearch(title);
  if (institutionNorm && norm.startsWith(institutionNorm)) {
    norm = norm.slice(institutionNorm.length).trim();
  }
  return norm
    .replace(/\b\d{1,2}\s+\d{1,2}\s+\d{4}\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/\b(?:adet|kisi|yili|aciktan)\b/g, ' ')
    .replace(/\b(?:alimi|alim ilani|alacak|alinacaktir|temini|duyurusu|ilani)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function utcDayFromIso(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

function areSameDedupeGroup(a: Announcement, b: Announcement): boolean {
  const instA = normalizeInstitutionFingerprint(a.institution);
  const instB = normalizeInstitutionFingerprint(b.institution);
  if (!instA || !instB || instA !== instB) return false;

  const titleA = normalizeTitleFingerprint(a.title, instA);
  const titleB = normalizeTitleFingerprint(b.title, instB);
  if (!titleA || !titleB) return false;

  const titleMatches =
    titleA === titleB ||
    (titleA.length >= 10 && titleB.includes(titleA)) ||
    (titleB.length >= 10 && titleA.includes(titleB));
  if (!titleMatches) return false;

  const dayA = utcDayFromIso(a.deadlineAt);
  const dayB = utcDayFromIso(b.deadlineAt);
  if (dayA !== null && dayB !== null) {
    return Math.abs(dayA - dayB) <= 3;
  }
  return true;
}

function mergeTwoAnnouncements(primary: Announcement, secondary: Announcement): Announcement {
  const primaryCityIsGeneric = !primary.city || primary.city === 'TÜRKİYE GENELİ';
  const secondaryCityIsConcrete = Boolean(secondary.city && secondary.city !== 'TÜRKİYE GENELİ');
  const mergedCity = primaryCityIsGeneric && secondaryCityIsConcrete ? secondary.city : primary.city;

  const refsMap = new Map<string, VerifiedSourceRef>();
  const addRefs = (item: Announcement) => {
    const refs = item.verifiedSources?.length
      ? item.verifiedSources
      : [{ source: item.source, sourceName: item.sourceName, url: item.sourceUrl }];
    for (const ref of refs) {
      const key = `${ref.source}|${ref.url}`;
      if (!refsMap.has(key)) refsMap.set(key, ref);
    }
  };
  addRefs(primary);
  addRefs(secondary);

  const mergedCities = Array.from(
    new Set(
      [...(primary.criteria.cities ?? []), ...(secondary.criteria.cities ?? []), mergedCity].filter(
        (c) => Boolean(c) && (mergedCity === 'TÜRKİYE GENELİ' || c !== 'TÜRKİYE GENELİ')
      )
    )
  );
  if (mergedCities.length === 0) mergedCities.push('TÜRKİYE GENELİ');

  const mergedCriteria = {
    educationLevels: Array.from(
      new Set([...primary.criteria.educationLevels, ...secondary.criteria.educationLevels])
    ),
    kpssScoreTypes: Array.from(
      new Set([...primary.criteria.kpssScoreTypes, ...secondary.criteria.kpssScoreTypes])
    ),
    minKpssScore: primary.criteria.minKpssScore ?? secondary.criteria.minKpssScore,
    cities: mergedCities,
    militaryRequired: primary.criteria.militaryRequired || secondary.criteria.militaryRequired,
    driverLicenses: Array.from(
      new Set([...primary.criteria.driverLicenses, ...secondary.criteria.driverLicenses])
    ),
    certificates: Array.from(
      new Set([...primary.criteria.certificates, ...secondary.criteria.certificates])
    ),
    qualificationCodes: Array.from(
      new Set([...primary.criteria.qualificationCodes, ...secondary.criteria.qualificationCodes])
    ),
    summaryLines:
      primary.criteria.summaryLines.length > 0
        ? primary.criteria.summaryLines
        : secondary.criteria.summaryLines,
  };

  return {
    ...primary,
    city: mergedCity,
    publishedAt: primary.publishedAt || secondary.publishedAt,
    deadlineAt: primary.deadlineAt || secondary.deadlineAt,
    quota: primary.quota ?? secondary.quota,
    summary:
      primary.summary && primary.summary.length >= (secondary.summary?.length ?? 0)
        ? primary.summary
        : secondary.summary || primary.summary,
    applyUrl: primary.applyUrl ?? secondary.applyUrl ?? null,
    organizationUnit: primary.organizationUnit ?? secondary.organizationUnit ?? null,
    positions: primary.positions ?? secondary.positions,
    positionsCount: primary.positionsCount ?? secondary.positionsCount,
    examType:
      primary.examType && primary.examType !== 'unspecified'
        ? primary.examType
        : secondary.examType ?? primary.examType,
    employmentType:
      primary.employmentType && primary.employmentType !== 'diger'
        ? primary.employmentType
        : secondary.employmentType ?? primary.employmentType,
    criteria: mergedCriteria,
    verifiedSources: Array.from(refsMap.values()),
  };
}

/**
 * Deduplicates announcements describing the same recruitment across multiple official sources,
 * preferring Kariyer Kapisi metadata while combining verified source links and filling gaps.
 */
export function mergeCrossSourceAnnouncements(items: Announcement[]): Announcement[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const prioDiff = (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0);
    if (prioDiff !== 0) return prioDiff;
    return (b.positions?.length ?? 0) - (a.positions?.length ?? 0);
  });

  const merged: Announcement[] = [];
  for (const candidate of sorted) {
    const existingIdx = merged.findIndex((item) => areSameDedupeGroup(item, candidate));
    if (existingIdx === -1) {
      const refs = candidate.verifiedSources?.length
        ? candidate.verifiedSources
        : [
            {
              source: candidate.source,
              sourceName: candidate.sourceName,
              url: candidate.sourceUrl,
            },
          ];
      merged.push({ ...candidate, verifiedSources: refs });
    } else {
      merged[existingIdx] = mergeTwoAnnouncements(merged[existingIdx], candidate);
    }
  }

  return merged;
}
