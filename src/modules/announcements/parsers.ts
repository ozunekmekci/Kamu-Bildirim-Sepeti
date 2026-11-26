import { DEPARTMENTS } from '@/data/departments';
import { normalizeTrSearch, toTurkishUpper } from '@/lib/turkish';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementCriteria,
  AnnouncementSource,
  AnnouncementStatus,
  FetchErrorItem,
  FetchOfficialResult,
} from './types';

export const OFFICIAL_SOURCE_URLS: Record<
  Exclude<AnnouncementSource, 'osym_kpss'>,
  { name: string; url: string; feedUrl?: string }
> = {
  kariyer_kapisi: {
    name: 'Kariyer Kapısı',
    url: 'https://kariyerkapisi.gov.tr',
    feedUrl: 'https://kariyerkapisi.gov.tr/RSS',
  },
  sbb: {
    name: 'SBB Kamu İlan',
    url: 'https://kamuilan.sbb.gov.tr/',
  },
  iskur: {
    name: 'İŞKUR',
    url: 'https://www.iskur.gov.tr/',
  },
  resmi_gazete: {
    name: 'Resmî Gazete',
    url: 'https://www.resmigazete.gov.tr/',
  },
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAttr(tagHtml: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tagHtml.match(regex);
  if (!match) return null;
  return decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '').trim() || null;
}

function extractByClassOrTag(block: string, classPatterns: string[]): string | null {
  for (const cls of classPatterns) {
    const classRegex = new RegExp(
      `<([a-z0-9]+)[^>]*class\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      'i'
    );
    const m = block.match(classRegex);
    if (m && m[2]) {
      const cleaned = stripTags(m[2]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

export function resolveUrl(href: string | null, baseUrl: string): string {
  if (!href) return baseUrl;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || /^(?:javascript|mailto|tel|data):/i.test(trimmed)) {
    return baseUrl;
  }
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return trimmed.startsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`;
  }
}

const RFC_MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function parseDateString(raw: string | null): string | null {
  if (!raw) return null;
  const isoMatch = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const trMatch = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (trMatch) {
    const [, d, m, y] = trMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const rfcMatch = raw.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i
  );
  if (rfcMatch) {
    const [, d, mon, y] = rfcMatch;
    const m = RFC_MONTHS[mon.slice(0, 3).toLowerCase()];
    if (m) {
      return `${y}-${m}-${d.padStart(2, '0')}`;
    }
  }
  return null;
}

function splitInstitutionAndTitle(rawTitle: string): { institution: string | null; title: string } {
  const cleaned = rawTitle.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return { institution: null, title: cleaned };
  const left = match[1].trim();
  const right = match[2].trim();
  const normLeft = normalizeTrSearch(left);
  const looksLikeInstitution =
    /^t\.?c\.?\b/.test(normLeft) ||
    /(?:bakanligi|baskanligi|mudurlugu|rektorlugu|dekanligi|kurumu|universitesi|belediyesi|valiligi|kaymakamligi|enstitusu|komutanligi|akademisi|genel\s+sekreterligi|ajansi|hastanesi|bankasi)\b/.test(
      normLeft
    );
  if (looksLikeInstitution && left.length >= 4 && right.length >= 4) {
    return { institution: left, title: right };
  }
  return { institution: null, title: cleaned };
}

function detectCategory(text: string, defaultCategory: AnnouncementCategory): AnnouncementCategory {
  const norm = normalizeTrSearch(text);
  if (norm.includes('gorevlendirme') || norm.includes('gecici gorev') || norm.includes('vekalet')) {
    return 'gorevlendirme';
  }
  if (norm.includes('atama') || norm.includes('yerlestirme')) {
    return 'atama';
  }
  if (norm.includes('personel alim') || norm.includes('isci alim') || norm.includes('sozlesmeli') || norm.includes('uzman yardimci')) {
    return 'personel_alimi';
  }
  return defaultCategory;
}

export function extractQuota(text: string): number | null {
  const m =
    text.match(/(?:kontenjan|kadro|alınacak\s+kişi|kişi\s*sayısı|adet)\s*[:\-]?\s*(\d{1,5})/i) ||
    text.match(
      /\b(\d{1,5})\s*(?:adet\s+)?(?:kişi|personel|memur|işçi|kadro|öğretim\s+(?:üyesi|görevlisi|elemanı)|araştırma\s+görevlisi|uzman\s+yardımcısı|müfettiş\s+yardımcısı|sözleşmeli\s+[a-zçğıöşü]+)/i
    );
  if (m) {
    const val = Number(m[1]);
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  const leading = text.match(/^\s*(\d{1,4})\s+(?:adet\s+)?[A-ZÇĞİÖŞÜa-zçğıöşü]/i);
  if (leading) {
    const val = Number(leading[1]);
    if (Number.isFinite(val) && val > 0 && !(val >= 1990 && val <= 2099)) {
      return val;
    }
  }
  return null;
}

function escapeRegexToken(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseValidKpssScore(raw: string | undefined): number | null {
  if (!raw) return null;
  const val = Number(raw.replace(',', '.'));
  if (!Number.isFinite(val) || val < 50 || val > 100) return null;
  return val;
}

function extractMinKpssScore(text: string): number | null {
  // 1. Explicit score wording, multi-line & OCR-tolerant (e.g. "En az\n65\npoan", "taban 70 puan")
  const explicitRegex =
    /(?:en\s+az|taban|asgari|baraj|kpss[^0-9]{0,25})\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:p[ou]a[nm]|ve\s+[üu]zeri|ve\s+[üu]st[üu])(?:\b|[^\p{L}])/giu;
  for (const m of text.matchAll(explicitRegex)) {
    const score = parseValidKpssScore(m[1]);
    if (score !== null) return score;
  }

  // 2. KPSS score type followed by "en az <score>" across spaces or newlines
  const scoreTypeEnAzRegex =
    /\b(?:kpss[\s\-/(]*)?(?:p-?3|p-?93|p-?94)\b[\s\S]{0,70}?\ben\s+az\s+(\d{2,3}(?:[.,]\d+)?)\b(?!\s*(?:\.\s*)?(?:say[ıi]l[ıi]|madde|ya[şs]|g[üu]n|ay|y[ıi]l|adet|ki[şs]i|kadro|derece|cm|kg|tl|%))/giu;
  for (const m of text.matchAll(scoreTypeEnAzRegex)) {
    const score = parseValidKpssScore(m[1]);
    if (score !== null) return score;
  }

  // 3. Compact table row format: "P3 ... 65" on same line or table cell
  const tableRowRegex =
    /(?:^|[^\p{L}\p{N}])(?:kpss[\s\-/(]*)?(?:p-?3|p-?93|p-?94)\)?[^\n\r]{0,50}?(?:^|[\s|:/\-\t])(\d{2,3}(?:[.,]\d+)?)\b(?!\s*(?:\.\s*)?(?:say[ıi]l[ıi]|madde|ya[şs]|g[üu]n|ay|y[ıi]l|adet|ki[şs]i|kadro|derece|cm|kg|tl|%))/giu;
  for (const m of text.matchAll(tableRowRegex)) {
    const score = parseValidKpssScore(m[1]);
    if (score !== null) return score;
  }

  return null;
}

function extractDriverLicenses(text: string): string[] {
  const driverLicenses: string[] = [];
  const licenseGroupRegex =
    /(?:^|[^\p{L}\p{N}])(?:en\s+az\s+)?((?:\(?[A-E][12E]?\)?(?:\s*(?:,|\/|\bveya\b|\bve\b)\s*\(?[A-E][12E]?\)?)*))\s*s[ıi]n[ıi]f[ıi]\s*(?:s[üu]r[üu]c[üu]|ehliyet)/giu;
  for (const m of text.matchAll(licenseGroupRegex)) {
    const group = m[1] ?? '';
    for (const token of group.matchAll(/\b([A-E][12E]?)\b/gi)) {
      const cls = token[1].toUpperCase();
      if (!driverLicenses.includes(cls)) {
        driverLicenses.push(cls);
      }
    }
  }
  return driverLicenses;
}

function extractMaxAge(norm: string): number | null {
  const patterns = [
    /\b(\d{2})\s+yasini\s+(?:doldurmamis|asmamis|gecmemis|bitirmemis)\b/,
    /\b(\d{2})\s+yasindan\s+gun\s+almamis\b/,
    /\byas\s+siniri\s+(?:en\s+(?:fazla|cok)\s+)?(\d{2})\b/,
    /\b(?:azami|en\s+fazla|en\s+cok)\s+(\d{2})\s+yas\b/,
  ];
  for (const pattern of patterns) {
    const match = norm.match(pattern);
    if (match) {
      const age = Number(match[1]);
      if (Number.isInteger(age) && age >= 18 && age <= 65) {
        return age;
      }
    }
  }
  return null;
}

function extractGender(norm: string): 'kadin' | 'erkek' | 'hepsi' | null {
  if (
    /\b(?:kadin\s+(?:ve\s+|veya\s+)?erkek|erkek\s+(?:ve\s+|veya\s+)?kadin)\b/.test(norm)
  ) {
    return 'hepsi';
  }
  if (
    /\b(?:sadece|yalnizca)\s+erkek\b/.test(norm) ||
    /\bcinsiyet(?:i)?\s+erkek\b/.test(norm)
  ) {
    return 'erkek';
  }
  if (
    /\b(?:sadece|yalnizca)\s+kadin\b/.test(norm) ||
    /\bcinsiyet(?:i)?\s+kadin\b/.test(norm)
  ) {
    return 'kadin';
  }
  return null;
}

const KNOWN_CATALOG_DEPT_NORMS = new Set(
  DEPARTMENTS.map((d) => normalizeTrSearch(d.ad.replace(/\([^)]*\)/g, ''))).filter(Boolean),
);

const DEPT_NOISE_PATTERNS = [
  /\b(?:herhangi\s+bir|ilgili|benzeri|esdeger|denkligi|yuksekogretim|fakulte|yuksekokul|universite|mezun|kpss|sinav|kanun|madde|basvuru|belge|sart|kadro|aday|dort\s+yillik|iki\s+yillik|en\s+az|kurumlar)\b/,
];

const DEPT_GENERIC_ONLY = new Set([
  'birinden',
  'biri',
  'ilgili',
  'herhangi',
  'diger',
  'tum',
  'butun',
  'genel',
  'alan',
  'bolum',
  'bolumler',
  'program',
  'programlar',
  'lisans',
  'onlisans',
  'on lisans',
  'ortaogretim',
  'lise',
]);

function cleanProseDepartmentCandidate(raw: string): string | null {
  let candidate = raw
    .replace(/^[\s,.;:•\-–()]+|[\s,.;:•\-–()]+$/g, '')
    .replace(
      /^(?:yükseköğretim\s+kurumlarının|yükseköğretim\s+kurumların|kurumlarının|kurumların|fakültelerinin|fakültelerin|yüksekokullarının|yüksekokulların|meslek\s+yüksekokullarının|üniversitelerin(?:in)?)\s+/i,
      '',
    )
    .replace(
      /^(?:en\s+az\s+)?(?:(?:dört|iki|4|2)\s+yıllık\s+)?(?:(?:lisans|önlisans|ön\s+lisans)\s+)?(?:düzeyinde\s+)?(?:eğitim\s+veren\s+)?/i,
      '',
    )
    .replace(/^(?:veya|ya\s+da|ve)\s+/i, '')
    .replace(
      /\s+(?:lisans|önlisans|ön\s+lisans|bölümü|bölümleri|programı|programları|alanı|alanları)$/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();

  // If leading anchor still sits mid-clause (e.g. "... kurumların Egzersiz ve Spor Bilimleri"), trim up to it
  const anchorIdx = candidate.search(
    /(?:yükseköğretim\s+kurumlarının|yükseköğretim\s+kurumların|kurumlarının|kurumların|fakültelerinin|fakültelerin|yüksekokullarının|meslek\s+yüksekokullarının|eğitim\s+veren)\s+/i,
  );
  if (anchorIdx !== -1) {
    candidate = candidate
      .slice(anchorIdx)
      .replace(
        /^(?:yükseköğretim\s+kurumlarının|yükseköğretim\s+kurumların|kurumlarının|kurumların|fakültelerinin|fakültelerin|yüksekokullarının|meslek\s+yüksekokullarının|eğitim\s+veren)\s+/i,
        '',
      )
      .trim();
  }

  if (candidate.length < 3 || candidate.length > 90) return null;
  const normCand = normalizeTrSearch(candidate);
  if (!normCand || DEPT_GENERIC_ONLY.has(normCand)) return null;
  const wordCount = normCand.split(' ').filter(Boolean).length;
  if (wordCount === 0 || wordCount > 7) return null;
  if (/\d/.test(normCand)) return null;
  if (DEPT_NOISE_PATTERNS.some((re) => re.test(normCand))) return null;

  return candidate;
}

function splitProseDepartmentList(rawList: string): string[] {
  const initialParts = rawList
    .split(/\s*(?:,|;|\/|\bveya\b|\bya\s+da\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const expanded: string[] = [];
  for (const part of initialParts) {
    const partNorm = normalizeTrSearch(part);
    if (
      initialParts.length > 1 &&
      !KNOWN_CATALOG_DEPT_NORMS.has(partNorm) &&
      /\s+ve\s+/i.test(part)
    ) {
      const subParts = part.split(/\s+ve\s+/i).map((s) => s.trim());
      if (
        subParts.length === 2 &&
        subParts.every((s) => normalizeTrSearch(s).split(' ').filter(Boolean).length >= 2)
      ) {
        expanded.push(...subParts);
        continue;
      }
    }
    expanded.push(part);
  }

  return expanded;
}

function extractDepartmentsFromText(
  text: string,
  norm: string,
  educationLevels: ('lisans' | 'onlisans' | 'ortaogretim')[],
): string[] {
  const results: string[] = [];
  const seenNorm = new Set<string>();

  const pushUnique = (name: string) => {
    const key = normalizeTrSearch(name);
    if (!key || seenNorm.has(key)) return;
    seenNorm.add(key);
    results.push(name);
  };

  // 1. Parse Turkish prose graduation patterns (multi-line flattened)
  const flatText = text.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
  const proseRegex =
    /([^.;:\n]{4,280}?)\s+(?:(?:lisans|önlisans|ön\s+lisans)\s+)?(?:programlarının|programlarından|programının|programından|bölümlerinin|bölümlerinden|bölümünün|bölümünden|alanlarının|alanlarından)(?:\s+herhangi)?(?:\s+birinden)?\s+mezun/gi;

  for (const m of flatText.matchAll(proseRegex)) {
    const clause = (m[1] ?? '')
      .replace(
        /^.*(?:yükseköğretim\s+kurumlarının|yükseköğretim\s+kurumların|kurumlarının|kurumların|fakültelerinin|fakültelerin|yüksekokullarının|yüksekokulların|meslek\s+yüksekokullarının|üniversitelerin(?:in)?|eğitim\s+veren)\s+/i,
        '',
      )
      .replace(
        /^(?:en\s+az\s+)?(?:(?:dört|iki|4|2)\s+yıllık\s+)?(?:(?:lisans|önlisans|ön\s+lisans)\s+)?(?:düzeyinde\s+)?(?:eğitim\s+veren\s+)?/i,
        '',
      )
      .trim();
    const segments = splitProseDepartmentList(clause);
    for (const seg of segments) {
      const cleaned = cleanProseDepartmentCandidate(seg);
      if (cleaned) {
        pushUnique(cleaned);
      }
    }
  }

  // 2. Match against DEPARTMENTS catalog safely (avoiding 1-word generic collisions)
  for (const dept of DEPARTMENTS) {
    if (
      educationLevels.length > 0 &&
      !educationLevels.includes(dept.ogrenimDuzeyi) &&
      dept.ogrenimDuzeyi === 'ortaogretim'
    ) {
      continue;
    }

    const displayName = dept.ad.replace(/\s*\([^)]*\)/g, '').trim();
    const coreNorm = normalizeTrSearch(displayName);
    if (!coreNorm) continue;

    const words = coreNorm.split(' ').filter(Boolean);
    const escaped = escapeRegexToken(coreNorm);

    if (words.length >= 2) {
      const multiRegex = new RegExp(
        `(?:^|\\s)${escaped}(?:$|\\s)(?!kurumu|bakanligi|genel mudurlugu|baskanligi|mudurlugu|hastanesi)`,
      );
      if (multiRegex.test(norm)) {
        pushUnique(displayName);
      }
    } else if (coreNorm.length >= 4) {
      const singleContextRegex = new RegExp(
        `(?:^|\\s)${escaped}\\s+(?:fakultesi|bolumu|bolumleri|bolumunden|bolumlerinden|programi|programlari|programindan|programlarindan|mezunu|mezun|myo|meslek yuksekokulu|lisans|onlisans)(?:$|\\s)`,
      );
      if (singleContextRegex.test(norm)) {
        pushUnique(displayName);
      }
    }
  }

  return results;
}

export function extractCriteriaFromText(text: string, city: string): AnnouncementCriteria {
  const norm = normalizeTrSearch(text);
  const educationLevels: ('lisans' | 'onlisans' | 'ortaogretim')[] = [];
  if (norm.includes('onlisans') || norm.includes('on lisans') || norm.includes('myo')) {
    educationLevels.push('onlisans');
  }
  if (norm.includes('ortaogretim') || norm.includes('lise')) {
    educationLevels.push('ortaogretim');
  }
  if (/\blisans\b/.test(norm)) {
    educationLevels.push('lisans');
  }

  const kpssScoreTypes: ('P3' | 'P93' | 'P94')[] = [];
  if (/(?:^|[^a-z0-9])(?:kpss[\s\-/(]*)?p-?3\b/i.test(text)) kpssScoreTypes.push('P3');
  if (/(?:^|[^a-z0-9])(?:kpss[\s\-/(]*)?p-?93\b/i.test(text)) kpssScoreTypes.push('P93');
  if (/(?:^|[^a-z0-9])(?:kpss[\s\-/(]*)?p-?94\b/i.test(text)) kpssScoreTypes.push('P94');

  const minKpssScore = extractMinKpssScore(text);

  const qualMatches = Array.from(
    text.matchAll(
      /\b([1-7]\d{3})\b(?!\s*(?:say[ıi]l[ıi]|nolu|numaral[ıi]|tarihli|y[ıi]l[ıi]|tl|lira|cm|kg|km|adet|ki[şs]i))/gi,
    ),
    (m) => m[1],
  );
  const qualificationCodes = Array.from(new Set(qualMatches)).filter(
    (code) =>
      code !== '5188' &&
      (Number(code) < 1900 ||
        Number(code) > 2100 ||
        ['2001', '2009', '2013', '2015', '2041', '2061', '2065', '2087', '2095', '2097'].includes(
          code,
        )),
  );

  const driverLicenses = extractDriverLicenses(text);

  const certificates: string[] = [];
  if (qualificationCodes.includes('6225') || norm.includes('bilgisayar sertifika')) {
    certificates.push('6225');
  }
  if (norm.includes('5188') || norm.includes('ozel guvenlik kimlik')) {
    certificates.push('5188');
  }
  if (/\bsrc\b/.test(norm) || /\bsrc[1-5]\b/.test(norm)) {
    const srcMatch = text.match(/\bSRC[- ]?([1-5])\b/i);
    certificates.push(srcMatch ? `SRC-${srcMatch[1]}` : 'SRC');
  }
  const ydsMatch = text.match(/\bYDS[- ]?([A-E])\b/i);
  if (ydsMatch) {
    certificates.push(`YDS-${ydsMatch[1].toUpperCase()}`);
  }

  const militaryRequired =
    norm.includes('askerlik ile ilisigi') ||
    norm.includes('askerlikle ilisigi') ||
    norm.includes('askerlik gorevini tamamlamis') ||
    norm.includes('askerligini yapmis') ||
    norm.includes('askerligini tamamlamis') ||
    norm.includes('askerlikten muaf') ||
    norm.includes('askerlik sarti');

  const maxAge = extractMaxAge(norm);
  const gender = extractGender(norm);
  const departments = extractDepartmentsFromText(text, norm, educationLevels);

  const summaryLines: string[] = [];
  if (educationLevels.length > 0) {
    summaryLines.push(`Öğrenim düzeyi: ${educationLevels.join(', ')}`);
  }
  if (kpssScoreTypes.length > 0 || minKpssScore !== null) {
    summaryLines.push(
      `KPSS: ${kpssScoreTypes.join(', ') || 'Belirtilen puan türü'}${minKpssScore !== null ? ` (En az ${minKpssScore} puan)` : ''}`
    );
  }
  if (departments.length > 0) {
    summaryLines.push(`Bölüm şartı: ${departments.slice(0, 6).join(', ')}`);
  }
  if (driverLicenses.length > 0) {
    summaryLines.push(`Sürücü belgesi: ${driverLicenses.join(', ')} sınıfı`);
  }
  if (maxAge !== null) {
    summaryLines.push(`Yaş sınırı: En fazla ${maxAge} yaş`);
  }
  if (certificates.length > 0) {
    summaryLines.push(`Sertifika / belge: ${certificates.join(', ')}`);
  }
  if (qualificationCodes.length > 0) {
    summaryLines.push(`Nitelik kodları: ${qualificationCodes.join(', ')}`);
  }

  return {
    educationLevels,
    kpssScoreTypes,
    minKpssScore,
    cities: city ? [city] : ['TÜRKİYE GENELİ'],
    militaryRequired,
    driverLicenses,
    certificates,
    qualificationCodes,
    summaryLines,
    departments,
    maxAge,
    gender,
  };
}

function hashSlug(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function computeStatus(deadlineAt: string, referenceDate?: string): AnnouncementStatus {
  const ref = referenceDate ?? new Date().toISOString().slice(0, 10);
  return deadlineAt >= ref ? 'acik' : 'kapali';
}

const CARD_CLASS_TOKEN_REGEX =
  /^(?:ilan(?:-[a-z0-9-]+)?|card|announcement(?:-[a-z0-9-]+)?|fihrist-item|job-item)$/i;

function hasCardClassToken(openDivTag: string): boolean {
  const classAttr = extractAttr(openDivTag, 'class');
  if (!classAttr) return false;
  return classAttr
    .split(/\s+/)
    .some((token) => CARD_CLASS_TOKEN_REGEX.test(token.trim()));
}

function extractBalancedDivs(html: string): string[] {
  const results: string[] = [];
  const openDivRegex = /<div\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  let searchFrom = 0;

  while ((match = openDivRegex.exec(html)) !== null) {
    if (match.index < searchFrom) continue;
    if (!hasCardClassToken(match[0])) continue;
    const start = match.index;
    let depth = 1;
    let cursor = start + match[0].length;
    const tagRegex = /<\/?div\b[^>]*>/gi;
    tagRegex.lastIndex = cursor;

    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
      if (tagMatch[0].startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          const end = tagMatch.index + tagMatch[0].length;
          results.push(html.slice(start, end));
          searchFrom = end;
          break;
        }
      } else {
        depth += 1;
      }
      cursor = tagMatch.index + tagMatch[0].length;
    }
  }

  return results;
}

function stripLayoutChrome(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ');
}

function extractWrappedCardAnchors(html: string): string[] {
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  return anchors.filter((anchor) =>
    /<div\b[^>]*class\s*=\s*["'][^"']*\b(?:news-item|duyuru-item|ilan-item)\b[^"']*["'][^>]*>/i.test(
      anchor
    )
  );
}

function extractBlocks(html: string): string[] {
  const cleaned = stripLayoutChrome(html);
  for (const tag of ['article', 'tr']) {
    const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    const matches = cleaned.match(regex);
    if (matches && matches.length > 0) {
      return matches;
    }
  }

  const cardDivs = extractBalancedDivs(cleaned);
  if (cardDivs.length > 0) {
    return cardDivs;
  }

  const wrappedAnchors = extractWrappedCardAnchors(cleaned);
  if (wrappedAnchors.length > 0) {
    return wrappedAnchors;
  }

  return cleaned.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? [];
}

function extractAnchor(block: string, preferPdf = false): { href: string | null; text: string | null } {
  const anchors = Array.from(block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)).map((m) => ({
    href: extractAttr(`<a ${m[1]}>`, 'href'),
    text: stripTags(m[2]) || null,
  }));
  if (anchors.length === 0) return { href: null, text: null };
  if (preferPdf) {
    const pdfAnchor = anchors.find((a) => a.href && /\.pdf(?:[?#]|$)/i.test(a.href));
    if (pdfAnchor) {
      const isGenericText =
        !pdfAnchor.text || /^(?:pdf|indir|görüntüle|tıklayınız|detay|ilan)$/i.test(pdfAnchor.text);
      const fallbackText = isGenericText
        ? anchors.find((a) => a.text && !/^(?:pdf|indir|görüntüle|tıklayınız|detay|ilan)$/i.test(a.text))?.text ??
          pdfAnchor.text
        : pdfAnchor.text;
      return { href: pdfAnchor.href, text: fallbackText };
    }
  }
  return anchors[0];
}

function buildAnnouncementFromBlock(
  block: string,
  source: Exclude<AnnouncementSource, 'osym_kpss'>,
  defaultCategory: AnnouncementCategory,
  idx: number,
  referenceDate?: string
): Announcement | null {
  const meta = OFFICIAL_SOURCE_URLS[source];
  const openTagMatch = block.match(/^<([a-z0-9]+)\b([^>]*)>/i);
  const openTag = openTagMatch ? openTagMatch[0] : '';
  const anchor = extractAnchor(block, source === 'resmi_gazete');

  const fullText = stripTags(block);
  if (!fullText || fullText.length < 12) return null;

  const dataId = extractAttr(openTag, 'data-id') || extractAttr(openTag, 'id');
  const dataCategory = extractAttr(openTag, 'data-category');
  const dataCity = extractAttr(openTag, 'data-city');
  const dataInstitution = extractAttr(openTag, 'data-institution');
  const dataPublished = extractAttr(openTag, 'data-published') || extractAttr(openTag, 'data-date');
  const dataDeadline = extractAttr(openTag, 'data-deadline');
  const dataQuota = extractAttr(openTag, 'data-quota');
  const dataUrl = extractAttr(openTag, 'data-url') || anchor.href;

  let institution =
    dataInstitution ||
    extractByClassOrTag(block, ['institution', 'kurum', 'agency', 'ministry']) ||
    '';
  let title =
    extractByClassOrTag(block, [
      'title',
      'news-title',
      'baslik',
      'ilan-baslik',
      'fihrist-title',
      'position',
      'subject',
    ]) ||
    anchor.text ||
    '';

  // Fallback for table rows <td>...</td>
  if ((!institution || !title) && /<td\b/i.test(block)) {
    const cells = Array.from(block.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((c) => stripTags(c[1]));
    if (cells.length >= 2) {
      if (!institution) institution = cells[0];
      if (!title) title = cells[1];
    }
  }

  if (!title) {
    title = fullText.slice(0, 120);
  }
  title = title.replace(/^[\s\u2013\u2014-]+/, '').trim();

  if (!institution && title) {
    const split = splitInstitutionAndTitle(title);
    if (split.institution) {
      institution = split.institution;
      title = split.title;
    }
  }

  if (!institution) {
    const kurumMatch = fullText.match(/(?:Kurum|Bakanlık|Belediye|Üniversite)\s*[:\-]\s*([^|\n.;]{3,90})/i);
    institution = kurumMatch ? kurumMatch[1].trim() : meta.name;
  }

  if (!title || title.length < 4) return null;

  const cityRaw =
    dataCity ||
    extractByClassOrTag(block, ['city', 'sehir', 'il', 'location']) ||
    fullText.match(/(?:Şehir|İl|Yer)\s*[:\-]\s*([A-ZÇĞİÖŞÜa-zçğıöşü\s]{2,30})/i)?.[1] ||
    'TÜRKİYE GENELİ';
  const city = toTurkishUpper(cityRaw);

  const dateMatches = Array.from(fullText.matchAll(/(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/g)).map((m) =>
    parseDateString(m[1])
  );
  const validDates = dateMatches.filter((d): d is string => Boolean(d));

  const publishedAt =
    parseDateString(dataPublished) ||
    parseDateString(extractByClassOrTag(block, ['published', 'yayin-tarihi', 'date'])) ||
    validDates[0] ||
    '2026-11-26';

  const deadlineAt =
    parseDateString(dataDeadline) ||
    parseDateString(extractByClassOrTag(block, ['deadline', 'son-basvuru', 'son-tarih'])) ||
    (validDates.length > 1 ? validDates[validDates.length - 1] : validDates[0]) ||
    publishedAt;

  const quotaStr = dataQuota || extractByClassOrTag(block, ['quota', 'kontenjan']);
  const quota = quotaStr && /^\d+$/.test(quotaStr) ? Number(quotaStr) : extractQuota(fullText);

  const summary =
    extractByClassOrTag(block, ['summary', 'ozet', 'description', 'aciklama']) ||
    fullText.slice(0, 220);

  const externalId = dataId || `${source.toUpperCase()}-${hashSlug(`${institution}|${title}|${deadlineAt}`)}-${idx + 1}`;
  const id = `${source}-${externalId}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

  const category =
    dataCategory === 'atama' || dataCategory === 'personel_alimi' || dataCategory === 'gorevlendirme'
      ? dataCategory
      : detectCategory(`${title} ${summary}`, defaultCategory);

  const criteria = extractCriteriaFromText(`${title} ${summary} ${fullText}`, city);

  return {
    id,
    externalId,
    source,
    sourceName: meta.name,
    sourceUrl: resolveUrl(dataUrl, meta.url),
    institution: institution.trim(),
    title: title.trim(),
    category,
    city,
    status: computeStatus(deadlineAt, referenceDate),
    publishedAt,
    deadlineAt,
    quota,
    summary,
    criteria,
  };
}

function isJobPostingType(rawType: unknown): boolean {
  if (typeof rawType === 'string') {
    return rawType === 'JobPosting' || rawType.endsWith('/JobPosting');
  }
  if (Array.isArray(rawType)) {
    return rawType.some((entry) => isJobPostingType(entry));
  }
  return false;
}

function collectJobPostings(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJobPostings(item, out);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  if (isJobPostingType(obj['@type'])) {
    out.push(obj);
  }
  if (Array.isArray(obj['@graph'])) {
    collectJobPostings(obj['@graph'], out);
  }
}

function extractHiringOrgName(rawOrg: unknown): string {
  if (typeof rawOrg === 'string') return stripTags(rawOrg);
  if (Array.isArray(rawOrg)) {
    for (const entry of rawOrg) {
      const name = extractHiringOrgName(entry);
      if (name) return name;
    }
    return '';
  }
  if (rawOrg && typeof rawOrg === 'object') {
    const name = (rawOrg as Record<string, unknown>).name;
    if (typeof name === 'string') return stripTags(name);
  }
  return '';
}

function extractJobLocationCity(rawLoc: unknown): string {
  if (!rawLoc) return '';
  if (typeof rawLoc === 'string') return stripTags(rawLoc);
  if (Array.isArray(rawLoc)) {
    for (const entry of rawLoc) {
      const city = extractJobLocationCity(entry);
      if (city) return city;
    }
    return '';
  }
  if (typeof rawLoc === 'object') {
    const loc = rawLoc as Record<string, unknown>;
    if (typeof loc.address === 'string') return stripTags(loc.address);
    if (loc.address && typeof loc.address === 'object') {
      const addr = loc.address as Record<string, unknown>;
      const locality =
        (typeof addr.addressLocality === 'string' && addr.addressLocality) ||
        (typeof addr.addressRegion === 'string' && addr.addressRegion) ||
        '';
      if (locality) return stripTags(locality);
    }
    if (typeof loc.name === 'string') return stripTags(loc.name);
  }
  return '';
}

function extractJsonLdJobPostings(
  html: string,
  source: Exclude<AnnouncementSource, 'osym_kpss'>,
  defaultCategory: AnnouncementCategory,
  referenceDate?: string
): Announcement[] {
  const meta = OFFICIAL_SOURCE_URLS[source];
  const scriptRegex = /<script\b[^>]*type\s*=\s*["'][^"']*application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
  const postings: Record<string, unknown>[] = [];
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      collectJobPostings(parsed, postings);
    } catch {
      // Ignore malformed JSON-LD script blocks safely
    }
  }

  if (postings.length === 0) return [];

  const results: Announcement[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < postings.length; i++) {
    const node = postings[i];
    const rawTitle =
      typeof node.title === 'string'
        ? stripTags(node.title)
        : typeof node.name === 'string'
          ? stripTags(node.name)
          : '';
    if (!rawTitle || rawTitle.length < 4) continue;

    let title = rawTitle;
    let institution = extractHiringOrgName(node.hiringOrganization);
    if (!institution) {
      const split = splitInstitutionAndTitle(title);
      if (split.institution) {
        institution = split.institution;
        title = split.title;
      } else {
        institution = meta.name;
      }
    }

    const rawCity = extractJobLocationCity(node.jobLocation) || 'TÜRKİYE GENELİ';
    const city = toTurkishUpper(rawCity);

    const publishedAt =
      parseDateString(typeof node.datePosted === 'string' ? node.datePosted : null) || '2026-11-26';
    const deadlineAt =
      parseDateString(typeof node.validThrough === 'string' ? node.validThrough : null) || publishedAt;

    const rawDescription = typeof node.description === 'string' ? stripTags(node.description) : '';
    const summary = (rawDescription || title).slice(0, 220);
    const fullText = `${title} ${rawDescription}`;

    const rawUrl = typeof node.url === 'string' ? node.url : null;
    const sourceUrl = resolveUrl(rawUrl, meta.url);

    let rawIdentifier: string | null = null;
    if (typeof node.identifier === 'string') {
      rawIdentifier = node.identifier.trim() || null;
    } else if (node.identifier && typeof node.identifier === 'object') {
      const val = (node.identifier as Record<string, unknown>).value;
      if (typeof val === 'string' && val.trim()) rawIdentifier = val.trim();
    }

    const externalId =
      rawIdentifier || `${source.toUpperCase()}-${hashSlug(`${institution}|${title}|${deadlineAt}`)}-${i + 1}`;
    const id = `${source}-${externalId}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (seen.has(id)) continue;
    seen.add(id);

    const quota =
      typeof node.totalJobOpenings === 'number' && Number.isFinite(node.totalJobOpenings) && node.totalJobOpenings > 0
        ? node.totalJobOpenings
        : extractQuota(fullText);

    const category = detectCategory(fullText, defaultCategory);
    const criteria = extractCriteriaFromText(fullText, city);

    results.push({
      id,
      externalId,
      source,
      sourceName: meta.name,
      sourceUrl,
      institution: institution.trim(),
      title: title.trim(),
      category,
      city,
      status: computeStatus(deadlineAt, referenceDate),
      publishedAt,
      deadlineAt,
      quota,
      summary,
      criteria,
    });
  }

  return results;
}

function unwrapCdata(raw: string): string {
  return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function extractXmlTagText(block: string, tagNames: string[]): string | null {
  for (const tag of tagNames) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i');
    const match = block.match(regex);
    if (match && match[1]) {
      const cleaned = stripTags(unwrapCdata(match[1]));
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function extractFeedLink(block: string): string | null {
  const hrefMatch = block.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch && hrefMatch[1]) {
    return decodeHtmlEntities(hrefMatch[1]).trim() || null;
  }
  return extractXmlTagText(block, ['link']);
}

function extractFeedCategories(block: string): string {
  const values: string[] = [];
  const catRegex = /<category\b([^>]*)>([\s\S]*?)<\/category>|<category\b([^>]*)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = catRegex.exec(block)) !== null) {
    const attrs = m[1] || m[3] || '';
    const term = extractAttr(`<category ${attrs}>`, 'term');
    if (term) values.push(term);
    if (m[2]) {
      const text = stripTags(unwrapCdata(m[2]));
      if (text) values.push(text);
    }
  }
  return values.join(' ');
}

function extractFeedAnnouncements(
  xml: string,
  source: Exclude<AnnouncementSource, 'osym_kpss'>,
  defaultCategory: AnnouncementCategory,
  referenceDate?: string
): Announcement[] {
  const meta = OFFICIAL_SOURCE_URLS[source];
  const entries =
    xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ??
    xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) ??
    [];
  if (entries.length === 0) return [];

  const results: Announcement[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const rawTitle = extractXmlTagText(entry, ['title']);
    if (!rawTitle || rawTitle.length < 4) continue;

    let title = rawTitle;
    let institution = extractXmlTagText(entry, ['author', 'dc:creator']) || '';
    if (!institution) {
      const split = splitInstitutionAndTitle(title);
      if (split.institution) {
        institution = split.institution;
        title = split.title;
      }
    }

    const description = extractXmlTagText(entry, ['description', 'summary', 'content']) || '';
    const categoryText = extractFeedCategories(entry);
    const fullText = `${title} ${description} ${categoryText}`.trim();

    if (!institution) {
      const kurumMatch = fullText.match(/(?:Kurum|Bakanlık|Belediye|Üniversite)\s*[:\-]\s*([^|\n.;]{3,90})/i);
      institution = kurumMatch ? kurumMatch[1].trim() : meta.name;
    }

    const pubRaw = extractXmlTagText(entry, ['pubDate', 'published', 'updated', 'dc:date']);
    const dateMatches = Array.from(fullText.matchAll(/(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/g))
      .map((m) => parseDateString(m[1]))
      .filter((d): d is string => Boolean(d));

    const publishedAt = parseDateString(pubRaw) || dateMatches[0] || '2026-11-26';
    const deadlineFromText = dateMatches.length > 0 ? dateMatches[dateMatches.length - 1] : null;
    const deadlineAt = deadlineFromText && deadlineFromText >= publishedAt ? deadlineFromText : publishedAt;

    const cityRaw =
      fullText.match(/(?:Şehir|İl|Yer)\s*[:\-]\s*([A-ZÇĞİÖŞÜa-zçğıöşü\s]{2,30})/i)?.[1] ||
      'TÜRKİYE GENELİ';
    const city = toTurkishUpper(cityRaw);

    const link = extractFeedLink(entry);
    const guid = extractXmlTagText(entry, ['guid', 'id']);
    const queryIdMatch = (link || guid || '').match(/[?&]i=([a-zA-Z0-9-]{8,64})/);
    const safeGuid =
      (queryIdMatch ? `${source.toUpperCase()}-${queryIdMatch[1]}` : null) ??
      (guid && !/^https?:\/\//i.test(guid) ? guid : null);

    const externalId =
      safeGuid || `${source.toUpperCase()}-${hashSlug(`${institution}|${title}|${deadlineAt}`)}-${i + 1}`;
    const id = `${source}-${externalId}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (seen.has(id)) continue;
    seen.add(id);

    const summary = (description || title).slice(0, 220);
    const quota = extractQuota(fullText);
    const category = detectCategory(`${categoryText} ${title} ${description}`, defaultCategory);
    const criteria = extractCriteriaFromText(fullText, city);

    results.push({
      id,
      externalId,
      source,
      sourceName: meta.name,
      sourceUrl: resolveUrl(link, meta.url),
      institution: institution.trim(),
      title: title.trim(),
      category,
      city,
      status: computeStatus(deadlineAt, referenceDate),
      publishedAt,
      deadlineAt,
      quota,
      summary,
      criteria,
    });
  }

  return results;
}

function parseSourceHtml(
  html: string,
  source: Exclude<AnnouncementSource, 'osym_kpss'>,
  defaultCategory: AnnouncementCategory,
  referenceDate?: string
): Announcement[] {
  if (!html || typeof html !== 'string') return [];

  const jsonLdResults = extractJsonLdJobPostings(html, source, defaultCategory, referenceDate);
  if (jsonLdResults.length > 0) {
    return jsonLdResults;
  }

  const isXmlFeed = /<(?:rss|feed|rdf:RDF)\b/i.test(html);
  const rawBlocks = isXmlFeed ? [] : extractBlocks(html);
  if (rawBlocks.length === 0) {
    return extractFeedAnnouncements(html, source, defaultCategory, referenceDate);
  }

  const results: Announcement[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];
    // Skip table header rows
    if (/^<tr\b/i.test(block) && /<th\b/i.test(block) && !/<td\b/i.test(block)) {
      continue;
    }
    const item = buildAnnouncementFromBlock(block, source, defaultCategory, i, referenceDate);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      results.push(item);
    }
  }

  return results;
}

export function parseKariyerKapisiHtml(html: string, referenceDate?: string): Announcement[] {
  return parseSourceHtml(html, 'kariyer_kapisi', 'personel_alimi', referenceDate);
}

export function parseIskurHtml(html: string, referenceDate?: string): Announcement[] {
  return parseSourceHtml(html, 'iskur', 'personel_alimi', referenceDate);
}

export function parseResmiGazeteHtml(html: string, referenceDate?: string): Announcement[] {
  return parseSourceHtml(html, 'resmi_gazete', 'atama', referenceDate);
}

type LegacyFetchSource = 'kariyer_kapisi' | 'iskur' | 'resmi_gazete';

const SOURCE_PARSERS: Record<
  LegacyFetchSource,
  (html: string, referenceDate?: string) => Announcement[]
> = {
  kariyer_kapisi: parseKariyerKapisiHtml,
  iskur: parseIskurHtml,
  resmi_gazete: parseResmiGazeteHtml,
};

const LEGACY_FETCH_SOURCES: LegacyFetchSource[] = [
  'kariyer_kapisi',
  'iskur',
  'resmi_gazete',
];

export async function fetchOfficialAnnouncements(
  fetcher?: typeof fetch,
  options?: { timeoutMs?: number; referenceDate?: string }
): Promise<FetchOfficialResult> {
  const fetchFn = fetcher ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const timeoutMs = options?.timeoutMs ?? 8000;
  const items: Announcement[] = [];
  const errors: FetchErrorItem[] = [];
  const seenIds = new Set<string>();

  const sources = LEGACY_FETCH_SOURCES.map(
    (source) => [source, OFFICIAL_SOURCE_URLS[source]] as const
  );

  if (!fetchFn) {
    for (const [source, meta] of sources) {
      errors.push({
        source,
        sourceName: meta.name,
        url: meta.feedUrl ?? meta.url,
        message: 'Fetch istemcisi kullanılabilir değil.',
      });
    }
    return { items, errors };
  }

  await Promise.all(
    sources.map(async ([source, meta]) => {
      const targetUrl = meta.feedUrl ?? meta.url;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchFn(targetUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/rss+xml, application/xml, text/xml, text/html, application/xhtml+xml;q=0.9',
            'User-Agent': 'KamuBildirimSepeti/1.0 (+https://kamubildirimsepeti.example)',
          },
        });
        if (!res.ok) {
          errors.push({
            source,
            sourceName: meta.name,
            url: targetUrl,
            message: `HTTP ${res.status} yanıtı alındı.`,
          });
          return;
        }
        const html = await res.text();
        const parsed = SOURCE_PARSERS[source](html, options?.referenceDate);
        for (const item of parsed) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            items.push(item);
          }
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.name === 'AbortError'
              ? `İstek zaman aşımına uğradı (${timeoutMs} ms).`
              : err.message
            : 'Bilinmeyen bağlantı hatası.';
        errors.push({
          source,
          sourceName: meta.name,
          url: targetUrl,
          message,
        });
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return { items, errors };
}
