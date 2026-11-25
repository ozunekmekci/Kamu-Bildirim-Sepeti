import { INITIAL_ANNOUNCEMENTS, filterAnnouncements } from '@/modules/announcements';
import type {
  Announcement,
  AnnouncementCriteria,
  AnnouncementFilter,
  MilitaryStatus,
} from '@/modules/announcements/types';
import type {
  CreateUserInput,
  DatabaseAdapter,
  EducationLevel,
  KpssScoreType,
  NotificationPreferences,
  PlanTier,
  ReminderLog,
  SavedAnnouncementRecord,
  SavedAnnouncementWithItem,
  Session,
  StoredUser,
  Subscription,
  SubscriptionStatus,
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

function safeParseArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
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
    return {
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
    acceptedTermsAt: String(row.accepted_terms_at),
    acceptedPrivacyAt: String(row.accepted_privacy_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAnnouncementRow(row: Record<string, unknown>): Announcement {
  return {
    id: String(row.id),
    externalId: String(row.external_id),
    source: String(row.source) as Announcement['source'],
    sourceName: String(row.source_name),
    sourceUrl: String(row.source_url),
    institution: String(row.institution),
    title: String(row.title),
    category: String(row.category) as Announcement['category'],
    city: String(row.city),
    status: String(row.status) as Announcement['status'],
    publishedAt: String(row.published_at),
    deadlineAt: String(row.deadline_at),
    quota: typeof row.quota === 'number' ? row.quota : row.quota != null ? Number(row.quota) : null,
    summary: String(row.summary),
    criteria: safeParseCriteria(row.criteria_json),
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

export class D1Adapter implements DatabaseAdapter {
  private seededPromise: Promise<void> | null = null;

  constructor(private readonly db: D1DatabaseLike) {}

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
        const stmts = INITIAL_ANNOUNCEMENTS.map((item) =>
          this.db
            .prepare(
              `INSERT OR IGNORE INTO announcements (
                id, external_id, source, source_name, source_url, institution,
                title, category, city, status, published_at, deadline_at,
                quota, summary, criteria_json, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            ),
        );
        if (stmts.length > 0) {
          await this.db.batch(stmts);
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

  async deleteUser(userId: string): Promise<boolean> {
    const existing = await this.findUserById(userId);
    if (!existing) return false;

    await this.db.batch([
      this.db.prepare('DELETE FROM saved_announcements WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM reminder_logs WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM notification_prefs WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM user_profiles WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(userId),
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
      kpssScore: typeof row.kpss_score === 'number' ? row.kpss_score : row.kpss_score != null ? Number(row.kpss_score) : null,
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

  async listAnnouncements(filter?: AnnouncementFilter): Promise<Announcement[]> {
    await this.ensureSeeded();
    const res = await this.db
      .prepare('SELECT * FROM announcements ORDER BY published_at DESC')
      .all<Record<string, unknown>>();
    const all = (res.results ?? []).map(mapAnnouncementRow);
    return filterAnnouncements(all, filter);
  }

  async getAnnouncementById(id: string): Promise<Announcement | null> {
    await this.ensureSeeded();
    const row = await this.db
      .prepare('SELECT * FROM announcements WHERE id = ? LIMIT 1')
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? mapAnnouncementRow(row) : null;
  }

  async upsertAnnouncements(items: Announcement[]): Promise<UpsertAnnouncementsResult> {
    await this.ensureSeeded();
    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const item of items) {
      const existing = await this.db
        .prepare('SELECT id FROM announcements WHERE id = ? OR external_id = ? LIMIT 1')
        .bind(item.id, item.externalId)
        .first<{ id: string }>();

      const targetId = existing ? existing.id : item.id;
      if (existing) {
        await this.db
          .prepare(
            `UPDATE announcements SET
              source = ?, source_name = ?, source_url = ?, institution = ?,
              title = ?, category = ?, city = ?, status = ?,
              published_at = ?, deadline_at = ?, quota = ?, summary = ?,
              criteria_json = ?, updated_at = ?
            WHERE id = ?`,
          )
          .bind(
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
            targetId,
          )
          .run();
        updated += 1;
      } else {
        await this.db
          .prepare(
            `INSERT INTO announcements (
              id, external_id, source, source_name, source_url, institution,
              title, category, city, status, published_at, deadline_at,
              quota, summary, criteria_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          )
          .run();
        inserted += 1;
      }
    }

    const countRow = await this.db
      .prepare('SELECT COUNT(*) as total FROM announcements')
      .first<{ total: number }>();

    return {
      inserted,
      updated,
      total: countRow ? Number(countRow.total) : 0,
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
      currentPeriodEnd: row.current_period_end != null ? String(row.current_period_end) : null,
      updatedAt: String(row.updated_at),
    };
  }

  async upsertSubscription(subscription: Subscription): Promise<Subscription> {
    await this.db
      .prepare(
        `INSERT INTO subscriptions (id, user_id, plan, status, provider, current_period_end, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           plan = excluded.plan,
           status = excluded.status,
           provider = excluded.provider,
           current_period_end = excluded.current_period_end,
           updated_at = excluded.updated_at`,
      )
      .bind(
        subscription.id,
        subscription.userId,
        subscription.plan,
        subscription.status,
        subscription.provider,
        subscription.currentPeriodEnd,
        subscription.updatedAt,
      )
      .run();
    return { ...subscription };
  }
}
