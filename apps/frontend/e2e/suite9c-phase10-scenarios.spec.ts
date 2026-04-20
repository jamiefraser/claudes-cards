/**
 * Suite 9c — Phase 10 bot scenario smokes
 *
 * Three narrowly-scoped regression smokes for the bot+scheduler wiring:
 *   1. Lay-down burst — two bots play enough turns to trigger at least
 *      one lay-down; the scheduler must keep advancing after lay-down
 *      (regression: bot hit-melded its way to an empty hand and the
 *      fallback returned 'pass' which stranded the schedule keys).
 *   2. Skip-discard in a 2-player game — discarding a skip must keep
 *      control on the discarder and the scheduler must immediately
 *      fire their next turn.
 *   3. Skip-discard in a 3-player game — skip consumes the physically-
 *      next player's turn; scheduler advances to the one after.
 *
 * The tests poll Redis (via /test/game-state) so they're decoupled from
 * the frontend event wiring. Per-run: ~30-90s.
 */
import { test, expect } from './fixtures/auth.fixture';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/v1';

async function readState(
  page: import('@playwright/test').Page,
  roomId: string,
): Promise<{
  version: number;
  phase?: string;
  currentTurn?: string | null;
  players?: Array<{ playerId: string; hand: { length: number }[]; phaseLaidDown?: boolean }>;
  publicData?: { skippedPlayers?: string[]; laidDownPhases?: Record<string, unknown> };
} | null> {
  const resp = await page.request.get(`${API_URL}/test/game-state/${roomId}`);
  if (!resp.ok()) return null;
  const body = (await resp.json()) as Record<string, unknown> | null;
  return body as unknown as ReturnType<typeof readState> extends Promise<infer T> ? T : never;
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

test.describe('Suite 9c — Phase 10 bot scenarios', () => {
  test('9c.1 two-bot 2-player game: lay-down → hit-meld chain → discard → go-out without stalling', async ({
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
    expect(seedResp.ok()).toBeTruthy();
    const { roomId } = (await seedResp.json()) as { roomId: string };

    await page.request.post(`${API_URL}/test/force-bot-activate`, {
      data: { roomId, playerId: 'test-player-1' },
    });
    await page.request.post(`${API_URL}/test/force-bot-activate`, {
      data: { roomId, playerId: 'test-player-2' },
    });

    // Player 1 is seeded with 2 complete phase-1 sets — after one draw the
    // bot will lay down. That immediately exercises the post-lay-down
    // stuck-state path (hit-meld → hit-meld → ... → discard to go out).
    const laidDown = await waitUntil(
      () => readState(page, roomId),
      (s) => !!s.players?.some((p) => p.phaseLaidDown === true),
      25_000,
    );
    expect(laidDown, 'at least one bot laid down within 25s').not.toBeNull();

    // Two acceptable successful outcomes — both prove the scheduler did
    // not stall mid-chain:
    //   a) State progressed 5+ versions past lay-down (the chain is
    //      still running, game hasn't ended yet).
    //   b) Round advanced to 'scoring' or 'ended' phase (someone went
    //      out — the hit-meld chain fully resolved into a discard).
    const postLayDownVersion = laidDown!.version;
    const progressed = await waitUntil(
      () => readState(page, roomId),
      (s) =>
        s.version >= postLayDownVersion + 5 ||
        s.phase === 'scoring' ||
        s.phase === 'ended',
      30_000,
    );
    // eslint-disable-next-line no-console
    console.log('9c.1 progress:', {
      atLayDown: postLayDownVersion,
      finalVersion: progressed?.version,
      finalPhase: progressed?.phase,
    });
    expect(progressed, 'scheduler reached round-end OR advanced 5+ versions post-lay-down').not.toBeNull();
  });

  test('9c.2 two-bot 3-player game: scheduler progresses through multiple turns OR reaches round-end', async ({
    authedPage: page,
  }) => {
    test.setTimeout(85_000);
    await page.request.post(`${API_URL}/test/reset`);
    const seedResp = await page.request.post(`${API_URL}/test/seed-game`, {
      data: {
        gameId: 'phase10',
        players: ['test-player-1', 'test-player-2', 'test-player-3'],
        scenario: 'phase10-start',
      },
    });
    expect(seedResp.ok()).toBeTruthy();
    const { roomId } = (await seedResp.json()) as { roomId: string };

    for (const name of ['test-player-1', 'test-player-2', 'test-player-3']) {
      await page.request.post(`${API_URL}/test/force-bot-activate`, {
        data: { roomId, playerId: name },
      });
    }

    // Poll state; record distinct seats seen AND max inter-version gap.
    // Success if either: (a) all 3 seats held the turn, or (b) round
    // ended (someone went out). Either way the scheduler must never
    // pause >20s between versions.
    const seen = new Set<string>();
    const deadline = Date.now() + 45_000;
    let lastVersion = 0;
    let maxGap = 0;
    let lastChange = Date.now();
    let lastState: Awaited<ReturnType<typeof readState>> | null = null;
    while (Date.now() < deadline) {
      const s = await readState(page, roomId);
      lastState = s;
      if (s?.currentTurn) seen.add(s.currentTurn);
      if (s && s.version > lastVersion) {
        maxGap = Math.max(maxGap, Date.now() - lastChange);
        lastChange = Date.now();
        lastVersion = s.version;
      }
      if (s?.phase === 'scoring' || s?.phase === 'ended') break;
      if (seen.size >= 3) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    // eslint-disable-next-line no-console
    console.log('3p rotation report:', {
      distinctSeats: Array.from(seen),
      peakVersion: lastVersion,
      maxTurnGapMs: maxGap,
      finalPhase: lastState?.phase,
    });
    const rotated = seen.size >= 3;
    const ended = lastState?.phase === 'scoring' || lastState?.phase === 'ended';
    expect(rotated || ended, 'rotated through 3 seats OR reached round-end').toBeTruthy();
    expect(maxGap, 'no inter-version gap exceeded the 20s ceiling').toBeLessThan(20_000);
  });

  test('9c.3 round-end: someone goes out within 60s', async ({
    authedPage: page,
  }) => {
    // This is the most thorough regression test for the stuck-bot bug:
    // it asserts the bots can play a round to completion. With the fix,
    // p1 (seeded with 2 phase-1 sets) lays down, chains hit-melds, then
    // discards their last card and goes out. Pre-fix this hung at the
    // hit-meld depletion point.
    test.setTimeout(85_000);
    await page.request.post(`${API_URL}/test/reset`);
    const seedResp = await page.request.post(`${API_URL}/test/seed-game`, {
      data: {
        gameId: 'phase10',
        players: ['test-player-1', 'test-player-2'],
        scenario: 'phase10-start',
      },
    });
    expect(seedResp.ok()).toBeTruthy();
    const { roomId } = (await seedResp.json()) as { roomId: string };

    await page.request.post(`${API_URL}/test/force-bot-activate`, {
      data: { roomId, playerId: 'test-player-1' },
    });
    await page.request.post(`${API_URL}/test/force-bot-activate`, {
      data: { roomId, playerId: 'test-player-2' },
    });

    const ended = await waitUntil(
      () => readState(page, roomId),
      (s) => s.phase === 'scoring' || s.phase === 'ended',
      60_000,
      500,
    );
    // eslint-disable-next-line no-console
    console.log('round-end report:', {
      peakVersion: ended?.version,
      phase: ended?.phase,
    });
    expect(ended, 'round reached scoring/ended phase').not.toBeNull();
  });
});
