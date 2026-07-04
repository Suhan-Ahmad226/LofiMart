import { Queue, Worker } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { getServerEnv } from '../lib/env';
import { ensureRedis } from '../services/messaging/redis';
import { inventoryModule } from '../modules/inventory/index';
import { prisma } from '../services/database/prisma';

export const QUEUE_NAMES = {
  inventoryAlerts: 'inventory-alerts',
  cacheWarm: 'cache-warm',
  orderProcessing: 'order-processing',
  paymentProcessing: 'payment-processing',
  email: 'email',
  notifications: 'notifications',
  analytics: 'analytics',
  stockUpdates: 'stock-updates',
  cartRecovery: 'cart-recovery',
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queueMap = new Map<QueueName, Queue>();

async function createQueue(name: QueueName) {
  const connection = (await ensureRedis()) as any;
  const env = getServerEnv();

  return new Queue(name, {
    connection,
    prefix: env.QUEUE_PREFIX,
    skipVersionCheck: true,
    defaultJobOptions: {
      attempts: env.QUEUE_DEFAULT_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: env.QUEUE_DEFAULT_JOB_BACKOFF_MS,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}

export async function getQueue(name: QueueName) {
  const existing = queueMap.get(name);
  if (existing) return existing;

  const queue = await createQueue(name);
  queueMap.set(name, queue);
  return queue;
}

export async function enqueueJob(name: QueueName, jobName: string, data: unknown, opts?: JobsOptions) {
  const queue = await getQueue(name);
  return queue.add(jobName, data, opts);
}

function sanitizeJobId(input: string) {
  return input.replace(/[:\s]+/g, '-');
}

export async function enqueueInventoryAlertScan(sellerId?: string) {
  return enqueueJob(QUEUE_NAMES.inventoryAlerts, 'scan-low-stock', { sellerId });
}

export async function enqueueCacheWarmup(tags: string[]) {
  return enqueueJob(QUEUE_NAMES.cacheWarm, 'warm-cache', { tags });
}

export async function enqueueOrderProcessing(data: { orderId: string; userId: string; tenantId?: string | null }) {
  return enqueueJob(QUEUE_NAMES.orderProcessing, 'process-order', data);
}

export async function enqueuePaymentProcessing(data: {
  paymentId: string;
  provider: string;
  orderId?: string;
  userId?: string;
  tenantId?: string | null;
}) {
  return enqueueJob(QUEUE_NAMES.paymentProcessing, 'process-payment', data);
}

export async function enqueueEmail(data: { to: string; subject: string; template: string; payload?: Record<string, unknown> }) {
  return enqueueJob(QUEUE_NAMES.email, 'send-email', data);
}

export async function enqueueNotification(data: { userId: string; channel: string; message: string }) {
  return enqueueJob(QUEUE_NAMES.notifications, 'send-notification', data);
}

export async function enqueueAnalyticsEvent(data: { name: string; payload: Record<string, unknown> }) {
  return enqueueJob(QUEUE_NAMES.analytics, 'track-analytics-event', data);
}

export async function enqueueStockUpdate(data: { productId: string; delta: number; reason: string; warehouseId?: string }) {
  return enqueueJob(QUEUE_NAMES.stockUpdates, 'inventory-stock-update', data);
}

export async function enqueueCartRecovery(data: {
  userId: string;
  email: string;
  name?: string | null;
  tenantId?: string | null;
  cartKey: string;
  cartRecoveryDelayMins: number;
}) {
  return enqueueJob(
    QUEUE_NAMES.cartRecovery,
    'cart-recovery-email',
    data,
    {
      delay: Math.max(1, data.cartRecoveryDelayMins) * 60 * 1000,
      jobId: sanitizeJobId(`cart-recovery-${data.userId}`),
    },
  );
}

export async function getQueueHealth() {
  const inventoryQueue = await getQueue(QUEUE_NAMES.inventoryAlerts);
  const cacheQueue = await getQueue(QUEUE_NAMES.cacheWarm);
  const orderProcessingQueue = await getQueue(QUEUE_NAMES.orderProcessing);
  const paymentProcessingQueue = await getQueue(QUEUE_NAMES.paymentProcessing);
  const emailQueue = await getQueue(QUEUE_NAMES.email);
  const notificationsQueue = await getQueue(QUEUE_NAMES.notifications);
  const analyticsQueue = await getQueue(QUEUE_NAMES.analytics);
  const stockUpdatesQueue = await getQueue(QUEUE_NAMES.stockUpdates);
  const cartRecoveryQueue = await getQueue(QUEUE_NAMES.cartRecovery);

  return {
    ok: true,
    queues: {
      [QUEUE_NAMES.inventoryAlerts]: await inventoryQueue.getJobCounts(),
      [QUEUE_NAMES.cacheWarm]: await cacheQueue.getJobCounts(),
      [QUEUE_NAMES.orderProcessing]: await orderProcessingQueue.getJobCounts(),
      [QUEUE_NAMES.paymentProcessing]: await paymentProcessingQueue.getJobCounts(),
      [QUEUE_NAMES.email]: await emailQueue.getJobCounts(),
      [QUEUE_NAMES.notifications]: await notificationsQueue.getJobCounts(),
      [QUEUE_NAMES.analytics]: await analyticsQueue.getJobCounts(),
      [QUEUE_NAMES.stockUpdates]: await stockUpdatesQueue.getJobCounts(),
      [QUEUE_NAMES.cartRecovery]: await cartRecoveryQueue.getJobCounts(),
    },
  };
}

export async function startWorkers() {
  const connection = (await ensureRedis()) as any;
  const env = getServerEnv();

  const inventoryWorker = new Worker(
    QUEUE_NAMES.inventoryAlerts,
    async (job) => {
      const sellerId = typeof job.data?.sellerId === 'string' ? job.data.sellerId : undefined;
      const threshold = env.LOW_STOCK_THRESHOLD;
      const products = await inventoryModule.scanLowStockProducts(sellerId, threshold);

      return {
        scanned: products.length,
        sellerId: sellerId ?? null,
      };
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const cacheWorker = new Worker(
    QUEUE_NAMES.cacheWarm,
    async (job) => ({
      warmed: Array.isArray(job.data?.tags) ? job.data.tags.length : 0,
    }),
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const emailWorker = new Worker(
    QUEUE_NAMES.email,
    async (job) => {
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || process.env.NOTIFY_FROM_EMAIL || 'no-reply@amarshop.local';

      if (!smtpHost || !smtpUser || !smtpPass) {
        return {
          delivered: false,
          skipped: true,
          reason: 'smtp_not_configured',
          to: job.data?.to,
          template: job.data?.template,
        };
      }

      const nodemailer = (await import('nodemailer')).default;
      const transport = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const payload = job.data?.payload || {};
      const subject = typeof job.data?.subject === 'string' ? job.data.subject : 'LofiMart notification';
      const html = typeof payload.html === 'string'
        ? payload.html
        : `<p>${String(payload.message || 'You have a new update from LofiMart.')}</p>`;

      await transport.sendMail({
        from: smtpFrom,
        to: job.data?.to,
        subject,
        html,
      });

      return {
        delivered: true,
        to: job.data?.to,
        template: job.data?.template,
      };
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const orderProcessingWorker = new Worker(
    QUEUE_NAMES.orderProcessing,
    async (job) => ({
      processed: true,
      orderId: job.data?.orderId,
      userId: job.data?.userId,
    }),
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const paymentProcessingWorker = new Worker(
    QUEUE_NAMES.paymentProcessing,
    async (job) => ({
      processed: true,
      paymentId: job.data?.paymentId,
      provider: job.data?.provider,
      orderId: job.data?.orderId,
    }),
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const notificationsWorker = new Worker(
    QUEUE_NAMES.notifications,
    async (job) => ({
      sent: true,
      userId: job.data?.userId,
      channel: job.data?.channel,
    }),
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const analyticsWorker = new Worker(
    QUEUE_NAMES.analytics,
    async (job) => ({
      tracked: true,
      name: job.data?.name,
    }),
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const stockUpdatesWorker = new Worker(
    QUEUE_NAMES.stockUpdates,
    async (job) => ({
      applied: true,
      productId: job.data?.productId,
      delta: job.data?.delta,
    }),
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  const cartRecoveryWorker = new Worker(
    QUEUE_NAMES.cartRecovery,
    async (job) => {
      const cartKey = typeof job.data?.cartKey === 'string' ? job.data.cartKey : '';
      const userId = typeof job.data?.userId === 'string' ? job.data.userId : '';

      if (!cartKey || !userId) {
        return { sent: false, reason: 'invalid_payload' };
      }

      const redis = await ensureRedis();
      const cartPayload = await redis.get(cartKey);
      if (!cartPayload) {
        return { sent: false, reason: 'empty_cart' };
      }

      let items: Array<{ name?: string; quantity?: number; price?: number }> = [];
      try {
        items = JSON.parse(cartPayload);
      } catch {
        items = [];
      }

      if (!Array.isArray(items) || items.length === 0) {
        return { sent: false, reason: 'no_items' };
      }

      const existingRecentNotification = await prisma.userNotification.findFirst({
        where: {
          userId,
          type: 'cart_recovery',
          createdAt: {
            gte: new Date(Date.now() - 12 * 60 * 60 * 1000),
          },
        },
      });

      if (existingRecentNotification) {
        return { sent: false, reason: 'recently_sent' };
      }

      const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
      const itemNames = items.slice(0, 3).map((item) => item.name).filter(Boolean).join(', ');

      await prisma.userNotification.create({
        data: {
          userId,
          tenantId: typeof job.data?.tenantId === 'string' ? job.data.tenantId : null,
          type: 'cart_recovery',
          title: 'Your cart is still waiting',
          message: itemNames
            ? `You still have ${itemNames} in your cart. Complete checkout before stock changes.`
            : 'You still have products waiting in your cart. Complete checkout before stock changes.',
          actionUrl: '/cart',
          metadata: {
            subtotal,
            itemCount: items.length,
          },
        },
      });

      await enqueueEmail({
        to: String(job.data?.email || ''),
        subject: 'Your LofiMart cart is waiting',
        template: 'cart-recovery',
        payload: {
          message: 'Your saved cart is still available.',
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
              <h2 style="margin-bottom:12px;">Your cart is still waiting</h2>
              <p>Hello ${String(job.data?.name || 'there')},</p>
              <p>You still have items in your cart at LofiMart.</p>
              <p><strong>Items:</strong> ${itemNames || 'Saved products'}</p>
              <p><strong>Cart subtotal:</strong> ${subtotal}</p>
              <p>Complete checkout before stock availability changes.</p>
            </div>
          `,
        },
      });

      return {
        sent: true,
        userId,
        to: job.data?.email,
        subtotal,
        itemCount: items.length,
      };
    },
    {
      connection,
      prefix: env.QUEUE_PREFIX,
      skipVersionCheck: true,
    },
  );

  for (const worker of [inventoryWorker, cacheWorker, orderProcessingWorker, paymentProcessingWorker, emailWorker, notificationsWorker, analyticsWorker, stockUpdatesWorker, cartRecoveryWorker]) {
    worker.on('failed', (job, error) => {
      console.error(`[queue:${worker.name}] job ${job?.id ?? 'unknown'} failed`, error);
    });
  }

  return [inventoryWorker, cacheWorker, orderProcessingWorker, paymentProcessingWorker, emailWorker, notificationsWorker, analyticsWorker, stockUpdatesWorker, cartRecoveryWorker];
}
