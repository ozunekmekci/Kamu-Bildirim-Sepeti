export type AnnouncementSource =
  | 'kariyer_kapisi'
  | 'sbb'
  | 'iskur'
  | 'resmi_gazete'
  | 'osym_kpss';

export type AnnouncementCategory = 'atama' | 'personel_alimi' | 'gorevlendirme';

export type AnnouncementStatus = 'acik' | 'kapali';

export type MilitaryStatus = 'yapildi' | 'muaf' | 'tecilli' | 'ilgisiz';

export type EmploymentType =
  | 'memur_a'
  | 'memur_b'
  | 'sozlesmeli_4b'
  | 'akademik'
  | 'isci'
  | 'askeri_guvenlik'
  | 'gorevde_yukselme'
  | 'diger';

export type ExamType =
  | 'kpss_only'
  | 'oral_exam'
  | 'written_and_oral'
  | 'practice_exam'
  | 'unspecified';

export type NoticeType = 'ilan' | 'duzeltme' | 'iptal' | 'sonuc';

export type EnrichmentStatus = 'pending' | 'enriched' | 'partial';

export interface VerifiedSourceRef {
  source: AnnouncementSource;
  sourceName: string;
  url: string;
}

export interface AnnouncementPosition {
  id: string;
  announcementId: string;
  title: string;
  unvan: string | null;
  city: string;
  district: string | null;
  quota: number | null;
  educationLevel: 'lisans' | 'onlisans' | 'ortaogretim' | null;
  kpssScoreType: 'P3' | 'P93' | 'P94' | null;
  minKpssScore: number | null;
  maxAge: number | null;
  militaryRequired: boolean;
  qualificationCodes: string[];
  evaluationMethod: string | null;
  isInterviewFree: boolean;
  requirementsSummary: string;
}

export interface SourceCheckpoint {
  source: string;
  etag: string | null;
  lastModified: string | null;
  bodyHash: string | null;
  lastCheckedAt: string;
  lastChangedAt: string | null;
  activeCount: number;
  lastError: string | null;
}

export interface AnnouncementCriteria {
  educationLevels: ('lisans' | 'onlisans' | 'ortaogretim')[];
  kpssScoreTypes: ('P3' | 'P93' | 'P94')[];
  minKpssScore: number | null;
  cities: string[];
  militaryRequired: boolean;
  driverLicenses: string[];
  certificates: string[];
  qualificationCodes: string[];
  summaryLines: string[];
  departments?: string[];
  maxAge?: number | null;
  gender?: 'kadin' | 'erkek' | 'hepsi' | null;
  extractedTextExcerpt?: string | null;
}

export interface Announcement {
  id: string;
  externalId: string;
  source: AnnouncementSource;
  sourceName: string;
  sourceUrl: string;
  institution: string;
  title: string;
  category: AnnouncementCategory;
  city: string;
  status: AnnouncementStatus;
  publishedAt: string;
  deadlineAt: string;
  quota: number | null;
  summary: string;
  criteria: AnnouncementCriteria;
  employmentType?: EmploymentType;
  noticeType?: NoticeType;
  examType?: ExamType;
  organizationUnit?: string | null;
  applyUrl?: string | null;
  verifiedSources?: VerifiedSourceRef[];
  enrichmentStatus?: EnrichmentStatus;
  contentHash?: string | null;
  lastSeenAt?: string | null;
  isDemo?: boolean;
  positions?: AnnouncementPosition[];
  positionsCount?: number;
}

export interface AnnouncementFilter {
  status?: AnnouncementStatus | 'hepsi';
  category?: AnnouncementCategory | 'hepsi';
  source?: AnnouncementSource | 'hepsi';
  employmentType?: EmploymentType | 'hepsi';
  examType?: ExamType | 'hepsi';
  noticeType?: NoticeType | 'hepsi';
  city?: string;
  q?: string;
  educationLevel?: 'lisans' | 'onlisans' | 'ortaogretim' | 'hepsi';
  kpssScoreType?: 'P3' | 'P93' | 'P94' | 'hepsi';
  maxKpssScore?: number;
  driverLicense?: string;
  department?: string;
}

export interface AnnouncementFacets {
  categories: Record<AnnouncementCategory, number>;
  sources: Record<AnnouncementSource, number>;
  statuses: Record<AnnouncementStatus, number>;
  cities: string[];
}

export interface FetchErrorItem {
  source: AnnouncementSource;
  sourceName: string;
  url: string;
  message: string;
}

export interface FetchOfficialResult {
  items: Announcement[];
  errors: FetchErrorItem[];
}

export interface SyncOfficialResult {
  syncedCount: number;
  items: Announcement[];
  errors: FetchErrorItem[];
}
