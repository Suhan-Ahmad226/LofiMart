import { startWorkers } from './queue';
import { logger } from '../lib/logger';

async function main() {
  await startWorkers();
  logger.info('worker.started', {
    service: 'commerce-workers',
  });
}

main().catch((error) => {
  console.error('[worker] failed to start', error);
  process.exit(1);
});
