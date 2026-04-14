# Socket Service & Bot Architecture

Date: 2026-04-11
Unit: 6 (Socket Service + Bot Core)
Author: Architect agent

## Key Design Decisions

1. Two Socket.io namespaces: /lobby (presence, DMs, room updates) and /game (gameplay, chat, bots)
2. socketAuth middleware validates JWT on handshake (mirrors API auth.ts)
3. Game lock via `SET game:lock:{roomId} NX EX 5` prevents concurrent mutations
4. Bot activation: Worker publishes to `bot:action:{roomId}` → socket subscriber → BotController.activateBot
5. Bot yield: rejoinRoom handler calls BotController.yieldBot before state sync
6. BotController maintains in-memory cache backed by Redis HASH for fast isBotActive checks
7. Bot think time: random 800-2500ms via setTimeout after setting bot:queue key
8. Bot action execution: chooseAction → fallbackAction → rightmost card discard (triple fallback)
9. 90s disconnect timer for real-time; room's turnTimerSeconds for async games
10. Independent per-player disconnect timers
11. Redis adapter for multi-instance Socket.io scaling (3 Redis connections per instance)

## Full design: See architect agent output in review conversation
