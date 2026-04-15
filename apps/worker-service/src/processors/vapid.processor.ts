/**
 * VAPID Web Push Processor — Unit 20
 *
 * Sends Web Push notifications to subscribers for async turn notifications.
 *
 * Rules:
 * - VAPID keys are read from env vars — NEVER hardcoded (CLAUDE.md rule 14).
 * - If VAPID keys are missing, log a warning and skip (graceful degradation).
 * - 410 Gone responses indicate expired subscriptions — log warning and skip.
 * - All other errors are re-thrown so BullMQ can retry.
 *
 * Per SPEC.md §20 Story 9.4 and Story 10.6.
 */

import type { Job } from 'bullmq';
import webpush from 'web-push';
import { logger } from '../utils/logger';

/** Web Push subscription object (W3C Push API format). */
export interface PushSubscription {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export interface VapidJobPayload {
  subscription: PushSubscription;
  title: string;
  body: string;
  /** URL to open when the notification is clicked. */
  url: string;
}

/**
 * Process a Web Push notification job.
 * Sends a push notification to the subscriber.
 */
export async function processVapid(job: Job<VapidJobPayload>): Promise<void> {
  const { subscription, title, body, url } = job.data;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  // Gracefully skip if VAPID keys are not configured
  if (!publicKey || !privateKey || !subject) {
    logger.warn('VAPID keys not configured — skipping Web Push notification', {
      hasPublicKey: !!publicKey,
      hasPrivateKey: !!privateKey,
      hasSubject: !!subject,
    });
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const notificationPayload = JSON.stringify({ title, body, url });

  try {
    await webpush.sendNotification(subscription, notificationPayload);
    logger.info('Web Push notification sent', { endpoint: subscription.endpoint, title });
  } catch (err) {
    const error = err as { statusCode?: number; message?: string };

    if (error.statusCode === 410) {
      // 410 Gone: subscription is no longer valid
      logger.warn('Push subscription expired (410 Gone) — should be removed from DB', {
        endpoint: subscription.endpoint,
      });
      // Return without re-throwing so the job completes (not retried)
      return;
    }

    // Re-throw all other errors so BullMQ can retry
    logger.error('Failed to send Web Push notification', {
      endpoint: subscription.endpoint,
      statusCode: error.statusCode,
      message: error.message,
    });
    throw err;
  }
}
