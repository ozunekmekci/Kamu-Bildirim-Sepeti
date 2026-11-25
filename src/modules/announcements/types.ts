export type AnnouncementSource = 'kariyer_kapisi' | 'iskur' | 'resmi_gazete' | 'osym_kpss';

export type AnnouncementCategory = 'atama' | 'personel_alimi' | 'gorevlendirme';

export type AnnouncementStatus = 'acik' | 'kapali';

export type MilitaryStatus = 'yapildi' | 'muaf' | 'tecilli' | 'ilgisiz';

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
}

export interface AnnouncementFilter {
  status?: AnnouncementStatus | 'hepsi';
  category?: AnnouncementCategory | 'hepsi';
  source?: AnnouncementSource | 'hepsi';
  city?: string;
  q?: string;
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
