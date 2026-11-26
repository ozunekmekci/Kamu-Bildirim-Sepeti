import { normalizeTrSearch } from '@/lib/turkish';
import { extractCriteriaFromText, extractQuota } from './parsers';
import {
  classifyAnnouncement,
  computeContentHash,
  inferCityFromInstitutionOrText,
} from './taxonomy';
import type {
  Announcement,
  AnnouncementCriteria,
  AnnouncementPosition,
  ExamType,
} from './types';

const EXCERPT_MAX_CHARS = 1600;

const KNOWN_POSITION_TITLES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bitfaiye\s+eri\b/i, label: 'İtfaiye Eri' },
  { pattern: /\bzab[ıi]ta\s+memuru\b/i, label: 'Zabıta Memuru' },
  {
    pattern: /\bveri\s+haz[ıi]rlama\s+ve\s+kontrol\s+i[şs]letmeni\b/i,
    label: 'Veri Hazırlama ve Kontrol İşletmeni',
  },
  { pattern: /\bbilgisayar\s+i[şs]letmeni\b/i, label: 'Bilgisayar İşletmeni' },
  { pattern: /\bkoruma\s+ve\s+g[üu]venlik\s+g[öo]revlisi\b/i, label: 'Koruma ve Güvenlik Görevlisi' },
  { pattern: /\bb[üu]ro\s+personeli\b/i, label: 'Büro Personeli' },
  { pattern: /\bdestek\s+personeli\b/i, label: 'Destek Personeli' },
  { pattern: /\buzman\s+yard[ıi]mc[ıi]s[ıi]\b/i, label: 'Uzman Yardımcısı' },
  { pattern: /\bm[üu]fetti[şs]\s+yard[ıi]mc[ıi]s[ıi]\b/i, label: 'Müfettiş Yardımcısı' },
  { pattern: /\bin[şs]aat\s+m[üu]hendisi\b/i, label: 'İnşaat Mühendisi' },
  { pattern: /\bbilgisayar\s+m[üu]hendisi\b/i, label: 'Bilgisayar Mühendisi' },
  { pattern: /\belek(?:trik|tronik)[^,\n]{0,20}m[üu]hendisi\b/i, label: 'Elektrik-Elektronik Mühendisi' },
  { pattern: /\bmakine\s+m[üu]hendisi\b/i, label: 'Makine Mühendisi' },
  { pattern: /\bharita\s+m[üu]hendisi\b/i, label: 'Harita Mühendisi' },
  { pattern: /\b[çc]evre\s+m[üu]hendisi\b/i, label: 'Çevre Mühendisi' },
  { pattern: /\bm[üu]hendis\b/i, label: 'Mühendis' },
  { pattern: /\b[şs]ehir\s+planc[ıi]s[ıi]\b/i, label: 'Şehir Plancısı' },
  { pattern: /\bmimar\b/i, label: 'Mimar' },
  { pattern: /\bavukat\b/i, label: 'Avukat' },
  { pattern: /\bhem[şs]ire\b/i, label: 'Hemşire' },
  { pattern: /\bpsikolog\b/i, label: 'Psikolog' },
  { pattern: /\bdiyetisyen\b/i, label: 'Diyetisyen' },
  { pattern: /\bfizyoterapist\b/i, label: 'Fizyoterapist' },
  { pattern: /\bsosyal\s+[çc]al[ıi][şs]mac[ıi]\b/i, label: 'Sosyal Çalışmacı' },
  { pattern: /\bveteriner\s+hekim\b/i, label: 'Veteriner Hekim' },
  { pattern: /\bprogramc[ıi]\b/i, label: 'Programcı' },
  { pattern: /\btekniker\b/i, label: 'Tekniker' },
  { pattern: /\bteknisyen\b/i, label: 'Teknisyen' },
  { pattern: /\b[şs]of[öo]r\b/i, label: 'Şoför' },
  { pattern: /\btahsildar\b/i, label: 'Tahsildar' },
  { pattern: /\bveznedar\b/i, label: 'Veznedar' },
  { pattern: /\b[öo][ğg]retim\s+[üu]yesi\b/i, label: 'Öğretim Üyesi' },
  { pattern: /\b[öo][ğg]retim\s+g[öo]revlisi\b/i, label: 'Öğretim Görevlisi' },
  { pattern: /\bara[şs]t[ıi]rma\s+g[öo]revlisi\b/i, label: 'Araştırma Görevlisi' },
];

function cleanPdfRawText(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/\f+/g, '\n\n')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2014/g, '-')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function dedupeNormalized(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const val of values) {
    const trimmed = val.trim();
    const key = normalizeTrSearch(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function extractPdfQuota(cleanedText: string): number | null {
  const fromBase = extractQuota(cleanedText);
  if (fromBase !== null) return fromBase;

  const adediMatch = cleanedText.match(
    /(?:kadro\s+)?adedi\s*[:\-]?\s*\n?\s*(\d{1,4})\b/i,
  );
  if (adediMatch) {
    const val = Number(adediMatch[1]);
    if (Number.isFinite(val) && val > 0 && val < 5000) return val;
  }

  const roleCountMatch = cleanedText.match(
    /\b(\d{1,4})\s+(?:adet\s+)?(?:itfaiye\s+eri|zab[ıi]ta\s+memuru|m[üu]hendis|mimar|tekniker|teknisyen|hem[şs]ire|avukat|b[üu]ro\s+personeli|destek\s+personeli|veri\s+haz[ıi]rlama|programc[ıi]|psikolog|[şs]of[öo]r)\b/i,
  );
  if (roleCountMatch) {
    const val = Number(roleCountMatch[1]);
    if (Number.isFinite(val) && val > 0 && val < 5000) return val;
  }

  return null;
}

function extractOfficialApplyUrl(cleanedText: string): string | null {
  const urlRegex =
    /(?:https?:\/\/)?(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:gov\.tr|bel\.tr)(?:\/[^\s,;()<>"]*)?)/gi;

  const candidates: string[] = [];
  for (const match of cleanedText.matchAll(urlRegex)) {
    const fullMatch = match[0] ?? '';
    const idx = match.index ?? 0;
    // Skip email addresses like info@www.foo.bel.tr
    if (idx > 0 && cleanedText[idx - 1] === '@') continue;
    const stripped = fullMatch.replace(/[.,;:'")\]>]+$/g, '');
    if (!stripped) continue;
    const normalized = /^https?:\/\//i.test(stripped) ? stripped : `https://${stripped}`;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  }

  if (candidates.length === 0) return null;

  // Prefer explicit application portals or institution .bel.tr / .gov.tr URLs over generic references
  const preferred = candidates.find(
    (u) =>
      /turkiye\.gov\.tr|kariyerkapisi\.gov\.tr|basvuru/i.test(u) ||
      /\.bel\.tr\b/i.test(u),
  );
  return preferred ?? candidates[0];
}

function detectPrimaryPositionTitle(
  announcementTitle: string,
  cleanedText: string,
): string | null {
  for (const entry of KNOWN_POSITION_TITLES) {
    if (entry.pattern.test(announcementTitle)) {
      return entry.label;
    }
  }
  for (const entry of KNOWN_POSITION_TITLES) {
    if (entry.pattern.test(cleanedText)) {
      return entry.label;
    }
  }
  const norm = normalizeTrSearch(`${announcementTitle} ${cleanedText}`);
  if (
    norm.includes('unvan') ||
    norm.includes('kadro') ||
    norm.includes('sinifi') ||
    norm.includes('memur alim')
  ) {
    return announcementTitle.trim() || 'Kamu Personeli';
  }
  return null;
}

function evaluationMethodForExamType(examType: ExamType | undefined): string | null {
  switch (examType) {
    case 'kpss_only':
      return 'KPSS Puan Sıralaması';
    case 'practice_exam':
      return 'Sözlü ve Uygulamalı Sınav';
    case 'oral_exam':
      return 'Sözlü Sınav';
    case 'written_and_oral':
      return 'Yazılı ve Sözlü Sınav';
    default:
      return null;
  }
}

function buildPositionRequirementsSummary(criteria: AnnouncementCriteria): string {
  if (criteria.summaryLines.length > 0) {
    return criteria.summaryLines.join(' | ');
  }
  const parts: string[] = [];
  if (criteria.educationLevels.length > 0) {
    parts.push(`Öğrenim: ${criteria.educationLevels.join(', ')}`);
  }
  if (criteria.kpssScoreTypes.length > 0 || criteria.minKpssScore !== null) {
    parts.push(
      `KPSS ${criteria.kpssScoreTypes.join('/') || ''}${criteria.minKpssScore !== null ? ` >= ${criteria.minKpssScore}` : ''}`.trim(),
    );
  }
  if (criteria.departments && criteria.departments.length > 0) {
    parts.push(`Bölüm: ${criteria.departments.slice(0, 4).join(', ')}`);
  }
  if (criteria.driverLicenses.length > 0) {
    parts.push(`Ehliyet: ${criteria.driverLicenses.join(', ')}`);
  }
  if (criteria.maxAge) {
    parts.push(`Azami yaş: ${criteria.maxAge}`);
  }
  return parts.join(' | ');
}

function buildExtractedTextExcerpt(cleanedText: string, maxLength = EXCERPT_MAX_CHARS): string {
  if (cleanedText.length <= maxLength) {
    return cleanedText;
  }

  const blocks = cleanedText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    return truncateCleanly(cleanedText, maxLength);
  }

  const scored = blocks.map((block, index) => {
    const norm = normalizeTrSearch(block);
    let score = 0;
    if (index === 0) score += 2;
    if (
      norm.includes('unvan') ||
      norm.includes('kadro') ||
      norm.includes('nitelik') ||
      norm.includes('puan turu') ||
      norm.includes('taban puan') ||
      norm.includes('adedi')
    ) {
      score += 5;
    }
    if (
      norm.includes('ozel sart') ||
      norm.includes('aranan sart') ||
      norm.includes('surucu belgesi') ||
      norm.includes('ehliyet') ||
      norm.includes('yasini doldurmamis') ||
      norm.includes('yasindan gun almamis') ||
      norm.includes('mezun olmak')
    ) {
      score += 5;
    }
    if (norm.includes('basvuru') && (norm.includes('tarih') || norm.includes('yeri'))) {
      score += 2;
    }
    return { block, index, score };
  });

  const selectedIndices = new Set<number>();
  let totalLen = 0;

  const prioritized = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);
  for (const item of prioritized) {
    if (item.score <= 0 && selectedIndices.size > 0) continue;
    const sepLen = selectedIndices.size > 0 ? 2 : 0;
    if (totalLen + sepLen + item.block.length <= maxLength) {
      selectedIndices.add(item.index);
      totalLen += sepLen + item.block.length;
    } else if (selectedIndices.size === 0) {
      return truncateCleanly(item.block, maxLength);
    }
  }

  const orderedBlocks = blocks.filter((_, idx) => selectedIndices.has(idx));
  const combined = orderedBlocks.join('\n\n');
  return truncateCleanly(combined, maxLength);
}

function truncateCleanly(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength - 3);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.7 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}...`;
}

/**
 * Enriches an announcement using raw text extracted from its official PDF notice.
 * Pure Edge-compatible TypeScript with zero Node-only imports.
 */
export function enrichAnnouncementFromPdfText(
  baseAnnouncement: Announcement,
  rawText: string,
): Announcement {
  const cleanedText = cleanPdfRawText(rawText);
  if (!cleanedText) {
    return baseAnnouncement;
  }

  const headerSlice = cleanedText.slice(0, 400);
  const baseHasConcreteCity =
    Boolean(baseAnnouncement.city) && baseAnnouncement.city !== 'TÜRKİYE GENELİ';
  const resolvedCity = baseHasConcreteCity
    ? baseAnnouncement.city
    : inferCityFromInstitutionOrText(baseAnnouncement.institution, headerSlice) !== 'TÜRKİYE GENELİ'
      ? inferCityFromInstitutionOrText(baseAnnouncement.institution, headerSlice)
      : inferCityFromInstitutionOrText(baseAnnouncement.institution, cleanedText);

  const pdfCriteria = extractCriteriaFromText(cleanedText, resolvedCity);

  const mergedCities = Array.from(
    new Set(
      [...(baseAnnouncement.criteria.cities ?? []), ...(pdfCriteria.cities ?? []), resolvedCity].filter(
        (c) => Boolean(c) && (resolvedCity === 'TÜRKİYE GENELİ' || c !== 'TÜRKİYE GENELİ'),
      ),
    ),
  );
  if (mergedCities.length === 0) mergedCities.push('TÜRKİYE GENELİ');

  const mergedDepartments = dedupeNormalized([
    ...(baseAnnouncement.criteria.departments ?? []),
    ...(pdfCriteria.departments ?? []),
  ]);

  const mergedEducationLevels = Array.from(
    new Set([
      ...baseAnnouncement.criteria.educationLevels,
      ...pdfCriteria.educationLevels,
    ]),
  );
  const mergedKpssScoreTypes = Array.from(
    new Set([
      ...baseAnnouncement.criteria.kpssScoreTypes,
      ...pdfCriteria.kpssScoreTypes,
    ]),
  );
  const mergedMinKpssScore =
    pdfCriteria.minKpssScore ?? baseAnnouncement.criteria.minKpssScore;
  const mergedDriverLicenses = Array.from(
    new Set([
      ...baseAnnouncement.criteria.driverLicenses,
      ...pdfCriteria.driverLicenses,
    ]),
  );
  const mergedCertificates = Array.from(
    new Set([
      ...baseAnnouncement.criteria.certificates,
      ...pdfCriteria.certificates,
    ]),
  );
  const mergedQualificationCodes = Array.from(
    new Set([
      ...baseAnnouncement.criteria.qualificationCodes,
      ...pdfCriteria.qualificationCodes,
    ]),
  );
  const mergedMaxAge = pdfCriteria.maxAge ?? baseAnnouncement.criteria.maxAge ?? null;
  const mergedGender = pdfCriteria.gender ?? baseAnnouncement.criteria.gender ?? null;
  const extractedTextExcerpt = buildExtractedTextExcerpt(cleanedText, EXCERPT_MAX_CHARS);

  const summaryLines =
    pdfCriteria.summaryLines.length > 0
      ? pdfCriteria.summaryLines
      : baseAnnouncement.criteria.summaryLines;

  const mergedCriteria: AnnouncementCriteria = {
    educationLevels: mergedEducationLevels,
    kpssScoreTypes: mergedKpssScoreTypes,
    minKpssScore: mergedMinKpssScore,
    cities: mergedCities,
    militaryRequired:
      baseAnnouncement.criteria.militaryRequired || pdfCriteria.militaryRequired,
    driverLicenses: mergedDriverLicenses,
    certificates: mergedCertificates,
    qualificationCodes: mergedQualificationCodes,
    summaryLines,
    departments: mergedDepartments,
    maxAge: mergedMaxAge,
    gender: mergedGender,
    extractedTextExcerpt,
  };

  const resolvedQuota = baseAnnouncement.quota ?? extractPdfQuota(cleanedText);
  const resolvedApplyUrl =
    baseAnnouncement.applyUrl ?? extractOfficialApplyUrl(cleanedText);

  const classification = classifyAnnouncement({
    source: baseAnnouncement.source,
    institution: baseAnnouncement.institution,
    title: baseAnnouncement.title,
    description: cleanedText,
  });

  const examType =
    baseAnnouncement.examType && baseAnnouncement.examType !== 'unspecified'
      ? baseAnnouncement.examType
      : classification.examType;
  const employmentType =
    baseAnnouncement.employmentType && baseAnnouncement.employmentType !== 'diger'
      ? baseAnnouncement.employmentType
      : classification.employmentType;

  let positions: AnnouncementPosition[] = baseAnnouncement.positions
    ? [...baseAnnouncement.positions]
    : [];

  if (positions.length === 0) {
    const primaryTitle = detectPrimaryPositionTitle(baseAnnouncement.title, cleanedText);
    const hasStructuredCriteria =
      mergedEducationLevels.length > 0 ||
      mergedKpssScoreTypes.length > 0 ||
      mergedMinKpssScore !== null ||
      mergedDepartments.length > 0 ||
      mergedDriverLicenses.length > 0 ||
      mergedMaxAge !== null ||
      resolvedQuota !== null;

    if (primaryTitle && hasStructuredCriteria) {
      positions = [
        {
          id: `${baseAnnouncement.id}-pos-1`,
          announcementId: baseAnnouncement.id,
          title: primaryTitle,
          unvan: primaryTitle,
          city: resolvedCity,
          district: null,
          quota: resolvedQuota,
          educationLevel: mergedEducationLevels[0] ?? null,
          kpssScoreType: mergedKpssScoreTypes[0] ?? null,
          minKpssScore: mergedMinKpssScore,
          maxAge: mergedMaxAge,
          militaryRequired: mergedCriteria.militaryRequired,
          qualificationCodes: [...mergedQualificationCodes],
          evaluationMethod: evaluationMethodForExamType(examType),
          isInterviewFree: examType === 'kpss_only',
          requirementsSummary: buildPositionRequirementsSummary(mergedCriteria),
        },
      ];
    }
  }

  const contentHash = computeContentHash({
    id: baseAnnouncement.id,
    institution: baseAnnouncement.institution,
    title: baseAnnouncement.title,
    city: resolvedCity,
    deadlineAt: baseAnnouncement.deadlineAt,
    quota: resolvedQuota,
    criteria: mergedCriteria,
    positionsCount: positions.length,
  });

  return {
    ...baseAnnouncement,
    city: resolvedCity,
    quota: resolvedQuota,
    applyUrl: resolvedApplyUrl,
    examType,
    employmentType,
    criteria: mergedCriteria,
    positions,
    positionsCount: positions.length,
    enrichmentStatus: 'enriched',
    contentHash,
  };
}
