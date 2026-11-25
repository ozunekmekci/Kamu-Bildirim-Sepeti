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
  { name: string; url: string }
> = {
  kariyer_kapisi: {
    name: 'Kariyer Kapısı',
    url: 'https://kariyerkapisi.gov.tr',
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

function decodeHtmlEntities(input: string): string {
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

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAttr(tagHtml: string, attrName: string): string | null {
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

function resolveUrl(href: string | null, baseUrl: string): string {
  if (!href) return baseUrl;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('javascript:')) return baseUrl;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return trimmed.startsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`;
}

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
  return null;
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

function extractQuota(text: string): number | null {
  const m =
    text.match(/(?:kontenjan|kadro|alınacak\s+kişi|kişi\s*sayısı|adet)\s*[:\-]?\s*(\d{1,5})/i) ||
    text.match(/\b(\d{1,5})\s*(?:kişi|personel|memur|işçi|kadro)\b/i);
  if (!m) return null;
  const val = Number(m[1]);
  return Number.isFinite(val) && val > 0 ? val : null;
}

function extractCriteriaFromText(text: string, city: string): AnnouncementCriteria {
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
  if (/\bp3\b/i.test(text)) kpssScoreTypes.push('P3');
  if (/\bp93\b/i.test(text)) kpssScoreTypes.push('P93');
  if (/\bp94\b/i.test(text)) kpssScoreTypes.push('P94');

  const scoreMatch = text.match(/(?:en\s*az|taban|kpss[^0-9]{0,20})\s*(\d{2}(?:[.,]\d+)?)\s*puan/i);
  const minKpssScore = scoreMatch ? Number(scoreMatch[1].replace(',', '.')) : null;

  const qualificationCodes = Array.from(new Set(text.match(/\b[1-7]\d{3}\b/g) ?? [])).filter(
    (code) => Number(code) < 1900 || Number(code) > 2100 || ['2001', '2009', '2013', '2015', '2041', '2061', '2065', '2087', '2095', '2097'].includes(code)
  );

  const driverLicenses: string[] = [];
  const licenseRegex = /\b([A-E][12]?)\s*sınıfı\s*(?:sürücü|ehliyet)/gi;
  let lm: RegExpExecArray | null;
  while ((lm = licenseRegex.exec(text)) !== null) {
    const cls = lm[1].toUpperCase();
    if (!driverLicenses.includes(cls)) driverLicenses.push(cls);
  }

  const certificates: string[] = [];
  if (qualificationCodes.includes('6225') || norm.includes('bilgisayar sertifika')) {
    certificates.push('6225');
  }
  if (norm.includes('5188') || norm.includes('ozel guvenlik kimlik')) {
    certificates.push('5188');
  }
  if (norm.includes('src')) {
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
    norm.includes('askerlik sarti');

  const summaryLines: string[] = [];
  if (educationLevels.length > 0) {
    summaryLines.push(`Öğrenim düzeyi: ${educationLevels.join(', ')}`);
  }
  if (kpssScoreTypes.length > 0 || minKpssScore !== null) {
    summaryLines.push(
      `KPSS: ${kpssScoreTypes.join(', ') || 'Belirtilen puan türü'}${minKpssScore !== null ? ` (En az ${minKpssScore} puan)` : ''}`
    );
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

function computeStatus(deadlineAt: string, referenceDate?: string): AnnouncementStatus {
  const ref = referenceDate ?? new Date().toISOString().slice(0, 10);
  return deadlineAt >= ref ? 'acik' : 'kapali';
}

function extractBalancedDivs(html: string): string[] {
  const results: string[] = [];
  const openCardRegex =
    /<div\b[^>]*class\s*=\s*["'][^"']*(?:ilan|card|announcement|fihrist-item|job-item)[^"']*["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  let searchFrom = 0;

  while ((match = openCardRegex.exec(html)) !== null) {
    if (match.index < searchFrom) continue;
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

function extractBlocks(html: string): string[] {
  for (const tag of ['article', 'tr', 'li']) {
    const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    const matches = html.match(regex);
    if (matches && matches.length > 0) {
      return matches;
    }
  }
  return extractBalancedDivs(html);
}

function extractAnchor(block: string): { href: string | null; text: string | null } {
  const m = block.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  if (!m) return { href: null, text: null };
  return {
    href: extractAttr(`<a ${m[1]}>`, 'href'),
    text: stripTags(m[2]) || null,
  };
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
  const anchor = extractAnchor(block);

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
    extractByClassOrTag(block, ['title', 'baslik', 'ilan-baslik', 'position', 'subject']) ||
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

  if (!institution) {
    const kurumMatch = fullText.match(/(?:Kurum|Bakanlık|Belediye|Üniversite)\s*[:\-]\s*([^|\n.;]{3,90})/i);
    institution = kurumMatch ? kurumMatch[1].trim() : meta.name;
  }

  if (!title) {
    title = fullText.slice(0, 120);
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

function parseSourceHtml(
  html: string,
  source: Exclude<AnnouncementSource, 'osym_kpss'>,
  defaultCategory: AnnouncementCategory,
  referenceDate?: string
): Announcement[] {
  if (!html || typeof html !== 'string') return [];

  const rawBlocks = extractBlocks(html);
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

const SOURCE_PARSERS: Record<
  Exclude<AnnouncementSource, 'osym_kpss'>,
  (html: string, referenceDate?: string) => Announcement[]
> = {
  kariyer_kapisi: parseKariyerKapisiHtml,
  iskur: parseIskurHtml,
  resmi_gazete: parseResmiGazeteHtml,
};

export async function fetchOfficialAnnouncements(
  fetcher?: typeof fetch,
  options?: { timeoutMs?: number; referenceDate?: string }
): Promise<FetchOfficialResult> {
  const fetchFn = fetcher ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const timeoutMs = options?.timeoutMs ?? 8000;
  const items: Announcement[] = [];
  const errors: FetchErrorItem[] = [];
  const seenIds = new Set<string>();

  const sources = Object.entries(OFFICIAL_SOURCE_URLS) as [
    Exclude<AnnouncementSource, 'osym_kpss'>,
    { name: string; url: string }
  ][];

  if (!fetchFn) {
    for (const [source, meta] of sources) {
      errors.push({
        source,
        sourceName: meta.name,
        url: meta.url,
        message: 'Fetch istemcisi kullanılabilir değil.',
      });
    }
    return { items, errors };
  }

  await Promise.all(
    sources.map(async ([source, meta]) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchFn(meta.url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        if (!res.ok) {
          errors.push({
            source,
            sourceName: meta.name,
            url: meta.url,
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
          url: meta.url,
          message,
        });
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return { items, errors };
}
