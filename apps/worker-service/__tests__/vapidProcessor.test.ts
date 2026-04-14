/**
 * VAPID / Web Push Processor Tests — Unit 20
 *
 * Verifies:
 * - Successful push notification delivery via web-push
 * - Graceful handling when VAPID keys are missing (log warn, skip)
 * - 410 Gone subscription errors are handled (subscription should be removed)
 *
 * Per SPEC.md §20 Story 10.6, CLAUDE.md rule 14.
 */

import type { Job } from 'bullmq';
import type { VapidJobPayload } from '../src/processors/vapid.processor';

// Mock web-push
const mockSendNotification = jest.fn();
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: mockSendNotification,
}));

// Mock ioredis (not used in vapid processor but needed for module imports)
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockResolvedValue(1),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    status: 'ready',
  }));
});

// Mock winston logger
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockInfo = jest.fn();
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    debug: jest.fn(),
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

import { processVapid } from '../src/processors/vapid.processor';

const validPayload: VapidJobPayload = {
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    keys: {
      auth: 'test-auth-key',
      p256dh: 'test-p256dh-key',
    },
  },
  title: 'Your turn in Cribbage!',
  body: 'Room A — 52 cards remaining in deck',
  url: '/table/room-123',
};

describe('processVapid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when VAPID keys are configured', () => {
    beforeEach(() => {
      process.env.VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';
      process.env.VAPID_SUBJECT = 'mailto:admin@platform.example.com';
    });

    afterEach(() => {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      delete process.env.VAPID_SUBJECT;
    });

    it('sends push notification with correct payload', async () => {
      mockSendNotification.mockResolvedValueOnce({ statusCode: 201 });

      const mockJob = { data: validPayload } as Job<VapidJobPayload>;
      await processVapid(mockJob);

      expect(mockSendNotification).toHaveBeenCalledTimes(1);
      const [subscription, notificationPayload] = mockSendNotification.mock.calls[0];
      expect(subscription).toEqual(validPayload.subscription);

      const parsed = JSON.parse(notificationPayload as string);
      expect(parsed.title).toBe('Your turn in Cribbage!');
      expect(parsed.body).toBe('Room A — 52 cards remaining in deck');
      expect(parsed.url).toBe('/table/room-123');
    });

    it('handles 410 Gone error gracefully without re-throwing', async () => {
      const goneError = Object.assign(new Error('Subscription expired'), {
        statusCode: 410,
      });
      mockSendNotification.mockRejectedValueOnce(goneError);

      const mockJob = { data: validPayload } as Job<VapidJobPayload>;

      // Should NOT throw — 410 is handled gracefully
      await expect(processVapid(mockJob)).resolves.not.toThrow();

      // Should log a warning about the expired subscription
      expect(mockWarn).toHaveBeenCalled();
    });

    it('re-throws non-410 errors so BullMQ can retry', async () => {
      const serverError = Object.assign(new Error('Internal server error'), {
        statusCode: 500,
      });
      mockSendNotification.mockRejectedValueOnce(serverError);

      const mockJob = { data: validPayload } as Job<VapidJobPayload>;
      await expect(processVapid(mockJob)).rejects.toThrow('Internal server error');
    });
  });

  describe('when VAPID keys are missing', () => {
    beforeEach(() => {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      delete process.env.VAPID_SUBJECT;
    });

    it('logs a warning and skips sending without throwing', async () => {
      const mockJob = { data: validPayload } as Job<VapidJobPayload>;

      // Should NOT throw — missing VAPID keys is handled gracefully
      await expect(processVapid(mockJob)).resolves.not.toThrow();

      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockWarn).toHaveBeenCalled();
    });

    it('warns even when only some VAPID keys are missing', async () => {
      process.env.VAPID_PUBLIC_KEY = 'test-public-key';
      // VAPID_PRIVATE_KEY and VAPID_SUBJECT not set

      const mockJob = { data: validPayload } as Job<VapidJobPayload>;
      await expect(processVapid(mockJob)).resolves.not.toThrow();

      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockWarn).toHaveBeenCalled();

      delete process.env.VAPID_PUBLIC_KEY;
    });
  });
});
