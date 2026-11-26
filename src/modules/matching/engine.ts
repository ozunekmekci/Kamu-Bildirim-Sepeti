import { getDepartmentById } from '@/data/departments';
import { getQualificationByCode, isSpecialConditionCode } from '@/data/qualifications';
import { normalizeTr, normalizeTrSearch } from '@/lib/turkish';
import {
  Announcement,
  AnnouncementPosition,
  MilitaryStatus,
} from '@/modules/announcements/types';
import type { MatchEvaluation, MatchedPositionResult } from '@/modules/db/types';

export type { MatchEvaluation, MatchedPositionResult };

export interface MatchingProfileInput {
  educationLevel: 'lisans' | 'onlisans' | 'ortaogretim' | null;
  departmentId: string | null;
  kpssScoreType: 'P3' | 'P93' | 'P94' | null;
  kpssScore: number | null;
  residenceCity: string | null;
  militaryStatus: MilitaryStatus | null;
  driverLicenses: string[];
  certificates: string[];
  qualificationCodes: string[];
  age?: number | null;
}

export interface AnnouncementMatchResult {
  announcement: Announcement;
  evaluation: MatchEvaluation;
}

const EDUCATION_LABELS: Record<'lisans' | 'onlisans' | 'ortaogretim', string> = {
  lisans: 'Lisans',
  onlisans: 'Önlisans',
  ortaogretim: 'Ortaöğretim',
};

const GENERAL_LEVEL_CODE: Record<'lisans' | 'onlisans' | 'ortaogretim', string> = {
  lisans: '4001',
  onlisans: '3001',
  ortaogretim: '2001',
};

const YDS_RANK: Record<string, number> = {
  'yds-d': 1,
  '7111': 1,
  'yds-c': 2,
  '7113': 2,
  'yds-b': 3,
  '7115': 3,
  'yds-a': 4,
  '7117': 4,
};

const LICENSE_COVERS: Record<string, string[]> = {
  A: ['A', 'A1', 'A2'],
  A2: ['A2', 'A1'],
  B: ['B'],
  C: ['C', 'B'],
  D: ['D', 'B'],
  E: ['E', 'D', 'C', 'B'],
};

function hasDriverLicense(userLicenses: string[], requiredLicense: string): boolean {
  const reqNorm = normalizeTr(requiredLicense).toUpperCase();
  for (const raw of userLicenses) {
    const owned = normalizeTr(raw).toUpperCase();
    if (owned === reqNorm) return true;
    const covered = LICENSE_COVERS[owned];
    if (covered && covered.includes(reqNorm)) return true;
  }
  return false;
}

function hasCertificate(profile: MatchingProfileInput, requiredCert: string): boolean {
  const reqSearch = normalizeTrSearch(requiredCert);
  const ownedTokens = [
    ...(profile.certificates ?? []),
    ...(profile.qualificationCodes ?? []),
  ].map((c) => normalizeTrSearch(c));

  if (ownedTokens.includes(reqSearch)) {
    return true;
  }

  // Handle YDS hierarchy (e.g. YDS-B satisfies YDS-C and YDS-D)
  const reqRank = YDS_RANK[reqSearch.replace(/\s+/g, '-')];
  if (reqRank !== undefined) {
    for (const token of ownedTokens) {
      const ownedRank = YDS_RANK[token.replace(/\s+/g, '-')];
      if (ownedRank !== undefined && ownedRank >= reqRank) {
        return true;
      }
    }
  }

  return false;
}

function checkSpecialConditionCode(
  code: string,
  profile: MatchingProfileInput,
): 'matched' | 'missing' | 'unknown' {
  if ((profile.qualificationCodes ?? []).includes(code)) {
    return 'matched';
  }
  if (code === '6501' || code === '6514') {
    return hasDriverLicense(profile.driverLicenses ?? [], 'B') ? 'matched' : 'missing';
  }
  if (code === '6505') {
    return hasDriverLicense(profile.driverLicenses ?? [], 'C') ? 'matched' : 'missing';
  }
  if (code === '6509') {
    return hasDriverLicense(profile.driverLicenses ?? [], 'D') ? 'matched' : 'missing';
  }
  if (code === '6513') {
    return hasDriverLicense(profile.driverLicenses ?? [], 'E') ? 'matched' : 'missing';
  }
  if (code === '6225') {
    return hasCertificate(profile, '6225') ? 'matched' : 'missing';
  }
  if (code === '7111') {
    return hasCertificate(profile, 'YDS-D') ? 'matched' : 'missing';
  }
  if (code === '7113') {
    return hasCertificate(profile, 'YDS-C') ? 'matched' : 'missing';
  }
  if (code === '7115') {
    return hasCertificate(profile, 'YDS-B') ? 'matched' : 'missing';
  }
  return 'unknown';
}

function buildUserEduCodes(profile: MatchingProfileInput): {
  codes: Set<string>;
  hasDeptOrExplicitCode: boolean;
} {
  const codes = new Set<string>(
    (profile.qualificationCodes ?? []).filter((c) => !isSpecialConditionCode(c)),
  );
  const dept = profile.departmentId ? getDepartmentById(profile.departmentId) : undefined;
  if (dept) {
    codes.add(dept.nitelikKodu);
    codes.add(dept.genelNitelikKodu);
    for (const eq of dept.esdegerKodlar) {
      codes.add(eq);
    }
  } else if (profile.educationLevel) {
    codes.add(GENERAL_LEVEL_CODE[profile.educationLevel]);
  }
  return {
    codes,
    hasDeptOrExplicitCode: Boolean(dept || (profile.qualificationCodes ?? []).length > 0),
  };
}

function evaluateQualificationCodes(
  qualificationCodes: string[],
  profile: MatchingProfileInput,
  coveredCerts: string[],
  matchedReasons: string[],
  missingReasons: string[],
  unknownReasons: string[],
): void {
  const eduCodes = qualificationCodes.filter((c) => !isSpecialConditionCode(c));
  const specialCodes = qualificationCodes.filter((c) => isSpecialConditionCode(c));

  if (eduCodes.length > 0) {
    const { codes: userEduCodes, hasDeptOrExplicitCode } = buildUserEduCodes(profile);
    const matchedEdu = eduCodes.filter((code) => userEduCodes.has(code));
    if (matchedEdu.length > 0) {
      const codeDetails = matchedEdu
        .map((code) => {
          const info = getQualificationByCode(code);
          return info ? `${code} (${info.kisaTanim})` : code;
        })
        .join(', ');
      matchedReasons.push(`Nitelik kodu uyumlu: ${codeDetails}`);
    } else if (!hasDeptOrExplicitCode) {
      unknownReasons.push(
        `Bölüm / nitelik kodu profilde belirtilmemiş (Aranan: ${eduCodes.join(', ')})`,
      );
    } else {
      missingReasons.push(`Bölüm / nitelik kodu uyuşmuyor (Aranan: ${eduCodes.join(', ')})`);
    }
  }

  for (const code of specialCodes) {
    if (code === '6225' && coveredCerts.includes('6225')) continue;
    const status = checkSpecialConditionCode(code, profile);
    const info = getQualificationByCode(code);
    const label = info ? `${code} (${info.kisaTanim})` : code;
    if (status === 'matched') {
      matchedReasons.push(`Özel şart sağlanıyor: ${label}`);
    } else if (status === 'missing') {
      missingReasons.push(`Özel şart eksik: ${label}`);
    } else {
      unknownReasons.push(`Özel şart doğrulanamadı: ${label}`);
    }
  }
}

function computeMatchScore(
  matchedCount: number,
  missingCount: number,
  unknownCount: number,
): number {
  const totalChecks = matchedCount + missingCount + unknownCount;
  const rawScore =
    totalChecks === 0
      ? 100
      : ((matchedCount + unknownCount * 0.25) / totalChecks) * 100;
  return Math.round(Math.max(0, Math.min(100, rawScore)));
}

function computeScoreMargin(
  profileScore: number | null | undefined,
  minScore: number | null | undefined,
): number | null {
  if (
    typeof profileScore !== 'number' ||
    !Number.isFinite(profileScore) ||
    typeof minScore !== 'number' ||
    !Number.isFinite(minScore)
  ) {
    return null;
  }
  return Number((profileScore - minScore).toFixed(2));
}

function evaluateSinglePosition(
  profile: MatchingProfileInput,
  announcement: Announcement,
  position: AnnouncementPosition,
): {
  result: MatchedPositionResult;
  matchScore: number;
  matchedReasons: string[];
  unknownReasons: string[];
} {
  const matchedReasons: string[] = [];
  const missingReasons: string[] = [];
  const unknownReasons: string[] = [];

  const reqEducationLevels = position.educationLevel
    ? [position.educationLevel]
    : announcement.criteria.educationLevels;

  if (reqEducationLevels.length > 0) {
    if (!profile.educationLevel) {
      const reqLabels = reqEducationLevels.map((lvl) => EDUCATION_LABELS[lvl]).join(', ');
      unknownReasons.push(`Eğitim düzeyi profilde belirtilmemiş (Aranan: ${reqLabels})`);
    } else if (reqEducationLevels.includes(profile.educationLevel)) {
      matchedReasons.push(`Eğitim düzeyi uyumlu (${EDUCATION_LABELS[profile.educationLevel]})`);
    } else {
      const reqLabels = reqEducationLevels.map((lvl) => EDUCATION_LABELS[lvl]).join(', ');
      missingReasons.push(
        `Eğitim düzeyi uyuşmuyor (Aranan: ${reqLabels}, Profil: ${EDUCATION_LABELS[profile.educationLevel]})`,
      );
    }
  }

  const reqScoreTypes = position.kpssScoreType
    ? [position.kpssScoreType]
    : announcement.criteria.kpssScoreTypes;
  const reqMinScore = position.minKpssScore ?? announcement.criteria.minKpssScore;
  const scoreMargin = computeScoreMargin(profile.kpssScore, reqMinScore);

  if (reqScoreTypes.length === 0 && reqMinScore === null) {
    matchedReasons.push('KPSS puan şartı aranmıyor');
  } else {
    if (reqScoreTypes.length > 0) {
      if (!profile.kpssScoreType) {
        unknownReasons.push(
          `KPSS puan türü profilde belirtilmemiş (Aranan: ${reqScoreTypes.join(', ')})`,
        );
      } else if (reqScoreTypes.includes(profile.kpssScoreType)) {
        matchedReasons.push(`KPSS puan türü uyumlu (${profile.kpssScoreType})`);
      } else {
        missingReasons.push(
          `KPSS puan türü uyuşmuyor (Aranan: ${reqScoreTypes.join(', ')}, Profil: ${profile.kpssScoreType})`,
        );
      }
    }

    if (reqMinScore !== null) {
      if (profile.kpssScore === null || profile.kpssScore === undefined) {
        unknownReasons.push(
          `KPSS puanı profilde belirtilmemiş (En az ${reqMinScore} puan gerekiyor)`,
        );
      } else if (profile.kpssScore >= reqMinScore) {
        matchedReasons.push(`KPSS puanı yeterli (${profile.kpssScore} >= ${reqMinScore})`);
      } else {
        missingReasons.push(`KPSS puanı yetersiz (${profile.kpssScore} < ${reqMinScore})`);
      }
    }
  }

  const posCity = position.city?.trim() || announcement.city;
  const isNationwide = !posCity || normalizeTrSearch(posCity) === 'turkiye geneli';
  if (isNationwide) {
    matchedReasons.push('Türkiye geneli başvuru (ikamet ili uygun)');
  } else if (!profile.residenceCity) {
    unknownReasons.push(`İkamet ili profilde belirtilmemiş (Kadro ili: ${posCity})`);
  } else if (normalizeTrSearch(profile.residenceCity) === normalizeTrSearch(posCity)) {
    matchedReasons.push(`İkamet ili uyumlu (${profile.residenceCity})`);
  } else {
    missingReasons.push(
      `İkamet ili uyuşmuyor (Kadro: ${posCity}, Profil: ${profile.residenceCity})`,
    );
  }

  if (position.militaryRequired) {
    if (!profile.militaryStatus) {
      unknownReasons.push('Askerlik durumu profilde belirtilmemiş');
    } else if (profile.militaryStatus === 'yapildi' || profile.militaryStatus === 'muaf') {
      matchedReasons.push('Askerlik şartı sağlanıyor');
    } else {
      missingReasons.push(
        'Askerlik şartı sağlanmıyor (yapılmış veya muaf olma şartı aranıyor)',
      );
    }
  }

  if (
    position.maxAge !== null &&
    typeof profile.age === 'number' &&
    Number.isFinite(profile.age)
  ) {
    if (profile.age <= position.maxAge) {
      matchedReasons.push(`Yaş şartı sağlanıyor (<= ${position.maxAge})`);
    } else {
      missingReasons.push(
        `Yaş sınırı aşılıyor (Azami: ${position.maxAge}, Profil: ${profile.age})`,
      );
    }
  }

  if (position.qualificationCodes.length > 0) {
    evaluateQualificationCodes(
      position.qualificationCodes,
      profile,
      [],
      matchedReasons,
      missingReasons,
      unknownReasons,
    );
  }

  const eligible = missingReasons.length === 0 && unknownReasons.length === 0;
  const matchScore = computeMatchScore(
    matchedReasons.length,
    missingReasons.length,
    unknownReasons.length,
  );

  return {
    result: {
      id: position.id,
      title: position.title,
      city: posCity,
      quota: position.quota,
      scoreMargin,
      eligible,
      missingReasons,
    },
    matchScore,
    matchedReasons,
    unknownReasons,
  };
}

export function evaluateAnnouncementMatch(
  profile: MatchingProfileInput,
  announcement: Announcement,
): MatchEvaluation {
  if (announcement.positions && announcement.positions.length > 0) {
    const evaluatedPositions = announcement.positions.map((pos) =>
      evaluateSinglePosition(profile, announcement, pos),
    );
    const eligiblePositions = evaluatedPositions.filter((item) => item.result.eligible);
    const matchedPositionCount = eligiblePositions.length;
    const totalPositionCount = evaluatedPositions.length;
    const eligible = matchedPositionCount > 0;

    const bestPosition = (eligiblePositions.length > 0 ? eligiblePositions : evaluatedPositions).reduce(
      (best, curr) => {
        if (curr.matchScore !== best.matchScore) {
          return curr.matchScore > best.matchScore ? curr : best;
        }
        const currMargin = curr.result.scoreMargin ?? -Infinity;
        const bestMargin = best.result.scoreMargin ?? -Infinity;
        return currMargin > bestMargin ? curr : best;
      },
    );

    const margins = (eligiblePositions.length > 0 ? eligiblePositions : evaluatedPositions)
      .map((p) => p.result.scoreMargin)
      .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
    const scoreMargin =
      margins.length > 0
        ? Math.max(...margins)
        : computeScoreMargin(profile.kpssScore, announcement.criteria.minKpssScore);

    const matchedReasons = Array.from(
      new Set([
        `${matchedPositionCount}/${totalPositionCount} kadro profilinizle uyumlu`,
        ...bestPosition.matchedReasons,
      ]),
    );

    return {
      announcementId: announcement.id,
      eligible,
      matchScore: bestPosition.matchScore,
      matchedReasons,
      missingReasons: eligible ? [] : bestPosition.result.missingReasons,
      unknownReasons: eligible ? [] : bestPosition.unknownReasons,
      matchedPositionCount,
      totalPositionCount,
      matchedPositions: evaluatedPositions.map((p) => p.result),
      scoreMargin,
    };
  }

  const matchedReasons: string[] = [];
  const missingReasons: string[] = [];
  const unknownReasons: string[] = [];
  const { criteria } = announcement;

  // 1. Education level
  if (criteria.educationLevels.length > 0) {
    if (!profile.educationLevel) {
      const reqLabels = criteria.educationLevels.map((lvl) => EDUCATION_LABELS[lvl]).join(', ');
      unknownReasons.push(`Eğitim düzeyi profilde belirtilmemiş (Aranan: ${reqLabels})`);
    } else if (criteria.educationLevels.includes(profile.educationLevel)) {
      matchedReasons.push(`Eğitim düzeyi uyumlu (${EDUCATION_LABELS[profile.educationLevel]})`);
    } else {
      const reqLabels = criteria.educationLevels.map((lvl) => EDUCATION_LABELS[lvl]).join(', ');
      missingReasons.push(
        `Eğitim düzeyi uyuşmuyor (Aranan: ${reqLabels}, Profil: ${EDUCATION_LABELS[profile.educationLevel]})`,
      );
    }
  }

  // 2. KPSS score type & minimum score
  if (criteria.kpssScoreTypes.length === 0 && criteria.minKpssScore === null) {
    matchedReasons.push('KPSS puan şartı aranmıyor');
  } else {
    if (criteria.kpssScoreTypes.length > 0) {
      if (!profile.kpssScoreType) {
        unknownReasons.push(
          `KPSS puan türü profilde belirtilmemiş (Aranan: ${criteria.kpssScoreTypes.join(', ')})`,
        );
      } else if (criteria.kpssScoreTypes.includes(profile.kpssScoreType)) {
        matchedReasons.push(`KPSS puan türü uyumlu (${profile.kpssScoreType})`);
      } else {
        missingReasons.push(
          `KPSS puan türü uyuşmuyor (Aranan: ${criteria.kpssScoreTypes.join(', ')}, Profil: ${profile.kpssScoreType})`,
        );
      }
    }

    if (criteria.minKpssScore !== null) {
      if (profile.kpssScore === null || profile.kpssScore === undefined) {
        unknownReasons.push(
          `KPSS puanı profilde belirtilmemiş (En az ${criteria.minKpssScore} puan gerekiyor)`,
        );
      } else if (profile.kpssScore >= criteria.minKpssScore) {
        matchedReasons.push(
          `KPSS puanı yeterli (${profile.kpssScore} >= ${criteria.minKpssScore})`,
        );
      } else {
        missingReasons.push(
          `KPSS puanı yetersiz (${profile.kpssScore} < ${criteria.minKpssScore})`,
        );
      }
    }
  }

  // 3. Residence city
  const effectiveCities =
    criteria.cities.length > 0
      ? criteria.cities
      : announcement.city
        ? [announcement.city]
        : [];
  const isNationwide =
    effectiveCities.length === 0 ||
    effectiveCities.some((c) => normalizeTrSearch(c) === 'turkiye geneli');

  if (isNationwide) {
    matchedReasons.push('Türkiye geneli başvuru (ikamet ili uygun)');
  } else if (!profile.residenceCity) {
    unknownReasons.push(
      `İkamet ili profilde belirtilmemiş (İlan ili: ${effectiveCities.join(', ')})`,
    );
  } else {
    const userCity = normalizeTrSearch(profile.residenceCity);
    const cityMatched = effectiveCities.some((c) => normalizeTrSearch(c) === userCity);
    if (cityMatched) {
      matchedReasons.push(`İkamet ili uyumlu (${profile.residenceCity})`);
    } else {
      missingReasons.push(
        `İkamet ili uyuşmuyor (İlan: ${effectiveCities.join(', ')}, Profil: ${profile.residenceCity})`,
      );
    }
  }

  // 4. Military status
  if (criteria.militaryRequired) {
    if (!profile.militaryStatus) {
      unknownReasons.push('Askerlik durumu profilde belirtilmemiş');
    } else if (profile.militaryStatus === 'yapildi' || profile.militaryStatus === 'muaf') {
      matchedReasons.push('Askerlik şartı sağlanıyor');
    } else {
      missingReasons.push(
        'Askerlik şartı sağlanmıyor (yapılmış veya muaf olma şartı aranıyor)',
      );
    }
  }

  // 5. Driver licenses
  if (criteria.driverLicenses.length > 0) {
    const userLicenses = profile.driverLicenses ?? [];
    const matchedLicense = criteria.driverLicenses.find((req) =>
      hasDriverLicense(userLicenses, req),
    );
    if (matchedLicense) {
      matchedReasons.push(`Sürücü belgesi uygun (${matchedLicense} sınıfı)`);
    } else {
      missingReasons.push(
        `Sürücü belgesi eksik (Aranan: ${criteria.driverLicenses.join(' veya ')})`,
      );
    }
  }

  // 6. Certificates
  if (criteria.certificates.length > 0) {
    const missingCerts: string[] = [];
    const matchedCerts: string[] = [];
    for (const cert of criteria.certificates) {
      if (hasCertificate(profile, cert)) {
        matchedCerts.push(cert);
      } else {
        missingCerts.push(cert);
      }
    }
    if (matchedCerts.length > 0 && missingCerts.length === 0) {
      matchedReasons.push(`Sertifika / belge şartı uygun (${matchedCerts.join(', ')})`);
    } else if (missingCerts.length > 0) {
      missingReasons.push(`Eksik sertifika veya belge (${missingCerts.join(', ')})`);
    }
  }

  // 7. Qualification codes (education + special codes)
  evaluateQualificationCodes(
    criteria.qualificationCodes,
    profile,
    criteria.certificates,
    matchedReasons,
    missingReasons,
    unknownReasons,
  );

  const eligible = missingReasons.length === 0 && unknownReasons.length === 0;
  const matchScore = computeMatchScore(
    matchedReasons.length,
    missingReasons.length,
    unknownReasons.length,
  );

  return {
    announcementId: announcement.id,
    eligible,
    matchScore,
    matchedReasons,
    missingReasons,
    unknownReasons,
    scoreMargin: computeScoreMargin(profile.kpssScore, criteria.minKpssScore),
  };
}

export function matchAnnouncementsForProfile(
  profile: MatchingProfileInput,
  announcements: Announcement[],
): AnnouncementMatchResult[] {
  return announcements
    .map((announcement) => ({
      announcement,
      evaluation: evaluateAnnouncementMatch(profile, announcement),
    }))
    .sort((a, b) => {
      if (a.evaluation.eligible !== b.evaluation.eligible) {
        return a.evaluation.eligible ? -1 : 1;
      }
      if (b.evaluation.matchScore !== a.evaluation.matchScore) {
        return b.evaluation.matchScore - a.evaluation.matchScore;
      }
      if (a.announcement.status !== b.announcement.status) {
        return a.announcement.status === 'acik' ? -1 : 1;
      }
      return a.announcement.deadlineAt.localeCompare(b.announcement.deadlineAt);
    });
}
