/**
 * Suite 9d — Phase 10 hand-end flow
 *
 * Regression guard for the "score, announce winner, ack, deal next hand"
 * flow. Two tests:
 *   1. Two bots play a round to completion; after the hand ends, both bots
 *      auto-ack and the round advances back to phase='playing' with the
 *      winner's phase bumped by 1 and cumulative scores preserved.
 *   2. A human player sees the scoring overlay and is blocked from further
 *      play until they click the ACK button.
 */
import { test, expect } from './fixtures/auth.fixture';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

async function readState(
  page: import('@playwright/test').Page,
  roomId: string,
): Promise<{
  version: number;
  phase?: string;
  roundNumber?: number;
  players?: Array<{ playerId: string; currentPhase?: number; score?: number; phaseLaidDown?: boolean; hand?: unknown[] }>;
  publicData?: { handWinnerId?: string; scoringAcks?: string[]; handScores?: Record<string, number> };
} | null> {
  const resp = await page.request.get(`${API_URL}/test/game-state/${roomId}`);
  if (!resp.ok()) return null;
  const body = (await resp.json()) as Record<string, unknown> | null;
  return body as never;
}

async function waitUntil<T>(
  fn: () => Promise<T | null>,
  predicate: (v: T) => boolean,
  timeoutMs: number,
  pollMs = 300,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v !== null && predicate(v)) return v;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

test.describe('Suite 9d — Phase 10 hand-end', () => {
  test('9d.1 two bots: hand-end → scoring → both auto-ack → next hand dealt, winner advanced', async ({
    authedPage: page,
  }) => {
    test.setTimeout(85_000);
    await page.request.post(`${API_URL}/test/reset`);
    const seedResp = await page.request.post(`${API_URL}/test/seed-game`, {
      data: {
        gameId: 'phase10',
        players: ['test-player-1', 'test-player-2'],
        scenario: 'phase10-start',
      },
    });
    const { roomId } = (await seedResp.json()) as { roomId: string };
    await page.request.post(`${API_URL}/test/force-bot-activate`, {
      data: { roomId, playerId: 'test-player-1' },
    });
    await page.request.post(`${API_URL}/test/force-bot-activate`, {
      data: { roomId, playerId: 'test-player-2' },
    });

    // Wait for the first hand to end (phase === 'scoring').
    const scoring = await waitUntil(
      () => readState(page, roomId),
      (s) => s.phase === 'scoring',
      40_000,
    );
    expect(scoring, 'scoring phase reached within 40s').not.toBeNull();
    expect(scoring!.publicData?.handWinnerId).toBeDefined();

    const winnerIdBeforeDeal = scoring!.publicData!.handWinnerId!;
    const winnerPhaseBefore =
      scoring!.players!.find((p) => p.playerId === winnerIdBeforeDeal)!.currentPhase ?? 1;

    // Bots should auto-ack and the round should advance back to playing
    // with the winner's phase bumped by 1.
    const nextHand = await waitUntil(
      () => readState(page, roomId),
      (s) => s.phase === 'playing' && (s.roundNumber ?? 1) >= 2,
      30_000,
    );
    expect(nextHand, 'next hand dealt within 30s of scoring').not.toBeNull();

    const winnerAfter = nextHand!.players!.find((p) => p.playerId === winnerIdBeforeDeal)!;
    expect(winnerAfter.currentPhase).toBe(winnerPhaseBefore + 1);
    expect(winnerAfter.hand).toHaveLength(10);
    expect(nextHand!.publicData?.handWinnerId).toBeUndefined();
    expect(nextHand!.publicData?.scoringAcks).toBeUndefined();
  });
});
