import { NextResponse } from 'next/server';
import { getDb } from '@/modules/db';
import type { SavedSearchFilters } from '@/modules/db/types';
import { getAuthenticatedUser, getSessionTokenFromRequest } from '@/modules/identity';
import { generateId } from '@/modules/identity/crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_FILTER_KEYS: ReadonlyArray<keyof SavedSearchFilters> = [
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
];

function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Oturum açmanız gerekiyor.', code: 'UNAUTHORIZED' },
    { status: 401 },
  );
}

function sanitizeFilters(raw: unknown): SavedSearchFilters | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const cleaned: SavedSearchFilters = {};
  for (const key of ALLOWED_FILTER_KEYS) {
    const val = obj[key];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) {
        cleaned[key] = trimmed.slice(0, 120);
      }
    } else if (key === 'maxKpssScore' && typeof val === 'number' && Number.isFinite(val)) {
      cleaned[key] = String(val);
    }
  }
  return cleaned;
}

export async function GET(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return unauthorizedResponse();
  }

  const searches = await db.listSavedSearches(user.id);
  return NextResponse.json(
    {
      searches,
      items: searches,
      count: searches.length,
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return unauthorizedResponse();
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
        { status: 400 },
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Geçersiz istek gövdesi.', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) {
    return NextResponse.json(
      { error: 'Kayıtlı arama adı 1 ile 120 karakter arasında olmalıdır.', code: 'INVALID_NAME' },
      { status: 400 },
    );
  }

  const filters = sanitizeFilters(body.filters);
  if (!filters) {
    return NextResponse.json(
      { error: 'Geçerli bir filtre nesnesi (filters) gereklidir.', code: 'INVALID_FILTERS' },
      { status: 400 },
    );
  }

  const notifyPush = typeof body.notifyPush === 'boolean' ? body.notifyPush : true;
  const notifyEmail = typeof body.notifyEmail === 'boolean' ? body.notifyEmail : true;

  const search = await db.createSavedSearch({
    id: generateId(),
    userId: user.id,
    name,
    filters,
    notifyPush,
    notifyEmail,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ search }, { status: 201 });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  const user = await getAuthenticatedUser(db, getSessionTokenFromRequest(request));
  if (!user) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  let id = url.searchParams.get('id')?.trim() ?? '';

  if (!id) {
    try {
      const parsed: unknown = await request.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const body = parsed as Record<string, unknown>;
        if (typeof body.id === 'string') {
          id = body.id.trim();
        }
      }
    } catch {
      // Handled by empty id check below
    }
  }

  if (!id) {
    return NextResponse.json(
      { error: 'Silinecek arama kimliği (id) gereklidir.', code: 'INVALID_ID' },
      { status: 400 },
    );
  }

  const deleted = await db.deleteSavedSearch(user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { error: 'Kayıtlı arama bulunamadı.', code: 'NOT_FOUND', deleted: false },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
