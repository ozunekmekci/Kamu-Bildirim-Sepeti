import type { Announcement } from '@/modules/announcements/types';
import { getDeadlineDaysLeft } from '@/modules/announcements';
import { matchesSavedSearchFilters } from '@/modules/announcements/service';
import {
  canSaveAnotherAnnouncement,
  getUserBillingState,
} from '@/modules/billing';
import type {
  DatabaseAdapter,
  NotificationPreferences,
  SavedAnnouncementRecord,
  SavedAnnouncementWithItem,
} from '@/modules/db/types';
import { generateId } from '@/modules/identity/crypto';
import { evaluateAnnouncementMatch } from '@/modules/matching';
import {
  type EmailAdapter,
  NoopEmailAdapter,
} from './email-adapters';

export {
  type EmailAdapter,
  type EmailMessage,
  type EmailSendResult,
  InMemoryEmailAdapter,
  MailChannelsEmailAdapter,
  type MailChannelsEmailAdapterOptions,
  NoopEmailAdapter,
  ResendEmailAdapter,
  type ResendEmailAdapterOptions,
  createEmailAdapter,
} from './email-adapters';

export class TrackingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TrackingError';
  }
}

export async function listSavedForUser(
  db: DatabaseAdapter,
  userId: string,
): Promise<SavedAnnouncementWithItem[]> {
  return db.listSavedAnnouncements(userId);
}

export async function saveAnnouncementForUser(
  db: DatabaseAdapter,
  userId: string,
  announcementId: string,
): Promise<SavedAnnouncementRecord> {
  if (!announcementId || typeof announcementId !== 'string') {
    throw new TrackingError('INVALID_ANNOUNCEMENT', 400, 'Geçerli bir ilan kimliği gereklidir.');
  }

  const announcement = await db.getAnnouncementById(announcementId);
  if (!announcement) {
    throw new TrackingError('ANNOUNCEMENT_NOT_FOUND', 404, 'İlan bulunamadı.');
  }

  const existingIds = await db.listSavedAnnouncementIds(userId);
  const now = new Date().toISOString();
  if (existingIds.includes(announcementId)) {
    return db.saveAnnouncement(userId, announcementId, now);
  }

  const { entitlements } = await getUserBillingState(db, userId);
  if (!canSaveAnotherAnnouncement(entitlements, existingIds.length)) {
    throw new TrackingError(
      'SAVED_LIMIT_REACHED',
      403,
      `Ücretsiz planda en fazla ${entitlements.maxSaved ?? 10} ilan kaydedebilirsiniz.`,
      { limit: entitlements.maxSaved ?? 10 },
    );
  }

  return db.saveAnnouncement(userId, announcementId, now);
}

export async function removeSavedForUser(
  db: DatabaseAdapter,
  userId: string,
  announcementId: string,
): Promise<boolean> {
  if (!announcementId) {
    throw new TrackingError('INVALID_ANNOUNCEMENT', 400, 'Geçerli bir ilan kimliği gereklidir.');
  }
  return db.removeSavedAnnouncement(userId, announcementId);
}

export function createDefaultNotificationPreferences(userId: string): NotificationPreferences {
  return {
    userId,
    emailEnabled: true,
    instantNewAnnouncements: false,
    deadlineRemindersEnabled: true,
    reminderDaysBefore: 3,
    onlyMatchingProfile: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function getNotificationPreferences(
  db: DatabaseAdapter,
  userId: string,
): Promise<NotificationPreferences> {
  const existing = await db.getNotificationPrefs(userId);
  return existing ?? createDefaultNotificationPreferences(userId);
}

export interface UpdateNotificationPrefsInput {
  emailEnabled?: boolean;
  instantNewAnnouncements?: boolean;
  deadlineRemindersEnabled?: boolean;
  reminderDaysBefore?: number;
  onlyMatchingProfile?: boolean;
}

export async function updateNotificationPreferences(
  db: DatabaseAdapter,
  userId: string,
  input: UpdateNotificationPrefsInput,
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences(db, userId);

  let reminderDays = current.reminderDaysBefore;
  if (input.reminderDaysBefore !== undefined) {
    if (
      typeof input.reminderDaysBefore !== 'number' ||
      !Number.isInteger(input.reminderDaysBefore) ||
      input.reminderDaysBefore < 1 ||
      input.reminderDaysBefore > 30
    ) {
      throw new TrackingError(
        'INVALID_REMINDER_DAYS',
        400,
        'Hatırlatma günü 1 ile 30 arasında tam sayı olmalıdır.',
      );
    }
    reminderDays = input.reminderDaysBefore;
  }

  const next: NotificationPreferences = {
    userId,
    emailEnabled:
      typeof input.emailEnabled === 'boolean' ? input.emailEnabled : current.emailEnabled,
    instantNewAnnouncements:
      typeof input.instantNewAnnouncements === 'boolean'
        ? input.instantNewAnnouncements
        : current.instantNewAnnouncements,
    deadlineRemindersEnabled:
      typeof input.deadlineRemindersEnabled === 'boolean'
        ? input.deadlineRemindersEnabled
        : current.deadlineRemindersEnabled,
    reminderDaysBefore: reminderDays,
    onlyMatchingProfile:
      typeof input.onlyMatchingProfile === 'boolean'
        ? input.onlyMatchingProfile
        : current.onlyMatchingProfile,
    updatedAt: new Date().toISOString(),
  };

  return db.upsertNotificationPrefs(next);
}

export async function dispatchPendingReminders(
  db: DatabaseAdapter,
  emailAdapter: EmailAdapter = new NoopEmailAdapter(),
  referenceDate = new Date(),
): Promise<{ processedUsers: number; sentCount: number }> {
  const usersWithPrefs = await db.listUsersWithNotificationPrefs();
  let processedUsers = 0;
  let sentCount = 0;

  for (const { user, prefs } of usersWithPrefs) {
    processedUsers += 1;
    if (!prefs.emailEnabled || !prefs.deadlineRemindersEnabled) {
      continue;
    }

    const { entitlements } = await getUserBillingState(db, user.id);
    if (!entitlements.canInstantAlert) {
      continue;
    }

    const savedItems = await db.listSavedAnnouncements(user.id);
    const profile = prefs.onlyMatchingProfile ? await db.getProfile(user.id) : null;

    for (const { announcement } of savedItems) {
      if (announcement.status !== 'acik') continue;
      const daysLeft = getDeadlineDaysLeft(announcement.deadlineAt, referenceDate);
      if (daysLeft === null || daysLeft < 0 || daysLeft > prefs.reminderDaysBefore) {
        continue;
      }

      if (prefs.onlyMatchingProfile && profile) {
        const match = evaluateAnnouncementMatch(profile, announcement);
        if (!match.eligible) continue;
      }

      const reminderType = `deadline_${prefs.reminderDaysBefore}d`;
      const alreadySent = await db.hasReminderLog(user.id, announcement.id, reminderType);
      if (alreadySent) continue;

      const result = await emailAdapter.sendEmail({
        to: user.email,
        subject: `Kamu Bildirim Sepeti: ${announcement.title} son başvuru hatırlatması`,
        text: `${announcement.institution} tarafından yayımlanan "${announcement.title}" ilanı için son başvuru tarihine ${daysLeft} gün kaldı. Resmî kaynak: ${announcement.sourceUrl}`,
      });

      if (result.delivered || emailAdapter.providerName === 'noop') {
        await db.recordReminderLog({
          id: generateId(),
          userId: user.id,
          announcementId: announcement.id,
          reminderType,
          sentAt: referenceDate.toISOString(),
        });
        sentCount += 1;
      }
    }
  }

  return { processedUsers, sentCount };
}

export async function dispatchNewAnnouncementAlerts(
  db: DatabaseAdapter,
  newAnnouncements: Announcement[],
  emailAdapter: EmailAdapter = new NoopEmailAdapter(),
  referenceDate = new Date(),
): Promise<{ processedUsers: number; sentCount: number }> {
  const usersWithPrefs = await db.listUsersWithNotificationPrefs();
  let processedUsers = 0;
  let sentCount = 0;

  if (newAnnouncements.length === 0) {
    return { processedUsers: usersWithPrefs.length, sentCount: 0 };
  }

  for (const { user, prefs } of usersWithPrefs) {
    processedUsers += 1;
    if (!prefs.emailEnabled) {
      continue;
    }

    const { entitlements } = await getUserBillingState(db, user.id);
    if (!entitlements.canInstantAlert) {
      continue;
    }

    if (prefs.instantNewAnnouncements) {
      const profile = prefs.onlyMatchingProfile ? await db.getProfile(user.id) : null;

      for (const announcement of newAnnouncements) {
        if (announcement.status !== 'acik') continue;

        if (prefs.onlyMatchingProfile && profile) {
          const match = evaluateAnnouncementMatch(profile, announcement);
          if (!match.eligible) continue;
        }

        const reminderType = 'new_announcement';
        const alreadySent = await db.hasReminderLog(user.id, announcement.id, reminderType);
        if (alreadySent) continue;

        const result = await emailAdapter.sendEmail({
          to: user.email,
          subject: `Kamu Bildirim Sepeti: Yeni ilan - ${announcement.title}`,
          text: `${announcement.institution} tarafından "${announcement.title}" ilanı yayımlandı. Son başvuru tarihi: ${announcement.deadlineAt}. Resmî kaynak: ${announcement.sourceUrl}`,
        });

        if (result.delivered || emailAdapter.providerName === 'noop') {
          await db.recordReminderLog({
            id: generateId(),
            userId: user.id,
            announcementId: announcement.id,
            reminderType,
            sentAt: referenceDate.toISOString(),
          });
          sentCount += 1;
        }
      }
    }

    const savedSearches = (await db.listSavedSearches(user.id)).filter(
      (search) => search.notifyEmail,
    );
    for (const search of savedSearches) {
      for (const announcement of newAnnouncements) {
        if (announcement.status !== 'acik') continue;
        if (!matchesSavedSearchFilters(announcement, search.filters)) continue;

        const reminderType = `saved_search:${search.id}`;
        const alreadySent = await db.hasReminderLog(user.id, announcement.id, reminderType);
        if (alreadySent) continue;

        const result = await emailAdapter.sendEmail({
          to: user.email,
          subject: `Kamu Bildirim Sepeti: "${search.name}" aramanıza yeni ilan: ${announcement.title}`,
          text: `"${search.name}" kayıtlı aramanızla eşleşen yeni ilan yayımlandı: ${announcement.institution} - ${announcement.title}. Son başvuru tarihi: ${announcement.deadlineAt}. Resmî kaynak: ${announcement.sourceUrl}`,
        });

        if (result.delivered || emailAdapter.providerName === 'noop') {
          await db.recordReminderLog({
            id: generateId(),
            userId: user.id,
            announcementId: announcement.id,
            reminderType,
            sentAt: referenceDate.toISOString(),
          });
          sentCount += 1;
        }
      }
    }
  }

  return { processedUsers, sentCount };
}
