import { D1Adapter, type D1DatabaseLike } from './d1-adapter';
import { MemoryDbAdapter } from './memory-adapter';
import type { DatabaseAdapter } from './types';

export * from './types';
export { D1Adapter, MemoryDbAdapter };

const globalForDb = globalThis as typeof globalThis & {
  __kbsMemoryDb?: MemoryDbAdapter;
};

const verifiedD1Instances = new WeakSet<object>();

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
        const d1 = env.DB as D1DatabaseLike;
        if (!verifiedD1Instances.has(d1)) {
          await d1.prepare('SELECT 1 FROM announcements LIMIT 1').first();
          verifiedD1Instances.add(d1);
        }
        return new D1Adapter(d1);
      }
    }
  } catch {
    // Fallback to singleton memory adapter outside Cloudflare Workers or when local D1 lacks schema
  }
  return getMemoryDb();
}
