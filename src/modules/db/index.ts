import { D1Adapter, type D1DatabaseLike } from './d1-adapter';
import { MemoryDbAdapter } from './memory-adapter';
import type { DatabaseAdapter } from './types';

export * from './types';
export { D1Adapter, MemoryDbAdapter };

const globalForDb = globalThis as typeof globalThis & {
  __kbsMemoryDb?: MemoryDbAdapter;
};

export function getMemoryDb(): MemoryDbAdapter {
  if (!globalForDb.__kbsMemoryDb) {
    globalForDb.__kbsMemoryDb = new MemoryDbAdapter();
  }
  return globalForDb.__kbsMemoryDb;
}

export function resetMemoryDb(): MemoryDbAdapter {
  globalForDb.__kbsMemoryDb = new MemoryDbAdapter();
  return globalForDb.__kbsMemoryDb;
}

export async function getDb(): Promise<DatabaseAdapter> {
  try {
    const cf = await import('@opennextjs/cloudflare');
    if (typeof cf.getCloudflareContext === 'function') {
      const ctx = await cf.getCloudflareContext({ async: true });
      const env = ctx?.env as Record<string, unknown> | undefined;
      if (env && env.DB && typeof (env.DB as { prepare?: unknown }).prepare === 'function') {
        return new D1Adapter(env.DB as D1DatabaseLike);
      }
    }
  } catch {
    // Fallback to singleton memory adapter outside Cloudflare Workers runtime
  }
  return getMemoryDb();
}
