import type { MilitaryStatus } from '@/modules/announcements/types';
import type {
  DatabaseAdapter,
  EducationLevel,
  KpssScoreType,
  StoredUser,
  User,
  UserProfile,
} from '@/modules/db/types';
import {
  generateId,
  hashPassword,
  hashToken,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './crypto';

export const SESSION_COOKIE_NAME = 'kbs_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VALID_EDUCATION_LEVELS: ReadonlySet<EducationLevel> = new Set([
  'lisans',
  'onlisans',
  'ortaogretim',
]);
const VALID_SCORE_TYPES: ReadonlySet<KpssScoreType> = new Set(['P3', 'P93', 'P94']);
const VALID_MILITARY_STATUSES: ReadonlySet<MilitaryStatus> = new Set([
  'yapildi',
  'muaf',
  'tecilli',
  'ilgisiz',
]);

export class IdentityError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}

export function sanitizeUser(user: StoredUser): User {
  const { passwordHash: _ignored, ...safeUser } = user;
  void _ignored;
  return safeUser;
}

export function getSessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  };
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const segments = cookieHeader.split(';');
  for (const segment of segments) {
    const eqIndex = segment.indexOf('=');
    if (eqIndex === -1) continue;
    const key = segment.slice(0, eqIndex).trim();
    if (key === SESSION_COOKIE_NAME) {
      const value = segment.slice(eqIndex + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName?: string | null;
  phone?: string | null;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
}

export interface AuthResult {
  user: User;
  token: string;
  expiresAt: string;
}

async function createSessionForUser(
  db: DatabaseAdapter,
  userId: string,
): Promise<{ token: string; expiresAt: string }> {
  const sessionId = generateId();
  const expiresMs = Date.now() + SESSION_TTL_SECONDS * 1000;
  const expiresAt = new Date(expiresMs).toISOString();
  const token = await signSessionToken({
    sid: sessionId,
    uid: userId,
    exp: expiresMs,
  });
  const tokenHash = await hashToken(token);
  await db.createSession({
    id: sessionId,
    userId,
    tokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  });
  return { token, expiresAt };
}

export async function registerUser(
  db: DatabaseAdapter,
  input: RegisterInput,
): Promise<AuthResult> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new IdentityError('INVALID_EMAIL', 400, 'Geçerli bir e-posta adresi girin.');
  }
  if (typeof input.password !== 'string' || input.password.length < 8) {
    throw new IdentityError('WEAK_PASSWORD', 400, 'Parola en az 8 karakter olmalıdır.');
  }
  if (input.acceptedTerms !== true || input.acceptedPrivacy !== true) {
    throw new IdentityError(
      'CONSENT_REQUIRED',
      400,
      'Devam etmek için Kullanım Koşulları ve Gizlilik Politikasını onaylamalısınız.',
    );
  }

  const existing = await db.findUserByEmail(email);
  if (existing) {
    throw new IdentityError(
      'EMAIL_EXISTS',
      409,
      'Bu e-posta adresi ile kayıtlı bir hesap zaten var.',
    );
  }

  const now = new Date().toISOString();
  const userId = generateId();
  const passwordHash = await hashPassword(input.password);
  const fullName =
    typeof input.fullName === 'string' && input.fullName.trim() ? input.fullName.trim() : null;
  const phone =
    typeof input.phone === 'string' && input.phone.trim() ? input.phone.trim() : null;

  const created = await db.createUser({
    id: userId,
    email,
    passwordHash,
    fullName,
    phone,
    acceptedTermsAt: now,
    acceptedPrivacyAt: now,
    now,
  });

  await db.upsertProfile({
    userId,
    educationLevel: null,
    departmentId: null,
    kpssScoreType: null,
    kpssScore: null,
    residenceCity: null,
    militaryStatus: null,
    driverLicenses: [],
    certificates: [],
    qualificationCodes: [],
    updatedAt: now,
  });

  await db.upsertNotificationPrefs({
    userId,
    emailEnabled: true,
    instantNewAnnouncements: false,
    deadlineRemindersEnabled: true,
    reminderDaysBefore: 3,
    onlyMatchingProfile: true,
    updatedAt: now,
  });

  await db.upsertSubscription({
    id: generateId(),
    userId,
    plan: 'free',
    status: 'active',
    provider: 'demo',
    currentPeriodEnd: null,
    updatedAt: now,
  });

  const session = await createSessionForUser(db, userId);
  return {
    user: sanitizeUser(created),
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

export async function loginUser(
  db: DatabaseAdapter,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!email || !password) {
    throw new IdentityError('INVALID_CREDENTIALS', 401, 'E-posta veya parola hatalı.');
  }

  const user = await db.findUserByEmail(email);
  if (!user) {
    throw new IdentityError('INVALID_CREDENTIALS', 401, 'E-posta veya parola hatalı.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new IdentityError('INVALID_CREDENTIALS', 401, 'E-posta veya parola hatalı.');
  }

  const session = await createSessionForUser(db, user.id);
  return {
    user: sanitizeUser(user),
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

export async function logoutSession(
  db: DatabaseAdapter,
  token: string | null | undefined,
): Promise<void> {
  if (!token) return;
  const tokenHash = await hashToken(token);
  await db.deleteSessionByTokenHash(tokenHash);
}

export async function getAuthenticatedUser(
  db: DatabaseAdapter,
  token: string | null | undefined,
): Promise<User | null> {
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const tokenHash = await hashToken(token);
  const session = await db.findSessionByTokenHash(tokenHash);
  if (!session || session.userId !== payload.uid) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await db.deleteSessionByTokenHash(tokenHash);
    return null;
  }

  const user = await db.findUserById(payload.uid);
  return user ? sanitizeUser(user) : null;
}

export function createEmptyProfile(userId: string): UserProfile {
  return {
    userId,
    educationLevel: null,
    departmentId: null,
    kpssScoreType: null,
    kpssScore: null,
    residenceCity: null,
    militaryStatus: null,
    driverLicenses: [],
    certificates: [],
    qualificationCodes: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getUserProfile(db: DatabaseAdapter, userId: string): Promise<UserProfile> {
  const existing = await db.getProfile(userId);
  return existing ?? createEmptyProfile(userId);
}

export interface ProfileUpdateInput {
  fullName?: string | null;
  phone?: string | null;
  educationLevel?: EducationLevel | null;
  departmentId?: string | null;
  kpssScoreType?: KpssScoreType | null;
  kpssScore?: number | null;
  residenceCity?: string | null;
  militaryStatus?: MilitaryStatus | null;
  driverLicenses?: string[];
  certificates?: string[];
  qualificationCodes?: string[];
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  for (const item of values) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) unique.add(trimmed);
    }
  }
  return Array.from(unique);
}

export async function updateUserProfile(
  db: DatabaseAdapter,
  userId: string,
  input: ProfileUpdateInput,
): Promise<{ user: User | null; profile: UserProfile }> {
  const current = await getUserProfile(db, userId);
  const now = new Date().toISOString();

  if (
    input.educationLevel !== undefined &&
    input.educationLevel !== null &&
    !VALID_EDUCATION_LEVELS.has(input.educationLevel)
  ) {
    throw new IdentityError('INVALID_EDUCATION', 400, 'Geçersiz öğrenim düzeyi seçimi.');
  }
  if (
    input.kpssScoreType !== undefined &&
    input.kpssScoreType !== null &&
    !VALID_SCORE_TYPES.has(input.kpssScoreType)
  ) {
    throw new IdentityError('INVALID_KPSS_TYPE', 400, 'Geçersiz KPSS puan türü seçimi.');
  }
  if (
    input.militaryStatus !== undefined &&
    input.militaryStatus !== null &&
    !VALID_MILITARY_STATUSES.has(input.militaryStatus)
  ) {
    throw new IdentityError('INVALID_MILITARY', 400, 'Geçersiz askerlik durumu seçimi.');
  }

  let nextScore = current.kpssScore;
  if (input.kpssScore !== undefined) {
    if (input.kpssScore === null) {
      nextScore = null;
    } else if (
      typeof input.kpssScore !== 'number' ||
      Number.isNaN(input.kpssScore) ||
      input.kpssScore < 0 ||
      input.kpssScore > 100
    ) {
      throw new IdentityError(
        'INVALID_KPSS_SCORE',
        400,
        'KPSS puanı 0 ile 100 arasında olmalıdır.',
      );
    } else {
      nextScore = Math.round(input.kpssScore * 100) / 100;
    }
  }

  let updatedUser: User | null = null;
  if (input.fullName !== undefined || input.phone !== undefined) {
    const rawUser = await db.updateUserAccount(userId, {
      fullName:
        input.fullName === undefined
          ? undefined
          : input.fullName && input.fullName.trim()
            ? input.fullName.trim()
            : null,
      phone:
        input.phone === undefined
          ? undefined
          : input.phone && input.phone.trim()
            ? input.phone.trim()
            : null,
      now,
    });
    updatedUser = rawUser ? sanitizeUser(rawUser) : null;
  } else {
    const rawUser = await db.findUserById(userId);
    updatedUser = rawUser ? sanitizeUser(rawUser) : null;
  }

  const nextProfile: UserProfile = {
    userId,
    educationLevel:
      input.educationLevel !== undefined ? input.educationLevel : current.educationLevel,
    departmentId:
      input.departmentId !== undefined
        ? input.departmentId?.trim() || null
        : current.departmentId,
    kpssScoreType:
      input.kpssScoreType !== undefined ? input.kpssScoreType : current.kpssScoreType,
    kpssScore: nextScore,
    residenceCity:
      input.residenceCity !== undefined
        ? input.residenceCity?.trim() || null
        : current.residenceCity,
    militaryStatus:
      input.militaryStatus !== undefined ? input.militaryStatus : current.militaryStatus,
    driverLicenses:
      input.driverLicenses !== undefined
        ? normalizeStringList(input.driverLicenses)
        : current.driverLicenses,
    certificates:
      input.certificates !== undefined
        ? normalizeStringList(input.certificates)
        : current.certificates,
    qualificationCodes:
      input.qualificationCodes !== undefined
        ? normalizeStringList(input.qualificationCodes)
        : current.qualificationCodes,
    updatedAt: now,
  };

  const savedProfile = await db.upsertProfile(nextProfile);
  return { user: updatedUser, profile: savedProfile };
}

export async function deleteUserAccount(
  db: DatabaseAdapter,
  userId: string,
  confirmText: unknown,
): Promise<boolean> {
  if (confirmText !== 'SIL') {
    throw new IdentityError(
      'CONFIRMATION_REQUIRED',
      400,
      'Hesap silme işlemini onaylamak için SIL yazmalısınız.',
    );
  }
  return db.deleteUser(userId);
}
