import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getDb D1 schema verification and fallback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@opennextjs/cloudflare');
    vi.restoreAllMocks();
  });

  it('falls back to MemoryDbAdapter when local D1 lacks announcements table', async () => {
    const firstMock = vi.fn().mockRejectedValue(new Error('D1_ERROR: no such table: announcements'));
    const prepareMock = vi.fn(() => ({
      bind: () => ({ first: firstMock, all: vi.fn(), run: vi.fn() }),
      first: firstMock,
      all: vi.fn(),
      run: vi.fn(),
    }));

    vi.doMock('@opennextjs/cloudflare', () => ({
      getCloudflareContext: vi.fn(async () => ({
        env: {
          DB: {
            prepare: prepareMock,
            batch: vi.fn(),
          },
        },
      })),
    }));

    const { getDb, MemoryDbAdapter, resetMemoryDb } = await import('@/modules/db');
    resetMemoryDb();

    const db = await getDb();
    expect(db).toBeInstanceOf(MemoryDbAdapter);
    expect(prepareMock).toHaveBeenCalledWith('SELECT 1 FROM announcements LIMIT 1');

    const announcements = await db.listAnnouncements();
    expect(announcements.length).toBeGreaterThanOrEqual(24);
  });

  it('returns D1Adapter and caches schema verification when announcements table exists', async () => {
    const firstMock = vi.fn().mockResolvedValue({ '1': 1 });
    const prepareMock = vi.fn(() => ({
      bind: () => ({ first: firstMock, all: vi.fn(), run: vi.fn() }),
      first: firstMock,
      all: vi.fn(),
      run: vi.fn(),
    }));

    const d1Binding = {
      prepare: prepareMock,
      batch: vi.fn(),
    };

    vi.doMock('@opennextjs/cloudflare', () => ({
      getCloudflareContext: vi.fn(async () => ({
        env: {
          DB: d1Binding,
        },
      })),
    }));

    const { getDb, D1Adapter } = await import('@/modules/db');

    const db1 = await getDb();
    expect(db1).toBeInstanceOf(D1Adapter);
    expect(prepareMock).toHaveBeenCalledTimes(1);

    const db2 = await getDb();
    expect(db2).toBeInstanceOf(D1Adapter);
    expect(prepareMock).toHaveBeenCalledTimes(1);
  });
});
