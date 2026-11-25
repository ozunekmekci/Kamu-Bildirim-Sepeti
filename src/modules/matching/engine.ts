import { getDepartmentById } from '@/data/departments';
import { getQualificationByCode, isSpecialConditionCode } from '@/data/qualifications';
import { normalizeTr, normalizeTrSearch } from '@/lib/turkish';
import { Announcement, MilitaryStatus } from '@/modules/announcements/types';

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
}

export interface MatchEvaluation {
  announcementId: string;
  eligible: boolean;
  matchScore: number;
  matchedReasons: string[];
  missingReasons: string[];
  unknownReasons: string[];
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

function hasCertificate(
  profile: MatchingProfileInput,
  requiredCert: string
): boolean {
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
  profile: MatchingProfileInput
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

export function evaluateAnnouncementMatch(
  profile: MatchingProfileInput,
  announcement: Announcement
): MatchEvaluation {
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
        `Eğitim düzeyi uyuşmuyor (Aranan: ${reqLabels}, Profil: ${EDUCATION_LABELS[profile.educationLevel]})`
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
          `KPSS puan türü profilde belirtilmemiş (Aranan: ${criteria.kpssScoreTypes.join(', ')})`
        );
      } else if (criteria.kpssScoreTypes.includes(profile.kpssScoreType)) {
        matchedReasons.push(`KPSS puan türü uyumlu (${profile.kpssScoreType})`);
      } else {
        missingReasons.push(
          `KPSS puan türü uyuşmuyor (Aranan: ${criteria.kpssScoreTypes.join(', ')}, Profil: ${profile.kpssScoreType})`
        );
      }
    }

    if (criteria.minKpssScore !== null) {
      if (profile.kpssScore === null || profile.kpssScore === undefined) {
        unknownReasons.push(
          `KPSS puanı profilde belirtilmemiş (En az ${criteria.minKpssScore} puan gerekiyor)`
        );
      } else if (profile.kpssScore >= criteria.minKpssScore) {
        matchedReasons.push(
          `KPSS puanı yeterli (${profile.kpssScore} >= ${criteria.minKpssScore})`
        );
      } else {
        missingReasons.push(
          `KPSS puanı yetersiz (${profile.kpssScore} < ${criteria.minKpssScore})`
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
      `İkamet ili profilde belirtilmemiş (İlan ili: ${effectiveCities.join(', ')})`
    );
  } else {
    const userCity = normalizeTrSearch(profile.residenceCity);
    const cityMatched = effectiveCities.some((c) => normalizeTrSearch(c) === userCity);
    if (cityMatched) {
      matchedReasons.push(`İkamet ili uyumlu (${profile.residenceCity})`);
    } else {
      missingReasons.push(
        `İkamet ili uyuşmuyor (İlan: ${effectiveCities.join(', ')}, Profil: ${profile.residenceCity})`
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
        'Askerlik şartı sağlanmıyor (yapılmış veya muaf olma şartı aranıyor)'
      );
    }
  }

  // 5. Driver licenses
  if (criteria.driverLicenses.length > 0) {
    const userLicenses = profile.driverLicenses ?? [];
    const matchedLicense = criteria.driverLicenses.find((req) =>
      hasDriverLicense(userLicenses, req)
    );
    if (matchedLicense) {
      matchedReasons.push(`Sürücü belgesi uygun (${matchedLicense} sınıfı)`);
    } else {
      missingReasons.push(
        `Sürücü belgesi eksik (Aranan: ${criteria.driverLicenses.join(' veya ')})`
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
  const eduCodes = criteria.qualificationCodes.filter((c) => !isSpecialConditionCode(c));
  const specialCodes = criteria.qualificationCodes.filter((c) => isSpecialConditionCode(c));

  if (eduCodes.length > 0) {
    const userEduCodes = new Set<string>(
      (profile.qualificationCodes ?? []).filter((c) => !isSpecialConditionCode(c))
    );
    const dept = profile.departmentId ? getDepartmentById(profile.departmentId) : undefined;
    if (dept) {
      userEduCodes.add(dept.nitelikKodu);
      userEduCodes.add(dept.genelNitelikKodu);
      for (const eq of dept.esdegerKodlar) {
        userEduCodes.add(eq);
      }
    } else if (profile.educationLevel) {
      userEduCodes.add(GENERAL_LEVEL_CODE[profile.educationLevel]);
    }

    const matchedEdu = eduCodes.filter((code) => userEduCodes.has(code));
    if (matchedEdu.length > 0) {
      const codeDetails = matchedEdu
        .map((code) => {
          const info = getQualificationByCode(code);
          return info ? `${code} (${info.kisaTanim})` : code;
        })
        .join(', ');
      matchedReasons.push(`Nitelik kodu uyumlu: ${codeDetails}`);
    } else if (!dept && (profile.qualificationCodes ?? []).length === 0) {
      unknownReasons.push(
        `Bölüm / nitelik kodu profilde belirtilmemiş (Aranan: ${eduCodes.join(', ')})`
      );
    } else {
      missingReasons.push(`Bölüm / nitelik kodu uyuşmuyor (Aranan: ${eduCodes.join(', ')})`);
    }
  }

  for (const code of specialCodes) {
    // Avoid duplicating certificate checks already evaluated in criteria.certificates
    if (code === '6225' && criteria.certificates.includes('6225')) continue;
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

  const eligible = missingReasons.length === 0 && unknownReasons.length === 0;
  const totalChecks =
    matchedReasons.length + missingReasons.length + unknownReasons.length;
  const rawScore =
    totalChecks === 0
      ? 100
      : ((matchedReasons.length + unknownReasons.length * 0.25) / totalChecks) * 100;
  const matchScore = Math.round(Math.max(0, Math.min(100, rawScore)));

  return {
    announcementId: announcement.id,
    eligible,
    matchScore,
    matchedReasons,
    missingReasons,
    unknownReasons,
  };
}

export function matchAnnouncementsForProfile(
  profile: MatchingProfileInput,
  announcements: Announcement[]
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
