import { enqueueJob, QUEUE_NAMES } from '@/workers/queue';

export type MediaDeleteJob = {
  publicId?: string | null;
  url?: string | null;
  resourceType?: string | null;
  reason: string;
  entityType?: string | null;
  entityId?: string | null;
};

export async function enqueueMediaDelete(data: MediaDeleteJob) {
  const identity = data.publicId || data.url || `${data.entityType || 'media'}-${data.entityId || Date.now()}`;
  return enqueueJob(QUEUE_NAMES.mediaCleanup, 'delete-media', data, {
    jobId: `media-delete-${String(identity).replace(/[^a-zA-Z0-9_-]+/g, '-')}`,
  });
}

export async function enqueueUserMediaCleanup(data: { userId?: string | null; supabaseAuthId?: string | null; email?: string | null; reason: string }) {
  const identity = data.userId || data.supabaseAuthId || data.email || Date.now();
  return enqueueJob(QUEUE_NAMES.mediaCleanup, 'cleanup-user', data, {
    jobId: `media-user-cleanup-${String(identity).replace(/[^a-zA-Z0-9_-]+/g, '-')}`,
  });
}

export async function enqueueOrphanMediaCleanup() {
  return enqueueJob(QUEUE_NAMES.mediaCleanup, 'orphan-media-sweep', { queuedAt: Date.now() }, {
    jobId: 'orphan-media-sweep',
  });
}
