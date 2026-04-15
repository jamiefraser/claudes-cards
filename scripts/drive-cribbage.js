/* eslint-disable no-console */
/**
 * Drive a 2-player cribbage game (1 human + 1 bot) end-to-end and report what
 * happens at each hand boundary. Used to reproduce / verify the "bot stops on
 * hand 3" bug.
 *
 * Usage:
 *   API=http://localhost:3001 SOCK=http://localhost:3002 \
 *     node scripts/drive-cribbage.js [hands]
 */
const { io } = require('socket.io-client');

const API = process.env.API || 'http://localhost:3001';
const SOCK = process.env.SOCK || 'http://localhost:3002';
const HANDS = parseInt(process.argv[2] || '4', 10);

function ts() { return new Date().toISOString().slice(11, 23); }
function log(...a) { console.log(ts(), ...a); }

async function devToken(username) {
  const res = await fetch(`${API}/api/v1/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(`devToken ${res.status}: ${await res.text()}`);
  return res.json();
}

async function createRoom(token) {
  const res = await fetch(`${API}/api/v1/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'crib-drive', gameId: 'cribbage', settings: { isAsync: false, maxPlayers: 2 } }),
  });
  if (!res.ok) throw new Error(`createRoom ${res.status}: ${await res.text()}`);
  return res.json();
}

function rankValue(rank) {
  if (rank === 'A') return 1;
  if (['J','Q','K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

async function main() {
  log('=== Cribbage drive starting ===', { hands: HANDS });
  const meTok = await devToken('test-player-1');
  log('Got token for', meTok.username, 'playerId=', meTok.playerId);
  const myPlayerId = meTok.playerId;

  const room = await createRoom(meTok.token);
  log('Created room', room.id);

  const sock = io(`${SOCK}/game`, { auth: { token: meTok.token }, transports: ['websocket'] });
  await new Promise((res, rej) => {
    sock.on('connect', res);
    sock.on('connect_error', rej);
  });
  log('Socket connected');

  let state = null;
  let lastVersion = -1;
  let myDiscardingFor = -1; // version we last sent a discard for

  const phaseLog = new Map(); // version → phase

  sock.on('game_state_sync', (p) => {
    state = p.state;
    if (state) phaseLog.set(state.version, state.publicData?.gamePhase);
  });
  sock.on('game_state_delta', (p) => {
    const d = p.delta;
    if (!state) return;
    state.version = d.version;
    if (d.currentTurn !== undefined) state.currentTurn = d.currentTurn;
    if (d.publicData) state.publicData = d.publicData;
    if (d.playerUpdates) {
      state.players = state.players.map(pl => {
        const u = d.playerUpdates[pl.playerId];
        return u ? { ...pl, ...u } : pl;
      });
    }
    phaseLog.set(state.version, state.publicData?.gamePhase);
  });
  sock.on('game_error', (e) => log('!! game_error', e));
  sock.on('bot_activated', (p) => log('bot_activated', p));

  sock.emit('join_room', { roomId: room.id });
  await new Promise(r => setTimeout(r, 300));

  log('Starting game (1 bot)…');
  sock.emit('start_game', { roomId: room.id, botCount: 1 });

  // Wait for state to land
  for (let i = 0; i < 50 && !state; i++) await new Promise(r => setTimeout(r, 100));
  if (!state) throw new Error('No state after start_game');
  log('Game started, version', state.version, 'phase', state.publicData?.gamePhase);

  let handsCompleted = 0;
  let lastReportedVersion = -1;
  const start = Date.now();

  while (handsCompleted < HANDS && Date.now() - start < 120_000) {
    await new Promise(r => setTimeout(r, 250));
    if (!state) continue;
    const myId = myPlayerId;
    const me2 = state.players.find(p => p.playerId === myId);
    if (state.version !== lastReportedVersion) {
      log(`v${state.version} phase=${state.publicData?.gamePhase} currentTurn=${state.currentTurn?.slice(0,12)} myHand=${me2?.hand?.length} dealerIdx=${state.publicData?.dealerIndex}`);
      lastReportedVersion = state.version;
    }

    const phase = state.publicData?.gamePhase;

    // Discard
    if (phase === 'discarding') {
      const discarded = state.publicData?.discardedCount?.[myId] ?? 0;
      const owe = (state.players.length === 2 ? 2 : 1) - discarded;
      if (owe > 0 && me2?.hand?.length >= owe && state.version !== myDiscardingFor) {
        const cards = me2.hand.slice(0, owe).map(c => c.id);
        log(`-> discard-crib`, cards);
        sock.emit('game_action', { roomId: room.id, action: { type: 'discard-crib', cardIds: cards } });
        myDiscardingFor = state.version;
      }
    }

    // Pegging
    if (phase === 'pegging' && state.currentTurn === myId) {
      const pegCount = state.publicData?.pegCount ?? 0;
      const playable = me2.hand.filter(c => pegCount + rankValue(c.rank) <= 31);
      if (playable.length > 0) {
        log(`-> play`, playable[0].id, `(pegCount ${pegCount}+${rankValue(playable[0].rank)})`);
        sock.emit('game_action', { roomId: room.id, action: { type: 'play', cardIds: [playable[0].id] } });
      } else {
        log('-> go');
        sock.emit('game_action', { roomId: room.id, action: { type: 'go' } });
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // Counting acks
    if (phase === 'counting') {
      const ccp = state.publicData?.currentCountPlayerId;
      const dealerIdx = state.publicData?.dealerIndex;
      const dealerId = state.players[dealerIdx]?.playerId;
      const step = state.publicData?.countingStep;
      const canAck = step === 'crib' ? (myId === dealerId) : (myId === ccp);
      if (canAck) {
        log(`-> ack-count (step=${step}, currentCounter=${ccp?.slice(0,12)})`);
        sock.emit('game_action', { roomId: room.id, action: { type: 'ack-count' } });
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Detect new hand: phase went to 'discarding' AND scoringHands was previously set (counting ended)
    if (phase === 'discarding' && state.version > 1) {
      // Heuristic: discardedCount[me]==0 means new hand
      const dc = state.publicData?.discardedCount?.[myId] ?? 0;
      if (dc === 0 && lastVersion !== -1 && state.version > lastVersion + 2) {
        if (handsCompleted * 1 + 1 < state.version / 5) {
          // approximate; we instead use a counter incremented on phase reset
        }
      }
    }
    lastVersion = state.version;

    if (phase === 'ended') {
      log('Game ended at version', state.version);
      break;
    }
  }

  // Count hand transitions by phaseLog
  let transitions = 0;
  let prev = null;
  for (const v of [...phaseLog.keys()].sort((a,b)=>a-b)) {
    const p = phaseLog.get(v);
    if (prev === 'counting' && p === 'discarding') transitions++;
    prev = p;
  }
  log(`=== Done. Hand transitions observed: ${transitions} ===`);
  log('Final state version', state?.version, 'phase', state?.publicData?.gamePhase);
  sock.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
