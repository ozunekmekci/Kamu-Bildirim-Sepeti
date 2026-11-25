import { INITIAL_ANNOUNCEMENTS, filterAnnouncements } from '@/modules/announcements';
import type { Announcement, AnnouncementFilter } from '@/modules/announcements/types';
import type {
  AuthToken,
  AuthTokenPurpose,
  CreateUserInput,
  DatabaseAdapter,
  NotificationPreferences,
  ReminderLog,
  SavedAnnouncementRecord,
  SavedAnnouncementWithItem,
  Session,
  StoredUser,
  Subscription,
  SyncRun,
  UpsertAnnouncementsResult,
  UserProfile,
} from './types';

function cloneAnnouncement(item: Announcement): Announcement {
  return {
    ...item,
    criteria: {
      ...item.criteria,
      educationLevels: [...item.criteria.educationLevels],
      kpssScoreTypes: [...item.criteria.kpssScoreTypes],
      cities: [...item.criteria.cities],
      driverLicenses: [...item.criteria.driverLicenses],
      certificates: [...item.criteria.certificates],
      qualificationCodes: [...item.criteria.qualificationCodes],
      summaryLines: [...item.criteria.summaryLines],
    },
  };
}

export class MemoryDbAdapter implements DatabaseAdapter {
  private users = new Map<string, StoredUser>();
  private userIdByEmail = new Map<string, string>();
  private sessions = new Map<string, Session>();
  private authTokens = new Map<string, AuthToken>();
  private profiles = new Map<string, UserProfile>();
  private announcements = new Map<string, Announcement>();
  private saved = new Map<string, SavedAnnouncementRecord>();
  private notificationPrefs = new Map<string, NotificationPreferences>();
  private reminderLogs = new Map<string, ReminderLog>();
  private subscriptions = new Map<string, Subscription>();
  private syncRuns = new Map<string, SyncRun>();

  constructor(seedAnnouncements: Announcement[] = INITIAL_ANNOUNCEMENTS) {
    for (const item of seedAnnouncements) {
      this.announcements.set(item.id, cloneAnnouncement(item));
    }
  }

  reset(seedAnnouncements: Announcement[] = INITIAL_ANNOUNCEMENTS): void {
    this.users.clear();
    this.userIdByEmail.clear();
    this.sessions.clear();
    this.authTokens.clear();
    this.profiles.clear();
    this.announcements.clear();
    this.saved.clear();
    this.notificationPrefs.clear();
    this.reminderLogs.clear();
    this.subscriptions.clear();
    this.syncRuns.clear();
    for (const item of seedAnnouncements) {
      this.announcements.set(item.id, cloneAnnouncement(item));
    }
  }

  async createUser(input: CreateUserInput): Promise<StoredUser> {
    const normalizedEmail = input.email.trim().toLowerCase();
    if (this.userIdByEmail.has(normalizedEmail)) {
      throw new Error('UNIQUE constraint failed: users.email');
    }
    const user: StoredUser = {
      id: input.id,
      email: normalizedEmail,
      passwordHash: input.passwordHash,
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
      emailVerifiedAt: null,
      acceptedTermsAt: input.acceptedTermsAt,
      acceptedPrivacyAt: input.acceptedPrivacyAt,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.users.set(user.id, { ...user });
    this.userIdByEmail.set(normalizedEmail, user.id);
    return { ...user };
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const id = this.userIdByEmail.get(email.trim().toLowerCase());
    if (!id) return null;
    const found = this.users.get(id);
    return found ? { ...found } : null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    const found = this.users.get(id);
    return found ? { ...found } : null;
  }

  async updateUserAccount(
    userId: string,
    patch: { fullName?: string | null; phone?: string | null; now: string },
  ): Promise<StoredUser | null> {
    const existing = this.users.get(userId);
    if (!existing) return null;
    const updated: StoredUser = {
      ...existing,
      fullName: patch.fullName !== undefined ? patch.fullName : existing.fullName,
      phone: patch.phone !== undefined ? patch.phone : existing.phone,
      updatedAt: patch.now,
    };
    this.users.set(userId, updated);
    return { ...updated };
  }

  async markEmailVerified(userId: string, verifiedAt: string): Promise<StoredUser | null> {
    const existing = this.users.get(userId);
    if (!existing) return null;
    const updated: StoredUser = {
      ...existing,
      emailVerifiedAt: verifiedAt,
      updatedAt: verifiedAt,
    };
    this.users.set(userId, updated);
    return { ...updated };
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
    now: string,
  ): Promise<StoredUser | null> {
    const existing = this.users.get(userId);
    if (!existing) return null;
    const updated: StoredUser = {
      ...existing,
      passwordHash,
      updatedAt: now,
    };
    this.users.set(userId, updated);
    return { ...updated };
  }

  async deleteUser(userId: string): Promise<boolean> {
    const existing = this.users.get(userId);
    if (!existing) return false;

    this.users.delete(userId);
    this.userIdByEmail.delete(existing.email);

    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(tokenHash);
      }
    }

    for (const [tokenId, token] of this.authTokens.entries()) {
      if (token.userId === userId) {
        this.authTokens.delete(tokenId);
      }
    }

    this.profiles.delete(userId);

    for (const [key, record] of this.saved.entries()) {
      if (record.userId === userId) {
        this.saved.delete(key);
      }
    }

    this.notificationPrefs.delete(userId);

    for (const [key, log] of this.reminderLogs.entries()) {
      if (log.userId === userId) {
        this.reminderLogs.delete(key);
      }
    }

    this.subscriptions.delete(userId);
    return true;
  }

  async createSession(session: Session): Promise<Session> {
    const copy = { ...session };
    this.sessions.set(copy.tokenHash, copy);
    return { ...copy };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const found = this.sessions.get(tokenHash);
    return found ? { ...found } : null;
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(tokenHash);
      }
    }
  }

  async createAuthToken(token: AuthToken): Promise<AuthToken> {
    const copy = { ...token };
    this.authTokens.set(copy.id, copy);
    return { ...copy };
  }

  async findAuthTokenByHash(
    tokenHash: string,
    purpose: AuthTokenPurpose,
  ): Promise<AuthToken | null> {
    for (const token of this.authTokens.values()) {
      if (token.tokenHash === tokenHash && token.purpose === purpose) {
        return { ...token };
      }
    }
    return null;
  }

  async markAuthTokenUsed(id: string, usedAt: string): Promise<void> {
    const existing = this.authTokens.get(id);
    if (!existing) return;
    this.authTokens.set(id, { ...existing, usedAt });
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const found = this.profiles.get(userId);
    if (!found) return null;
    return {
      ...found,
      driverLicenses: [...found.driverLicenses],
      certificates: [...found.certificates],
      qualificationCodes: [...found.qualificationCodes],
    };
  }

  async upsertProfile(profile: UserProfile): Promise<UserProfile> {
    const copy: UserProfile = {
      ...profile,
      driverLicenses: [...profile.driverLicenses],
      certificates: [...profile.certificates],
      qualificationCodes: [...profile.qualificationCodes],
    };
    this.profiles.set(copy.userId, copy);
    return {
      ...copy,
      driverLicenses: [...copy.driverLicenses],
      certificates: [...copy.certificates],
      qualificationCodes: [...copy.qualificationCodes],
    };
  }

  async listAnnouncements(filter?: AnnouncementFilter): Promise<Announcement[]> {
    const all = Array.from(this.announcements.values()).map(cloneAnnouncement);
    return filterAnnouncements(all, filter);
  }

  async getAnnouncementById(id: string): Promise<Announcement | null> {
    const found = this.announcements.get(id);
    return found ? cloneAnnouncement(found) : null;
  }

  async upsertAnnouncements(items: Announcement[]): Promise<UpsertAnnouncementsResult> {
    let inserted = 0;
    let updated = 0;
    for (const item of items) {
      const existingById = this.announcements.get(item.id);
      const existingByExt = existingById
        ? existingById
        : Array.from(this.announcements.values()).find(
            (a) => a.externalId === item.externalId,
          );
      if (existingByExt) {
        this.announcements.set(existingByExt.id, {
          ...cloneAnnouncement(item),
          id: existingByExt.id,
        });
        updated += 1;
      } else {
        this.announcements.set(item.id, cloneAnnouncement(item));
        inserted += 1;
      }
    }
    return { inserted, updated, total: this.announcements.size };
  }

  async listSavedAnnouncementIds(userId: string): Promise<string[]> {
    return Array.from(this.saved.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => r.announcementId);
  }

  async listSavedAnnouncements(userId: string): Promise<SavedAnnouncementWithItem[]> {
    const records = Array.from(this.saved.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const results: SavedAnnouncementWithItem[] = [];
    for (const record of records) {
      const announcement = this.announcements.get(record.announcementId);
      if (announcement) {
        results.push({
          savedAt: record.createdAt,
          announcement: cloneAnnouncement(announcement),
        });
      }
    }
    return results;
  }

  async saveAnnouncement(
    userId: string,
    announcementId: string,
    now: string,
  ): Promise<SavedAnnouncementRecord> {
    const key = `${userId}:${announcementId}`;
    const existing = this.saved.get(key);
    if (existing) {
      return { ...existing };
    }
    const record: SavedAnnouncementRecord = {
      id: crypto.randomUUID(),
      userId,
      announcementId,
      createdAt: now,
    };
    this.saved.set(key, record);
    return { ...record };
  }

  async removeSavedAnnouncement(userId: string, announcementId: string): Promise<boolean> {
    const key = `${userId}:${announcementId}`;
    return this.saved.delete(key);
  }

  async countSavedAnnouncements(userId: string): Promise<number> {
    let count = 0;
    for (const record of this.saved.values()) {
      if (record.userId === userId) count += 1;
    }
    return count;
  }

  async getNotificationPrefs(userId: string): Promise<NotificationPreferences | null> {
    const found = this.notificationPrefs.get(userId);
    return found ? { ...found } : null;
  }

  async upsertNotificationPrefs(
    prefs: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    const copy = { ...prefs };
    this.notificationPrefs.set(copy.userId, copy);
    return { ...copy };
  }

  async listUsersWithNotificationPrefs(): Promise<
    Array<{ user: StoredUser; prefs: NotificationPreferences }>
  > {
    const rows: Array<{ user: StoredUser; prefs: NotificationPreferences }> = [];
    for (const prefs of this.notificationPrefs.values()) {
      const user = this.users.get(prefs.userId);
      if (user) {
        rows.push({ user: { ...user }, prefs: { ...prefs } });
      }
    }
    return rows;
  }

  async hasReminderLog(
    userId: string,
    announcementId: string,
    reminderType: string,
  ): Promise<boolean> {
    return this.reminderLogs.has(`${userId}:${announcementId}:${reminderType}`);
  }

  async recordReminderLog(log: ReminderLog): Promise<ReminderLog> {
    const key = `${log.userId}:${log.announcementId}:${log.reminderType}`;
    const copy = { ...log };
    this.reminderLogs.set(key, copy);
    return { ...copy };
  }

  async getSubscription(userId: string): Promise<Subscription | null> {
    const found = this.subscriptions.get(userId);
    return found ? { ...found } : null;
  }

  async upsertSubscription(subscription: Subscription): Promise<Subscription> {
    const copy: Subscription = {
      ...subscription,
      externalSubscriptionId: subscription.externalSubscriptionId ?? null,
    };
    this.subscriptions.set(copy.userId, copy);
    return { ...copy };
  }

  async recordSyncRun(run: SyncRun): Promise<SyncRun> {
    const copy = { ...run };
    this.syncRuns.set(copy.id, copy);
    return { ...copy };
  }

  async listSyncRuns(limit = 10): Promise<SyncRun[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    return Array.from(this.syncRuns.values())
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, safeLimit)
      .map((run) => ({ ...run }));
  }
}
