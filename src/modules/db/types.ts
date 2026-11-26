import type {
  Announcement,
  AnnouncementFilter,
  MilitaryStatus,
} from '@/modules/announcements/types';

export type PlanTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'canceled' | 'trialing';
export type EducationLevel = 'lisans' | 'onlisans' | 'ortaogretim';
export type KpssScoreType = 'P3' | 'P93' | 'P94';

export type AuthTokenPurpose = 'email_verify' | 'password_reset';

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  acceptedTermsAt: string;
  acceptedPrivacyAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthToken {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface SyncRun {
  id: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  syncedCount: number;
  remindersSent: number;
  newAlertsSent: number;
  errorsJson: string;
}

export interface StoredUser extends User {
  passwordHash: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface UserProfile {
  userId: string;
  educationLevel: EducationLevel | null;
  departmentId: string | null;
  kpssScoreType: KpssScoreType | null;
  kpssScore: number | null;
  residenceCity: string | null;
  militaryStatus: MilitaryStatus | null;
  driverLicenses: string[];
  certificates: string[];
  qualificationCodes: string[];
  updatedAt: string;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  instantNewAnnouncements: boolean;
  deadlineRemindersEnabled: boolean;
  reminderDaysBefore: number;
  onlyMatchingProfile: boolean;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  provider: string;
  externalSubscriptionId?: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export interface Entitlements {
  plan: PlanTier;
  maxVisibleAnnouncements: number | null;
  maxSaved: number | null;
  canUseProfileMatch: boolean;
  canInstantAlert: boolean;
}

export interface MatchEvaluation {
  announcementId: string;
  eligible: boolean;
  matchScore: number;
  matchedReasons: string[];
  missingReasons: string[];
  unknownReasons: string[];
}

export interface SavedAnnouncementRecord {
  id: string;
  userId: string;
  announcementId: string;
  createdAt: string;
}

export interface SavedAnnouncementWithItem {
  savedAt: string;
  announcement: Announcement;
}

export interface ReminderLog {
  id: string;
  userId: string;
  announcementId: string;
  reminderType: string;
  sentAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
}

export interface CreateUserInput {
  id: string;
  email: string;
  passwordHash: string;
  fullName?: string | null;
  phone?: string | null;
  acceptedTermsAt: string;
  acceptedPrivacyAt: string;
  now: string;
}

export interface UpsertAnnouncementsResult {
  inserted: number;
  updated: number;
  total: number;
}

export interface DatabaseAdapter {
  createUser(input: CreateUserInput): Promise<StoredUser>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<StoredUser | null>;
  updateUserAccount(
    userId: string,
    patch: { fullName?: string | null; phone?: string | null; now: string },
  ): Promise<StoredUser | null>;
  markEmailVerified(userId: string, verifiedAt: string): Promise<StoredUser | null>;
  updateUserPassword(userId: string, passwordHash: string, now: string): Promise<StoredUser | null>;
  deleteUser(userId: string): Promise<boolean>;

  createSession(session: Session): Promise<Session>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  deleteSessionsByUserId(userId: string): Promise<void>;

  createAuthToken(token: AuthToken): Promise<AuthToken>;
  findAuthTokenByHash(tokenHash: string, purpose: AuthTokenPurpose): Promise<AuthToken | null>;
  markAuthTokenUsed(id: string, usedAt: string): Promise<void>;

  getProfile(userId: string): Promise<UserProfile | null>;
  upsertProfile(profile: UserProfile): Promise<UserProfile>;

  listAnnouncements(filter?: AnnouncementFilter): Promise<Announcement[]>;
  getAnnouncementById(id: string): Promise<Announcement | null>;
  upsertAnnouncements(items: Announcement[]): Promise<UpsertAnnouncementsResult>;

  listSavedAnnouncementIds(userId: string): Promise<string[]>;
  listSavedAnnouncements(userId: string): Promise<SavedAnnouncementWithItem[]>;
  saveAnnouncement(
    userId: string,
    announcementId: string,
    now: string,
  ): Promise<SavedAnnouncementRecord>;
  removeSavedAnnouncement(userId: string, announcementId: string): Promise<boolean>;
  countSavedAnnouncements(userId: string): Promise<number>;

  getNotificationPrefs(userId: string): Promise<NotificationPreferences | null>;
  upsertNotificationPrefs(prefs: NotificationPreferences): Promise<NotificationPreferences>;
  listUsersWithNotificationPrefs(): Promise<
    Array<{ user: StoredUser; prefs: NotificationPreferences }>
  >;
  hasReminderLog(
    userId: string,
    announcementId: string,
    reminderType: string,
  ): Promise<boolean>;
  recordReminderLog(log: ReminderLog): Promise<ReminderLog>;

  getSubscription(userId: string): Promise<Subscription | null>;
  upsertSubscription(subscription: Subscription): Promise<Subscription>;

  recordSyncRun(run: SyncRun): Promise<SyncRun>;
  listSyncRuns(limit?: number): Promise<SyncRun[]>;

  upsertPushSubscription(sub: PushSubscriptionRecord): Promise<PushSubscriptionRecord>;
  listPushSubscriptionsByUser(userId: string): Promise<PushSubscriptionRecord[]>;
  deletePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<boolean>;
  listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]>;
}
