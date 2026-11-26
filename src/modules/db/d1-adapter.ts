import { normalizeTrSearch } from '@/lib/turkish';
import {
  INITIAL_ANNOUNCEMENTS,
  classifyAnnouncement,
  filterAnnouncements,
  isPublicRecruitmentResmiGazeteItem,
} from '@/modules/announcements';
import type {
  Announcement,
  AnnouncementCriteria,
  AnnouncementPosition,
  EmploymentType,
  EnrichmentStatus,
  ExamType,
  MilitaryStatus,
  NoticeType,
  SourceCheckpoint,
  VerifiedSourceRef,
} from '@/modules/announcements/types';
import type {
  AuthToken,
  AuthTokenPurpose,
  CreateUserInput,
  DatabaseAdapter,
  EducationLevel,
  KpssScoreType,
  ListAnnouncementsFilter,
  NotificationPreferences,
  PlanTier,
  PruneRowsResult,
  PushSubscriptionRecord,
  ReminderLog,
  SavedAnnouncementRecord,
  SavedAnnouncementWithItem,
  SavedSearchFilters,
  SavedSearchRecord,
  Session,
  StoredUser,
  Subscription,
  SubscriptionStatus,
  SyncRun,
  UpsertAnnouncementsResult,
  UserProfile,
} from './types';

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

const LEGACY_SEED_ID_PATTERN = /^(kk|isk|rg)-2026-\d+$/i;
const D1_BATCH_CHUNK_SIZE = 30;

export function isLegacySeedId(id: string): boolean {
  return LEGACY_SEED_ID_PATTERN.test(id);
}

export function isDemoAnnouncement(item: Pick<Announcement, 'id' | 'isDemo'>): boolean {
  return item.isDemo === true || isLegacySeedId(item.id);
}

export function mergeVerifiedSources(
  existing: VerifiedSourceRef[] | undefined,
  incoming: VerifiedSourceRef[] | undefined,
): VerifiedSourceRef[] {
  const seen = new Set<string>();
  const merged: VerifiedSourceRef[] = [];
  for (const ref of [...(existing ?? []), ...(incoming ?? [])]) {
    if (!ref || !ref.source || !ref.url) continue;
    const key = `${ref.source}:${ref.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...ref });
  }
  return merged;
}

export function isNoisyNonRecruitmentRow(
  item: Pick<Announcement, 'id' | 'source' | 'title' | 'summary' | 'isDemo'> & {
    sourceUrl?: string;
  },
): boolean {
  if (isDemoAnnouncement(item)) return false;
  if (item.source === 'resmi_gazete') {
    return !isPublicRecruitmentResmiGazeteItem(item.title, item.summary);
  }
  if (item.source === 'iskur') {
    const norm = normalizeTrSearch(`${item.title} ${item.summary}`);
    const hasStrongHiring =
      norm.includes('memur') ||
      norm.includes('personel alim') ||
      norm.includes('personel istihdam') ||
      norm.includes('sozlesmeli') ||
      norm.includes('isci alim') ||
      norm.includes('kadro') ||
      norm.includes('uzman yardimci') ||
      norm.includes('mufettis yardimci') ||
      norm.includes('kpss') ||
      norm.includes('zabita') ||
      norm.includes('itfaiye');

    if (item.sourceUrl && item.sourceUrl.includes('/duyurular/') && !hasStrongHiring) {
      return true;
    }

    const hasExplicitJunk =
      norm.includes('ihale') ||
      norm.includes('mal alimi') ||
      norm.includes('hizmet alimi') ||
      norm.includes('yapim isi') ||
      norm.includes('kiralama isi') ||
      norm.includes('satinalma') ||
      /\bdns\b/.test(norm) ||
      /\bsiem\b/.test(norm) ||
      norm.includes('televizyon') ||
      norm.includes('stratejik plan') ||
      norm.includes('tadilat') ||
      norm.includes('onarim') ||
      norm.includes('ekipman') ||
      norm.includes('zeyilname') ||
      norm.includes('proje basvur') ||
      (/\blisans\b/.test(norm) && !norm.includes('mezun') && !norm.includes('onlisans'));

    if (hasExplicitJunk && !hasStrongHiring) {
      return true;
    }
  }
  return false;
}

function safeParseArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeParseVerifiedSources(raw: unknown): VerifiedSourceRef[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is VerifiedSourceRef =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as VerifiedSourceRef).source === 'string' &&
        typeof (item as VerifiedSourceRef).sourceName === 'string' &&
        typeof (item as VerifiedSourceRef).url === 'string',
    );
  } catch {
    return [];
  }
}

function safeParseSavedSearchFilters(raw: unknown): SavedSearchFilters {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    const filters: SavedSearchFilters = {};
    for (const key of [
      'q',
      'city',
      'category',
      'source',
      'status',
      'employmentType',
      'examType',
      'noticeType',
      'educationLevel',
      'kpssScoreType',
      'maxKpssScore',
      'driverLicense',
      'department',
    ] as const) {
      if (typeof record[key] === 'string' && record[key]) {
        filters[key] = record[key];
      }
    }
    return filters;
  } catch {
    return {};
  }
}

function safeParseCriteria(raw: unknown): AnnouncementCriteria {
  const fallback: AnnouncementCriteria = {
    educationLevels: [],
    kpssScoreTypes: [],
    minKpssScore: null,
    cities: [],
    militaryRequired: false,
    driverLicenses: [],
    certificates: [],
    qualificationCodes: [],
    summaryLines: [],
  };
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<AnnouncementCriteria>;
    const criteria: AnnouncementCriteria = {
      educationLevels: Array.isArray(parsed.educationLevels) ? parsed.educationLevels : [],
      kpssScoreTypes: Array.isArray(parsed.kpssScoreTypes) ? parsed.kpssScoreTypes : [],
      minKpssScore: typeof parsed.minKpssScore === 'number' ? parsed.minKpssScore : null,
      cities: Array.isArray(parsed.cities) ? parsed.cities : [],
      militaryRequired: Boolean(parsed.militaryRequired),
      driverLicenses: Array.isArray(parsed.driverLicenses) ? parsed.driverLicenses : [],
      certificates: Array.isArray(parsed.certificates) ? parsed.certificates : [],
      qualificationCodes: Array.isArray(parsed.qualificationCodes)
        ? parsed.qualificationCodes
        : [],
      summaryLines: Array.isArray(parsed.summaryLines) ? parsed.summaryLines : [],
    };
    if (Array.isArray(parsed.departments)) {
      criteria.departments = parsed.departments.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      );
    }
    if (typeof parsed.maxAge === 'number' && Number.isFinite(parsed.maxAge)) {
      criteria.maxAge = parsed.maxAge;
    } else if (parsed.maxAge === null) {
      criteria.maxAge = null;
    }
    if (parsed.gender === 'kadin' || parsed.gender === 'erkek' || parsed.gender === 'hepsi') {
      criteria.gender = parsed.gender;
    } else if (parsed.gender === null) {
      criteria.gender = null;
    }
    if (typeof parsed.extractedTextExcerpt === 'string') {
      criteria.extractedTextExcerpt = parsed.extractedTextExcerpt;
    } else if (parsed.extractedTextExcerpt === null) {
      criteria.extractedTextExcerpt = null;
    }
    return criteria;
  } catch {
    return fallback;
  }
}

function mapUserRow(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    fullName: row.full_name != null ? String(row.full_name) : null,
    phone: row.phone != null ? String(row.phone) : null,
    emailVerifiedAt: row.email_verified_at != null ? String(row.email_verified_at) : null,
    acceptedTermsAt: String(row.accepted_terms_at),
    acceptedPrivacyAt: String(row.accepted_privacy_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAnnouncementRow(row: Record<string, unknown>): Announcement {
  const id = String(row.id);
  const source = String(row.source) as Announcement['source'];
  const institution = String(row.institution);
  const title = String(row.title);
  const summary = String(row.summary);

  const hasEmploymentType = typeof row.employment_type === 'string' && row.employment_type.length > 0;
  const hasNoticeType = typeof row.notice_type === 'string' && row.notice_type.length > 0;
  const hasExamType = typeof row.exam_type === 'string' && row.exam_type.length > 0;
  const fallbackClassification =
    hasEmploymentType && hasNoticeType && hasExamType
      ? null
      : classifyAnnouncement({ source, institution, title, description: summary });

  return {
    id,
    externalId: String(row.external_id),
    source,
    sourceName: String(row.source_name),
    sourceUrl: String(row.source_url),
    institution,
    title,
    category: String(row.category) as Announcement['category'],
    city: String(row.city),
    status: String(row.status) as Announcement['status'],
    publishedAt: String(row.published_at),
    deadlineAt: String(row.deadline_at),
    quota:
      typeof row.quota === 'number'
        ? row.quota
        : row.quota != null
          ? Number(row.quota)
          : null,
    summary,
    criteria: safeParseCriteria(row.criteria_json),
    employmentType: hasEmploymentType
      ? (String(row.employment_type) as EmploymentType)
      : fallbackClassification?.employmentType ?? 'diger',
    noticeType: hasNoticeType
      ? (String(row.notice_type) as NoticeType)
      : fallbackClassification?.noticeType ?? 'ilan',
    examType: hasExamType
      ? (String(row.exam_type) as ExamType)
      : fallbackClassification?.examType ?? 'unspecified',
    organizationUnit: row.organization_unit != null ? String(row.organization_unit) : null,
    applyUrl: row.apply_url != null ? String(row.apply_url) : null,
    verifiedSources: safeParseVerifiedSources(row.verified_sources_json),
    enrichmentStatus:
      typeof row.enrichment_status === 'string' && row.enrichment_status
        ? (String(row.enrichment_status) as EnrichmentStatus)
        : 'pending',
    contentHash: row.content_hash != null ? String(row.content_hash) : null,
    lastSeenAt: row.last_seen_at != null ? String(row.last_seen_at) : null,
    isDemo: row.is_demo != null ? Boolean(Number(row.is_demo)) : isLegacySeedId(id),
  };
}

function mapPositionRow(row: Record<string, unknown>): AnnouncementPosition {
  return {
    id: String(row.id),
    announcementId: String(row.announcement_id),
    title: String(row.title),
    unvan: row.unvan != null ? String(row.unvan) : null,
    city: String(row.city),
    district: row.district != null ? String(row.district) : null,
    quota:
      typeof row.quota === 'number'
        ? row.quota
        : row.quota != null
          ? Number(row.quota)
          : null,
    educationLevel:
      row.education_level != null
        ? (String(row.education_level) as AnnouncementPosition['educationLevel'])
        : null,
    kpssScoreType:
      row.kpss_score_type != null
        ? (String(row.kpss_score_type) as AnnouncementPosition['kpssScoreType'])
        : null,
    minKpssScore:
      typeof row.min_kpss_score === 'number'
        ? row.min_kpss_score
        : row.min_kpss_score != null
          ? Number(row.min_kpss_score)
          : null,
    maxAge:
      typeof row.max_age === 'number'
        ? row.max_age
        : row.max_age != null
          ? Number(row.max_age)
          : null,
    militaryRequired: Boolean(Number(row.military_required ?? 0)),
    qualificationCodes: safeParseArray(row.qualification_codes_json),
    evaluationMethod: row.evaluation_method != null ? String(row.evaluation_method) : null,
    isInterviewFree: Boolean(Number(row.is_interview_free ?? 0)),
    requirementsSummary: String(row.requirements_summary ?? ''),
  };
}

function mapCheckpointRow(row: Record<string, unknown>): SourceCheckpoint {
  return {
    source: String(row.source),
    etag: row.etag != null ? String(row.etag) : null,
    lastModified: row.last_modified != null ? String(row.last_modified) : null,
    bodyHash: row.body_hash != null ? String(row.body_hash) : null,
    lastCheckedAt: String(row.last_checked_at),
    lastChangedAt: row.last_changed_at != null ? String(row.last_changed_at) : null,
    activeCount: Number(row.active_count ?? 0),
    lastError: row.last_error != null ? String(row.last_error) : null,
  };
}

function mapSavedSearchRow(row: Record<string, unknown>): SavedSearchRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    filters: safeParseSavedSearchFilters(row.filters_json),
    notifyPush: Boolean(Number(row.notify_push ?? 1)),
    notifyEmail: Boolean(Number(row.notify_email ?? 1)),
    createdAt: String(row.created_at),
  };
}

function mapPrefsRow(row: Record<string, unknown>): NotificationPreferences {
  return {
    userId: String(row.user_id),
    emailEnabled: Boolean(Number(row.email_enabled)),
    instantNewAnnouncements: Boolean(Number(row.instant_new_announcements)),
    deadlineRemindersEnabled: Boolean(Number(row.deadline_reminders_enabled)),
    reminderDaysBefore: Number(row.reminder_days_before ?? 3),
    onlyMatchingProfile: Boolean(Number(row.only_matching_profile)),
    updatedAt: String(row.updated_at),
  };
}

function mapPushSubscriptionRow(row: Record<string, unknown>): PushSubscriptionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    userAgent: row.user_agent != null ? String(row.user_agent) : null,
    createdAt: String(row.created_at),
  };
}

export class D1Adapter implements DatabaseAdapter {
  private seededPromise: Promise<void> | null = null;

  constructor(private readonly db: D1DatabaseLike) {}

  private async runBatched(stmts: D1PreparedStatementLike[]): Promise<void> {
    for (let i = 0; i < stmts.length; i += D1_BATCH_CHUNK_SIZE) {
      await this.db.batch(stmts.slice(i, i + D1_BATCH_CHUNK_SIZE));
    }
  }

  private async ensureSeeded(): Promise<void> {
    if (!this.seededPromise) {
      this.seededPromise = (async () => {
        const countRow = await this.db
          .prepare('SELECT COUNT(*) as total FROM announcements')
          .first<{ total: number }>();
        if (countRow && Number(countRow.total) > 0) {
          return;
        }
        const now = new Date().toISOString();
        const stmts = INITIAL_ANNOUNCEMENTS.map((item) => {
          const cls = classifyAnnouncement({
            source: item.source,
            institution: item.institution,
            title: item.title,
            description: item.summary,
          });
          return this.db
            .prepare(
              `INSERT OR IGNORE INTO announcements (
                id, external_id, source, source_name, source_url, institution,
                title, category, city, status, published_at, deadline_at,
                quota, summary, criteria_json, created_at, updated_at,
                employment_type, notice_type, exam_type, enrichment_status, is_demo
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              item.id,
              item.externalId,
              item.source,
              item.sourceName,
              item.sourceUrl,
              item.institution,
              item.title,
              item.category,
              item.city,
              item.status,
              item.publishedAt,
              item.deadlineAt,
              item.quota,
              item.summary,
              JSON.stringify(item.criteria),
              now,
              now,
              item.employmentType ?? cls.employmentType,
              item.noticeType ?? cls.noticeType,
              item.examType ?? cls.examType,
              item.enrichmentStatus ?? 'enriched',
              1,
            );
        });
        if (stmts.length > 0) {
          await this.runBatched(stmts);
        }
      })().catch((err) => {
        this.seededPromise = null;
        throw err;
      });
    }
    await this.seededPromise;
  }

  async createUser(input: CreateUserInput): Promise<StoredUser> {
    const email = input.email.trim().toLowerCase();
    await this.db
      .prepare(
        `INSERT INTO users (
          id, email, password_hash, full_name, phone,
          accepted_terms_at, accepted_privacy_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        email,
        input.passwordHash,
        input.fullName ?? null,
        input.phone ?? null,
        input.acceptedTermsAt,
        input.acceptedPrivacyAt,
        input.now,
        input.now,
      )
      .run();

    return {
      id: input.id,
      email,
      passwordHash: input.passwordHash,
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
      emailVerifiedAt: null,
      acceptedTermsAt: input.acceptedTermsAt,
      acceptedPrivacyAt: input.acceptedPrivacyAt,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .bind(email.trim().toLowerCase())
      .first<Record<string, unknown>>();
    return row ? mapUserRow(row) : null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? mapUserRow(row) : null;
  }

  async updateUserAccount(
    userId: string,
    patch: { fullName?: string | null; phone?: string | null; now: string },
  ): Promise<StoredUser | null> {
    const existing = await this.findUserById(userId);
    if (!existing) return null;

    const fullName = patch.fullName !== undefined ? patch.fullName : existing.fullName;
    const phone = patch.phone !== undefined ? patch.phone : existing.phone;

    await this.db
      .prepare('UPDATE users SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?')
      .bind(fullName, phone, patch.now, userId)
      .run();

    return {
      ...existing,
      fullName,
      phone,
      updatedAt: patch.now,
    };
  }

  async markEmailVerified(userId: string, verifiedAt: string): Promise<StoredUser | null> {
    const existing = await this.findUserById(userId);
    if (!existing) return null;

    await this.db
      .prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?')
      .bind(verifiedAt, verifiedAt, userId)
      .run();

    return {
      ...existing,
      emailVerifiedAt: verifiedAt,
      updatedAt: verifiedAt,
    };
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
    now: string,
  ): Promise<StoredUser | null> {
    const existing = await this.findUserById(userId);
    if (!existing) return null;

    await this.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(passwordHash, now, userId)
      .run();

    return {
      ...existing,
      passwordHash,
      updatedAt: now,
    };
  }

  async deleteUser(userId: string): Promise<boolean> {
    const existing = await this.findUserById(userId);
    if (!existing) return false;

    await this.db.batch([
      this.db.prepare('DELETE FROM saved_searches WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM saved_announcements WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM reminder_logs WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM notification_prefs WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM user_profiles WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    ]);
    return true;
  }

  async createSession(session: Session): Promise<Session> {
    await this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt)
      .run();
    return { ...session };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const row = await this.db
      .prepare('SELECT * FROM sessions WHERE token_hash = ? LIMIT 1')
      .bind(tokenHash)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      tokenHash: String(row.token_hash),
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
    };
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  }

  async createAuthToken(token: AuthToken): Promise<AuthToken> {
    await this.db
      .prepare(
        `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        token.id,
        token.userId,
        token.purpose,
        token.tokenHash,
        token.expiresAt,
        token.usedAt,
        token.createdAt,
      )
      .run();
    return { ...token };
  }

  async findAuthTokenByHash(
    tokenHash: string,
    purpose: AuthTokenPurpose,
  ): Promise<AuthToken | null> {
    const row = await this.db
      .prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ? LIMIT 1')
      .bind(tokenHash, purpose)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      purpose: String(row.purpose) as AuthTokenPurpose,
      tokenHash: String(row.token_hash),
      expiresAt: String(row.expires_at),
      usedAt: row.used_at != null ? String(row.used_at) : null,
      createdAt: String(row.created_at),
    };
  }

  async markAuthTokenUsed(id: string, usedAt: string): Promise<void> {
    await this.db
      .prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?')
      .bind(usedAt, id)
      .run();
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const row = await this.db
      .prepare('SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1')
      .bind(userId)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      userId: String(row.user_id),
      educationLevel: (row.education_level as EducationLevel | null) ?? null,
      departmentId: row.department_id != null ? String(row.department_id) : null,
      kpssScoreType: (row.kpss_score_type as KpssScoreType | null) ?? null,
      kpssScore:
        typeof row.kpss_score === 'number'
          ? row.kpss_score
          : row.kpss_score != null
            ? Number(row.kpss_score)
            : null,
      residenceCity: row.residence_city != null ? String(row.residence_city) : null,
      militaryStatus: (row.military_status as MilitaryStatus | null) ?? null,
      driverLicenses: safeParseArray(row.driver_licenses_json),
      certificates: safeParseArray(row.certificates_json),
      qualificationCodes: safeParseArray(row.qualification_codes_json),
      updatedAt: String(row.updated_at),
    };
  }

  async upsertProfile(profile: UserProfile): Promise<UserProfile> {
    await this.db
      .prepare(
        `INSERT INTO user_profiles (
          user_id, education_level, department_id, kpss_score_type, kpss_score,
          residence_city, military_status, driver_licenses_json, certificates_json,
          qualification_codes_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          education_level = excluded.education_level,
          department_id = excluded.department_id,
          kpss_score_type = excluded.kpss_score_type,
          kpss_score = excluded.kpss_score,
          residence_city = excluded.residence_city,
          military_status = excluded.military_status,
          driver_licenses_json = excluded.driver_licenses_json,
          certificates_json = excluded.certificates_json,
          qualification_codes_json = excluded.qualification_codes_json,
          updated_at = excluded.updated_at`,
      )
      .bind(
        profile.userId,
        profile.educationLevel,
        profile.departmentId,
        profile.kpssScoreType,
        profile.kpssScore,
        profile.residenceCity,
        profile.militaryStatus,
        JSON.stringify(profile.driverLicenses),
        JSON.stringify(profile.certificates),
        JSON.stringify(profile.qualificationCodes),
        profile.updatedAt,
      )
      .run();
    return { ...profile };
  }

  async listAnnouncements(filter?: ListAnnouncementsFilter): Promise<Announcement[]> {
    await this.ensureSeeded();
    const res = await this.db
      .prepare('SELECT * FROM announcements ORDER BY published_at DESC')
      .all<Record<string, unknown>>();
    const all = (res.results ?? []).map(mapAnnouncementRow);
    const hasLive = all.some((item) => !isDemoAnnouncement(item));
    const shouldExcludeDemo =
      filter?.excludeDemo === true || (filter?.excludeDemo !== false && hasLive);

    const candidates = shouldExcludeDemo
      ? all.filter((item) => !isDemoAnnouncement(item))
      : all;

    const filtered = filterAnnouncements(candidates, filter);
    if (filtered.length === 0) return [];

    const positionsMap = await this.listPositionsForAnnouncements(
      filtered.map((item) => item.id),
    );
    return filtered.map((item) => {
      const positions = positionsMap[item.id] ?? [];
      return {
        ...item,
        positions,
        positionsCount: positions.length,
      };
    });
  }

  async getAnnouncementById(id: string): Promise<Announcement | null> {
    await this.ensureSeeded();
    const row = await this.db
      .prepare('SELECT * FROM announcements WHERE id = ? LIMIT 1')
      .bind(id)
      .first<Record<string, unknown>>();
    if (!row) return null;
    const item = mapAnnouncementRow(row);
    const positions = await this.listAnnouncementPositions(item.id);
    return {
      ...item,
      positions,
      positionsCount: positions.length,
    };
  }

  async upsertAnnouncements(items: Announcement[]): Promise<UpsertAnnouncementsResult> {
    await this.ensureSeeded();
    if (items.length === 0) {
      const countRow = await this.db
        .prepare('SELECT COUNT(*) as total FROM announcements')
        .first<{ total: number }>();
      return { inserted: 0, updated: 0, total: countRow ? Number(countRow.total) : 0 };
    }

    const existingRowsRes = await this.db
      .prepare('SELECT id, external_id, verified_sources_json FROM announcements')
      .all<Record<string, unknown>>();
    const byId = new Map<string, { id: string; verifiedSources: VerifiedSourceRef[] }>();
    const byExt = new Map<string, { id: string; verifiedSources: VerifiedSourceRef[] }>();
    for (const row of existingRowsRes.results ?? []) {
      const entry = {
        id: String(row.id),
        verifiedSources: safeParseVerifiedSources(row.verified_sources_json),
      };
      byId.set(entry.id, entry);
      if (row.external_id != null) {
        byExt.set(String(row.external_id), entry);
      }
    }

    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();
    const stmts: D1PreparedStatementLike[] = [];

    for (const item of items) {
      const existing = byId.get(item.id) ?? byExt.get(item.externalId);
      const targetId = existing ? existing.id : item.id;
      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }

      const cls = classifyAnnouncement({
        source: item.source,
        institution: item.institution,
        title: item.title,
        description: item.summary,
      });

      const incomingEnrichment: EnrichmentStatus = item.enrichmentStatus ?? 'pending';
      const employmentType = item.employmentType ?? cls.employmentType;
      const noticeType = item.noticeType ?? cls.noticeType;
      const examType = item.examType ?? cls.examType;
      const mergedSources = mergeVerifiedSources(existing?.verifiedSources, item.verifiedSources);
      const verifiedSourcesJson = JSON.stringify(mergedSources);
      const isDemoInt = isDemoAnnouncement(item) ? 1 : 0;

      stmts.push(
        this.db
          .prepare(
            `INSERT INTO announcements (
              id, external_id, source, source_name, source_url, institution,
              title, category, city, status, published_at, deadline_at,
              quota, summary, criteria_json, created_at, updated_at,
              employment_type, notice_type, exam_type, organization_unit,
              apply_url, verified_sources_json, enrichment_status,
              content_hash, last_seen_at, is_demo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              source = excluded.source,
              source_name = excluded.source_name,
              source_url = excluded.source_url,
              institution = excluded.institution,
              title = excluded.title,
              category = excluded.category,
              city = CASE
                WHEN announcements.city != 'TÜRKİYE GENELİ' AND excluded.city = 'TÜRKİYE GENELİ'
                THEN announcements.city
                ELSE excluded.city
              END,
              status = CASE
                WHEN announcements.enrichment_status = 'enriched'
                  AND excluded.enrichment_status != 'enriched'
                  AND (announcements.deadline_at > excluded.deadline_at OR excluded.deadline_at = excluded.published_at)
                THEN CASE
                  WHEN announcements.deadline_at >= substr(excluded.updated_at, 1, 10) THEN 'acik'
                  ELSE 'kapali'
                END
                ELSE excluded.status
              END,
              published_at = excluded.published_at,
              deadline_at = CASE
                WHEN announcements.enrichment_status = 'enriched'
                  AND excluded.enrichment_status != 'enriched'
                  AND (announcements.deadline_at > excluded.deadline_at OR excluded.deadline_at = excluded.published_at)
                THEN announcements.deadline_at
                ELSE excluded.deadline_at
              END,
              quota = CASE
                WHEN announcements.enrichment_status = 'enriched' AND excluded.enrichment_status != 'enriched'
                THEN COALESCE(announcements.quota, excluded.quota)
                ELSE COALESCE(excluded.quota, announcements.quota)
              END,
              summary = CASE
                WHEN announcements.enrichment_status = 'enriched' AND excluded.enrichment_status != 'enriched'
                THEN announcements.summary
                ELSE excluded.summary
              END,
              criteria_json = CASE
                WHEN announcements.enrichment_status = 'enriched' AND excluded.enrichment_status != 'enriched'
                THEN announcements.criteria_json
                ELSE excluded.criteria_json
              END,
              updated_at = excluded.updated_at,
              employment_type = excluded.employment_type,
              notice_type = excluded.notice_type,
              exam_type = CASE
                WHEN announcements.enrichment_status = 'enriched'
                  AND excluded.enrichment_status != 'enriched'
                  AND announcements.exam_type != 'unspecified'
                THEN announcements.exam_type
                ELSE excluded.exam_type
              END,
              organization_unit = CASE
                WHEN announcements.enrichment_status = 'enriched' AND excluded.enrichment_status != 'enriched'
                THEN COALESCE(announcements.organization_unit, excluded.organization_unit)
                ELSE COALESCE(excluded.organization_unit, announcements.organization_unit)
              END,
              apply_url = CASE
                WHEN announcements.enrichment_status = 'enriched' AND excluded.enrichment_status != 'enriched'
                THEN COALESCE(announcements.apply_url, excluded.apply_url)
                ELSE COALESCE(excluded.apply_url, announcements.apply_url)
              END,
              verified_sources_json = excluded.verified_sources_json,
              enrichment_status = CASE
                WHEN announcements.enrichment_status = 'enriched' AND excluded.enrichment_status != 'enriched'
                THEN 'enriched'
                ELSE excluded.enrichment_status
              END,
              content_hash = excluded.content_hash,
              last_seen_at = excluded.last_seen_at,
              is_demo = excluded.is_demo`,
          )
          .bind(
            targetId,
            item.externalId,
            item.source,
            item.sourceName,
            item.sourceUrl,
            item.institution,
            item.title,
            item.category,
            item.city,
            item.status,
            item.publishedAt,
            item.deadlineAt,
            item.quota,
            item.summary,
            JSON.stringify(item.criteria),
            now,
            now,
            employmentType,
            noticeType,
            examType,
            item.organizationUnit ?? null,
            item.applyUrl ?? null,
            verifiedSourcesJson,
            incomingEnrichment,
            item.contentHash ?? null,
            item.lastSeenAt ?? now,
            isDemoInt,
          ),
      );
    }

    await this.runBatched(stmts);

    const countRow = await this.db
      .prepare('SELECT COUNT(*) as total FROM announcements')
      .first<{ total: number }>();

    return {
      inserted,
      updated,
      total: countRow ? Number(countRow.total) : 0,
    };
  }

  async replaceAnnouncementPositions(
    announcementId: string,
    positions: AnnouncementPosition[],
  ): Promise<void> {
    const deleteStmt = this.db
      .prepare('DELETE FROM announcement_positions WHERE announcement_id = ?')
      .bind(announcementId);

    const insertStmts = positions.map((pos) =>
      this.db
        .prepare(
          `INSERT INTO announcement_positions (
            id, announcement_id, title, unvan, city, district, quota,
            education_level, kpss_score_type, min_kpss_score, max_age,
            military_required, qualification_codes_json, evaluation_method,
            is_interview_free, requirements_summary
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          pos.id,
          announcementId,
          pos.title,
          pos.unvan,
          pos.city,
          pos.district,
          pos.quota,
          pos.educationLevel,
          pos.kpssScoreType,
          pos.minKpssScore,
          pos.maxAge,
          pos.militaryRequired ? 1 : 0,
          JSON.stringify(pos.qualificationCodes ?? []),
          pos.evaluationMethod,
          pos.isInterviewFree ? 1 : 0,
          pos.requirementsSummary ?? '',
        ),
    );

    await this.runBatched([deleteStmt, ...insertStmts]);
  }

  async listAnnouncementPositions(announcementId: string): Promise<AnnouncementPosition[]> {
    const res = await this.db
      .prepare('SELECT * FROM announcement_positions WHERE announcement_id = ? ORDER BY id ASC')
      .bind(announcementId)
      .all<Record<string, unknown>>();
    return (res.results ?? []).map(mapPositionRow);
  }

  async listPositionsForAnnouncements(
    announcementIds: string[],
  ): Promise<Record<string, AnnouncementPosition[]>> {
    const uniqueIds = Array.from(new Set(announcementIds.filter(Boolean)));
    const result: Record<string, AnnouncementPosition[]> = {};
    if (uniqueIds.length === 0) return result;

    const CHUNK_SIZE = 50;
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const res = await this.db
        .prepare(
          `SELECT * FROM announcement_positions WHERE announcement_id IN (${placeholders}) ORDER BY id ASC`,
        )
        .bind(...chunk)
        .all<Record<string, unknown>>();

      for (const row of res.results ?? []) {
        const mapped = mapPositionRow(row);
        if (!result[mapped.announcementId]) {
          result[mapped.announcementId] = [];
        }
        result[mapped.announcementId].push(mapped);
      }
    }

    return result;
  }

  async getSourceCheckpoint(source: string): Promise<SourceCheckpoint | null> {
    const row = await this.db
      .prepare('SELECT * FROM source_checkpoints WHERE source = ? LIMIT 1')
      .bind(source)
      .first<Record<string, unknown>>();
    return row ? mapCheckpointRow(row) : null;
  }

  async upsertSourceCheckpoint(cp: SourceCheckpoint): Promise<SourceCheckpoint> {
    await this.db
      .prepare(
        `INSERT INTO source_checkpoints (
          source, etag, last_modified, body_hash,
          last_checked_at, last_changed_at, active_count, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source) DO UPDATE SET
          etag = excluded.etag,
          last_modified = excluded.last_modified,
          body_hash = excluded.body_hash,
          last_checked_at = excluded.last_checked_at,
          last_changed_at = excluded.last_changed_at,
          active_count = excluded.active_count,
          last_error = excluded.last_error`,
      )
      .bind(
        cp.source,
        cp.etag,
        cp.lastModified,
        cp.bodyHash,
        cp.lastCheckedAt,
        cp.lastChangedAt,
        cp.activeCount,
        cp.lastError,
      )
      .run();
    return { ...cp };
  }

  async listSourceCheckpoints(): Promise<SourceCheckpoint[]> {
    const res = await this.db
      .prepare('SELECT * FROM source_checkpoints ORDER BY source ASC')
      .all<Record<string, unknown>>();
    return (res.results ?? []).map(mapCheckpointRow);
  }

  async markExpiredAnnouncements(
    referenceDate = new Date().toISOString().slice(0, 10),
  ): Promise<number> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare(
        `UPDATE announcements SET status = 'kapali', updated_at = ?
         WHERE status = 'acik' AND deadline_at < ?`,
      )
      .bind(now, referenceDate)
      .run();
    return res.meta?.changes ?? 0;
  }

  async pruneNoisyAndDemoProductionRows(): Promise<PruneRowsResult> {
    const res = await this.db
      .prepare('SELECT id, source, source_url, title, summary, is_demo FROM announcements')
      .all<Record<string, unknown>>();
    const rows = res.results ?? [];

    let hasLive = false;
    const legacyIds: string[] = [];
    const noisyIds: string[] = [];

    for (const row of rows) {
      const id = String(row.id);
      const isDemo = row.is_demo != null ? Boolean(Number(row.is_demo)) : isLegacySeedId(id);
      if (isLegacySeedId(id) && !isDemo) {
        legacyIds.push(id);
      }
      if (!isLegacySeedId(id) && !isDemo) {
        const candidate = {
          id,
          source: String(row.source) as Announcement['source'],
          sourceUrl: row.source_url != null ? String(row.source_url) : undefined,
          title: String(row.title),
          summary: String(row.summary ?? ''),
          isDemo,
        };
        if (isNoisyNonRecruitmentRow(candidate)) {
          noisyIds.push(id);
        } else {
          hasLive = true;
        }
      }
    }

    if (!hasLive) {
      return { markedDemo: 0, prunedNoisy: 0 };
    }

    const stmts: D1PreparedStatementLike[] = [];
    for (const id of legacyIds) {
      stmts.push(this.db.prepare('UPDATE announcements SET is_demo = 1 WHERE id = ?').bind(id));
    }
    for (const id of noisyIds) {
      stmts.push(this.db.prepare('DELETE FROM announcements WHERE id = ?').bind(id));
    }

    if (stmts.length > 0) {
      await this.runBatched(stmts);
    }

    return {
      markedDemo: legacyIds.length,
      prunedNoisy: noisyIds.length,
    };
  }

  async listSavedAnnouncementIds(userId: string): Promise<string[]> {
    const res = await this.db
      .prepare(
        'SELECT announcement_id FROM saved_announcements WHERE user_id = ? ORDER BY created_at DESC',
      )
      .bind(userId)
      .all<{ announcement_id: string }>();
    return (res.results ?? []).map((r) => String(r.announcement_id));
  }

  async listSavedAnnouncements(userId: string): Promise<SavedAnnouncementWithItem[]> {
    await this.ensureSeeded();
    const res = await this.db
      .prepare(
        `SELECT s.created_at as saved_at, a.*
         FROM saved_announcements s
         INNER JOIN announcements a ON a.id = s.announcement_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC`,
      )
      .bind(userId)
      .all<Record<string, unknown>>();
    return (res.results ?? []).map((row) => ({
      savedAt: String(row.saved_at),
      announcement: mapAnnouncementRow(row),
    }));
  }

  async saveAnnouncement(
    userId: string,
    announcementId: string,
    now: string,
  ): Promise<SavedAnnouncementRecord> {
    const existing = await this.db
      .prepare(
        'SELECT * FROM saved_announcements WHERE user_id = ? AND announcement_id = ? LIMIT 1',
      )
      .bind(userId, announcementId)
      .first<Record<string, unknown>>();
    if (existing) {
      return {
        id: String(existing.id),
        userId: String(existing.user_id),
        announcementId: String(existing.announcement_id),
        createdAt: String(existing.created_at),
      };
    }
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        'INSERT INTO saved_announcements (id, user_id, announcement_id, created_at) VALUES (?, ?, ?, ?)',
      )
      .bind(id, userId, announcementId, now)
      .run();
    return { id, userId, announcementId, createdAt: now };
  }

  async removeSavedAnnouncement(userId: string, announcementId: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM saved_announcements WHERE user_id = ? AND announcement_id = ?')
      .bind(userId, announcementId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async countSavedAnnouncements(userId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) as total FROM saved_announcements WHERE user_id = ?')
      .bind(userId)
      .first<{ total: number }>();
    return row ? Number(row.total) : 0;
  }

  async createSavedSearch(record: SavedSearchRecord): Promise<SavedSearchRecord> {
    await this.db
      .prepare(
        `INSERT INTO saved_searches (
          id, user_id, name, filters_json, notify_push, notify_email, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.userId,
        record.name,
        JSON.stringify(record.filters ?? {}),
        record.notifyPush ? 1 : 0,
        record.notifyEmail ? 1 : 0,
        record.createdAt,
      )
      .run();
    return {
      ...record,
      filters: { ...record.filters },
    };
  }

  async listSavedSearches(userId: string): Promise<SavedSearchRecord[]> {
    const res = await this.db
      .prepare('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<Record<string, unknown>>();
    return (res.results ?? []).map(mapSavedSearchRow);
  }

  async deleteSavedSearch(userId: string, id: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM saved_searches WHERE user_id = ? AND id = ?')
      .bind(userId, id)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async getNotificationPrefs(userId: string): Promise<NotificationPreferences | null> {
    const row = await this.db
      .prepare('SELECT * FROM notification_prefs WHERE user_id = ? LIMIT 1')
      .bind(userId)
      .first<Record<string, unknown>>();
    return row ? mapPrefsRow(row) : null;
  }

  async upsertNotificationPrefs(
    prefs: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    await this.db
      .prepare(
        `INSERT INTO notification_prefs (
          user_id, email_enabled, instant_new_announcements,
          deadline_reminders_enabled, reminder_days_before, only_matching_profile, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          email_enabled = excluded.email_enabled,
          instant_new_announcements = excluded.instant_new_announcements,
          deadline_reminders_enabled = excluded.deadline_reminders_enabled,
          reminder_days_before = excluded.reminder_days_before,
          only_matching_profile = excluded.only_matching_profile,
          updated_at = excluded.updated_at`,
      )
      .bind(
        prefs.userId,
        prefs.emailEnabled ? 1 : 0,
        prefs.instantNewAnnouncements ? 1 : 0,
        prefs.deadlineRemindersEnabled ? 1 : 0,
        prefs.reminderDaysBefore,
        prefs.onlyMatchingProfile ? 1 : 0,
        prefs.updatedAt,
      )
      .run();
    return { ...prefs };
  }

  async listUsersWithNotificationPrefs(): Promise<
    Array<{ user: StoredUser; prefs: NotificationPreferences }>
  > {
    const res = await this.db
      .prepare(
        `SELECT u.*, np.email_enabled, np.instant_new_announcements,
                np.deadline_reminders_enabled, np.reminder_days_before,
                np.only_matching_profile, np.updated_at as prefs_updated_at
         FROM notification_prefs np
         INNER JOIN users u ON u.id = np.user_id`,
      )
      .all<Record<string, unknown>>();
    return (res.results ?? []).map((row) => ({
      user: mapUserRow(row),
      prefs: mapPrefsRow({ ...row, user_id: row.id, updated_at: row.prefs_updated_at }),
    }));
  }

  async hasReminderLog(
    userId: string,
    announcementId: string,
    reminderType: string,
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        'SELECT id FROM reminder_logs WHERE user_id = ? AND announcement_id = ? AND reminder_type = ? LIMIT 1',
      )
      .bind(userId, announcementId, reminderType)
      .first<{ id: string }>();
    return Boolean(row);
  }

  async recordReminderLog(log: ReminderLog): Promise<ReminderLog> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO reminder_logs (id, user_id, announcement_id, reminder_type, sent_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(log.id, log.userId, log.announcementId, log.reminderType, log.sentAt)
      .run();
    return { ...log };
  }

  async getSubscription(userId: string): Promise<Subscription | null> {
    const row = await this.db
      .prepare('SELECT * FROM subscriptions WHERE user_id = ? LIMIT 1')
      .bind(userId)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      plan: String(row.plan) as PlanTier,
      status: String(row.status) as SubscriptionStatus,
      provider: String(row.provider),
      externalSubscriptionId:
        row.external_subscription_id != null ? String(row.external_subscription_id) : null,
      currentPeriodEnd: row.current_period_end != null ? String(row.current_period_end) : null,
      updatedAt: String(row.updated_at),
    };
  }

  async upsertSubscription(subscription: Subscription): Promise<Subscription> {
    const externalId = subscription.externalSubscriptionId ?? null;
    await this.db
      .prepare(
        `INSERT INTO subscriptions (id, user_id, plan, status, provider, external_subscription_id, current_period_end, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           plan = excluded.plan,
           status = excluded.status,
           provider = excluded.provider,
           external_subscription_id = excluded.external_subscription_id,
           current_period_end = excluded.current_period_end,
           updated_at = excluded.updated_at`,
      )
      .bind(
        subscription.id,
        subscription.userId,
        subscription.plan,
        subscription.status,
        subscription.provider,
        externalId,
        subscription.currentPeriodEnd,
        subscription.updatedAt,
      )
      .run();
    return { ...subscription, externalSubscriptionId: externalId };
  }

  async recordSyncRun(run: SyncRun): Promise<SyncRun> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO sync_runs (
          id, triggered_by, started_at, finished_at, status,
          synced_count, reminders_sent, new_alerts_sent, errors_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        run.triggeredBy,
        run.startedAt,
        run.finishedAt,
        run.status,
        run.syncedCount,
        run.remindersSent,
        run.newAlertsSent,
        run.errorsJson,
      )
      .run();
    return { ...run };
  }

  async listSyncRuns(limit = 10): Promise<SyncRun[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const res = await this.db
      .prepare('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ?')
      .bind(safeLimit)
      .all<Record<string, unknown>>();
    return (res.results ?? []).map((row) => ({
      id: String(row.id),
      triggeredBy: String(row.triggered_by),
      startedAt: String(row.started_at),
      finishedAt: String(row.finished_at),
      status: String(row.status),
      syncedCount: Number(row.synced_count ?? 0),
      remindersSent: Number(row.reminders_sent ?? 0),
      newAlertsSent: Number(row.new_alerts_sent ?? 0),
      errorsJson: String(row.errors_json ?? '[]'),
    }));
  }

  async upsertPushSubscription(sub: PushSubscriptionRecord): Promise<PushSubscriptionRecord> {
    await this.db
      .prepare(
        `INSERT INTO push_subscriptions (
          id, user_id, endpoint, p256dh, auth, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          user_id = excluded.user_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          user_agent = excluded.user_agent,
          created_at = excluded.created_at`,
      )
      .bind(sub.id, sub.userId, sub.endpoint, sub.p256dh, sub.auth, sub.userAgent, sub.createdAt)
      .run();

    const row = await this.db
      .prepare('SELECT * FROM push_subscriptions WHERE endpoint = ? LIMIT 1')
      .bind(sub.endpoint)
      .first<Record<string, unknown>>();
    return row ? mapPushSubscriptionRow(row) : { ...sub };
  }

  async listPushSubscriptionsByUser(userId: string): Promise<PushSubscriptionRecord[]> {
    const res = await this.db
      .prepare('SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<Record<string, unknown>>();
    return (res.results ?? []).map(mapPushSubscriptionRow);
  }

  async deletePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
      .bind(userId, endpoint)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const res = await this.db
      .prepare('SELECT * FROM push_subscriptions ORDER BY created_at DESC')
      .all<Record<string, unknown>>();
    return (res.results ?? []).map(mapPushSubscriptionRow);
  }
}
