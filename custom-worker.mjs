export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from './.open-next/worker.js';
import openNextWorker from './.open-next/worker.js';
import { handleScheduledSync } from './src/modules/worker/scheduled.ts';

const worker = {
  async fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    return handleScheduledSync(controller, env, ctx, openNextWorker.fetch);
  },
};

export default worker;
