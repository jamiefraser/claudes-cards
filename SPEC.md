# Card Platform — Product Specification v2.2
# + Agent Orchestration Playbook

**Document status:** First Draft — v2.2  
**Audience:** Engineers, QA, AI Agents, Product  
**Last updated:** 2026-04-11  
**Supersedes:** v2.1

### Change Log from v2.1
| Section | Change |
|---|---|
| §8 | AI Bot system fully specified — bots fill seats on timer expiry, yield back to returning humans |
| §11/Story 2.3 | Legal review checkpoint added to agent workflow for Phase 10 art before merging to main |
| §17/Story 8.4 | Cribbage board fully specified — continuous three-lane SVG track, 121 holes, groups of 5, skunk/double-skunk lines, animated pegs |
| §18 | Game replay specified — `game_actions` append-only table added to schema from day one |
| §19 | Admin/moderator UI fully specified — in scope for launch |
| §20 | VAPID key provisioning fully specified — automated in deployment script |
| §21 | Sound assets fully specified — Freesound CC0 sources catalogued, attribution system defined |
| All Epics | Open questions removed; replaced with resolved decisions |

---

## Table of Contents

### Part A — Product Specification
1. [Document Conventions](#1-document-conventions)
2. [Platform Overview](#2-platform-overview)
3. [Technology Stack](#3-technology-stack)
4. [Monorepo Directory Structure](#4-monorepo-directory-structure)
5. [Redis Key Schema](#5-redis-key-schema)
6. [React Route Map](#6-react-route-map)
7. [Zustand Store Shapes](#7-zustand-store-shapes)
8. [Auth Strategy — Dev vs Production](#8-auth-strategy)
9. [AI Bot System](#9-ai-bot-system)
10. [Sound Asset Catalogue](#10-sound-asset-catalogue)
11. [TypeScript Interface Library](#11-typescript-interface-library)
12. [Epic 1 — Auth & Identity](#12-epic-1--auth--identity)
13. [Epic 2 — cards.js Fork & Phase 10 Deck](#13-epic-2--cardsjs-fork--phase-10-deck)
14. [Epic 3 — Lobby Experience](#14-epic-3--lobby-experience)
15. [Epic 4 — Game Table](#15-epic-4--game-table)
16. [Epic 5 — Chat & Messaging](#16-epic-5--chat--messaging)
17. [Epic 6 — Friends & Social Graph](#17-epic-6--friends--social-graph)
18. [Epic 7 — Leaderboards](#18-epic-7--leaderboards)
19. [Epic 8 — Game Catalog & Engines](#19-epic-8--game-catalog--engines)
20. [Epic 9 — Connection Resilience & Async Play](#20-epic-9--connection-resilience--async-play)
21. [Epic 10 — Infrastructure & DevOps](#21-epic-10--infrastructure--devops)
22. [Epic 11 — Admin & Moderation UI](#22-epic-11--admin--moderation-ui)
23. [Epic 12 — Accessibility & i18n](#23-epic-12--accessibility--i18n)
24. [WebSocket Event Reference](#24-websocket-event-reference)
25. [REST API Reference](#25-rest-api-reference)
26. [TDD & Playwright Strategy](#26-tdd--playwright-strategy)

### Part B — Agent Orchestration Playbook
27. [Agent Role Definitions](#27-agent-role-definitions)
28. [Master Orchestrator Prompt](#28-master-orchestrator-prompt)
29. [Sub-Agent Prompt Library](#29-sub-agent-prompt-library)
30. [Implementation Sequence & Work Units](#30-implementation-sequence--work-units)

---

# PART A — PRODUCT SPECIFICATION

---

## 1. Document Conventions

### 1.1 Personas

| Persona | Description |
|---|---|
| `Guest` | Unauthenticated visitor |
| `Player` | Authenticated human user |
| `Bot` | AI-controlled player filling a vacant or timed-out seat |
| `Host` | Player who created a room |
| `Spectator` | Host-approved viewer |
| `Moderator` | Platform moderator |
| `Admin` | Full platform administrator |
| `Developer` | Engineer or AI agent building the platform |

### 1.2 Story Format
> **As a** `[persona]`, **I want** `[capability]` **so that** `[benefit]`.

### 1.3 Acceptance Criteria Format
Given/When/Then (Gherkin-style). Every story needs at least one passing Playwright test before merge.

### 1.4 Priority Tiers

| Tier | Meaning |
|---|---|
| **P0** | Launch blocker |
| **P1** | Launch target |
| **P2** | Post-launch v1.1 |

---

## 2. Platform Overview

### 2.1 Vision
A modern browser-based multiplayer card game platform for up to six simultaneous players per table, hosting standard 52-card deck games and Phase 10 games with an original purpose-built deck. All games share a unified lobby, social graph, leaderboard, real-time chat, and AI bot infrastructure.

### 2.2 Launch Game Catalog

**Priority 1 — Rummy Family**
- Phase 10 *(Phase 10 deck, 2–6 players, async supported)*
- Rummy *(standard, 2–6 players, async supported)*
- Gin Rummy *(standard, 2–4 players, async supported)*
- Canasta *(standard, 4 players, async supported)*

**Priority 2 — Cribbage**
- Cribbage *(standard, 2–4 players, async supported, visual board required)*

**Priority 3 — Trick-Taking**
- Spades, Hearts, Euchre, Whist *(standard, 4 players)*
- Oh Hell! *(standard, 3–6 players)*

**Priority 4 — Other**
- Go Fish, Crazy Eights *(async supported)*
- War, Spit/Speed, Idiot/Shithead *(real-time only)*

### 2.3 Non-Functional Requirements

| Requirement | Target |
|---|---|
| Lobby FCP | < 1.5 s on 10 Mbps |
| Game action round-trip (p99) | < 200 ms |
| Reconnect + full state sync | < 10 s |
| Leaderboard update after game end | < 5 s for connected clients |
| Lighthouse performance (lobby) | ≥ 85 |
| Unit test coverage — frontend | ≥ 80% line |
| Unit test coverage — backend | ≥ 85% line |
| Bot takeover latency after human timeout | < 2 s |
| Bot action think time | 800 ms–2500 ms (randomised, feels human) |

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, TypeScript strict |
| UI Components | shadcn/ui + Tailwind CSS v3 |
| Card Rendering | `packages/cards-engine` (cards.js fork) |
| Client State | Zustand v4 + React Query v5 |
| Auth (Dev) | Local JWT issuer (`jsonwebtoken` HS256) |
| Auth (Production) | AAD-B2C + MSAL Browser/React |
| Real-time | `socket.io-client` v4 |
| Backend Runtime | Node.js 20 LTS |
| REST API | Express 4 + TypeScript |
| Socket Server | Express + `socket.io` v4 + TypeScript |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Redis 7 |
| ORM | Prisma 5 |
| Background Jobs | BullMQ |
| Bot AI | Rule-based engine per game (no external ML) |
| Sound | Web Audio API + Howler.js |
| Containers | Docker (multi-stage, Alpine) |
| Orchestration | Kubernetes (provider-agnostic) |
| Unit Tests | Vitest (frontend), Jest (backend) |
| E2E Tests | Playwright v1.44+ |
| CI/CD | GitHub Actions |

---

## 4. Monorepo Directory Structure

Agents must write files to exactly these locations.

```
card-platform/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── e2e.yml
├── .claude/
│   └── agents/
│       ├── orchestrator.md
│       ├── architect.md
│       ├── implementer.md
│       ├── reviewer.md
│       ├── tester.md
│       └── devops.md
├── CLAUDE.md
├── SPEC.md                             ← this document
├── docker-compose.yml
├── docker-compose.test.yml
├── .env.example
│
├── packages/
│   ├── shared-types/
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── bot.ts
│   │   │   ├── cards.ts
│   │   │   ├── chat.ts
│   │   │   ├── friends.ts
│   │   │   ├── gameEngine.ts
│   │   │   ├── gameState.ts
│   │   │   ├── leaderboard.ts
│   │   │   ├── rooms.ts
│   │   │   ├── socket.ts
│   │   │   ├── sound.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cards-engine/
│       ├── src/
│       │   ├── Card.ts
│       │   ├── Hand.ts
│       │   ├── Pile.ts
│       │   ├── AnimationEngine.ts
│       │   ├── deckTypes/
│       │   │   ├── standard.ts
│       │   │   └── phase10.ts
│       │   ├── renderers/
│       │   │   └── svgRenderer.ts
│       │   └── index.ts
│       ├── svg/
│       │   ├── standard/
│       │   └── phase10/
│       │       ├── red-1.svg … red-12.svg
│       │       ├── blue-1.svg … blue-12.svg
│       │       ├── green-1.svg … green-12.svg
│       │       ├── yellow-1.svg … yellow-12.svg
│       │       ├── wild-1.svg … wild-8.svg
│       │       ├── skip-1.svg … skip-4.svg
│       │       └── back.svg
│       ├── __tests__/
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── auth/
│   │   │   │   ├── AuthProvider.tsx
│   │   │   │   ├── DevAuthProvider.tsx
│   │   │   │   ├── MsalAuthProvider.tsx
│   │   │   │   ├── useAuth.ts
│   │   │   │   └── tokenInterceptor.ts
│   │   │   ├── components/
│   │   │   │   ├── cards/
│   │   │   │   │   ├── CardComponent.tsx
│   │   │   │   │   ├── HandComponent.tsx
│   │   │   │   │   └── PileComponent.tsx
│   │   │   │   ├── lobby/
│   │   │   │   │   ├── GameBrowser.tsx
│   │   │   │   │   ├── GameCard.tsx
│   │   │   │   │   ├── RoomBrowserModal.tsx
│   │   │   │   │   ├── CreateRoomModal.tsx
│   │   │   │   │   └── FilterSidebar.tsx
│   │   │   │   ├── table/
│   │   │   │   │   ├── GameTable.tsx
│   │   │   │   │   ├── PlayerSeat.tsx
│   │   │   │   │   ├── BotSeat.tsx
│   │   │   │   │   ├── ActionBar.tsx
│   │   │   │   │   ├── GameSettingsPanel.tsx
│   │   │   │   │   └── cribbage/
│   │   │   │   │       ├── CribbageBoard.tsx
│   │   │   │   │       └── CribbagePeg.tsx
│   │   │   │   ├── chat/
│   │   │   │   │   ├── TableChat.tsx
│   │   │   │   │   ├── DMDrawer.tsx
│   │   │   │   │   └── MessageBubble.tsx
│   │   │   │   ├── social/
│   │   │   │   │   ├── FriendList.tsx
│   │   │   │   │   ├── FriendEntry.tsx
│   │   │   │   │   └── PlayerSearch.tsx
│   │   │   │   ├── leaderboard/
│   │   │   │   │   └── LeaderboardTable.tsx
│   │   │   │   ├── admin/
│   │   │   │   │   ├── AdminLayout.tsx
│   │   │   │   │   ├── ReportsQueue.tsx
│   │   │   │   │   ├── MuteUserPanel.tsx
│   │   │   │   │   ├── GameCatalogManager.tsx
│   │   │   │   │   └── LeaderboardManager.tsx
│   │   │   │   └── shared/
│   │   │   │       ├── Avatar.tsx
│   │   │   │       ├── Toast.tsx
│   │   │   │       ├── Modal.tsx
│   │   │   │       └── StatusDot.tsx
│   │   │   ├── pages/
│   │   │   │   ├── LandingPage.tsx
│   │   │   │   ├── LobbyPage.tsx
│   │   │   │   ├── TablePage.tsx
│   │   │   │   ├── LeaderboardPage.tsx
│   │   │   │   ├── AdminPage.tsx
│   │   │   │   ├── SettingsPage.tsx
│   │   │   │   └── NotFoundPage.tsx
│   │   │   ├── store/
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── gameStore.ts
│   │   │   │   ├── lobbyStore.ts
│   │   │   │   └── index.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useSocket.ts
│   │   │   │   ├── useGameState.ts
│   │   │   │   ├── usePresence.ts
│   │   │   │   ├── useRooms.ts
│   │   │   │   └── useSound.ts
│   │   │   ├── api/
│   │   │   │   ├── client.ts
│   │   │   │   ├── auth.api.ts
│   │   │   │   ├── rooms.api.ts
│   │   │   │   ├── friends.api.ts
│   │   │   │   ├── leaderboard.api.ts
│   │   │   │   ├── messages.api.ts
│   │   │   │   └── admin.api.ts
│   │   │   ├── sound/
│   │   │   │   ├── SoundManager.ts
│   │   │   │   └── assets/              ← CC0 audio files
│   │   │   │       ├── card-deal.mp3
│   │   │   │       ├── card-flip.mp3
│   │   │   │       ├── card-discard.mp3
│   │   │   │       ├── card-draw.mp3
│   │   │   │       ├── card-shuffle.mp3
│   │   │   │       ├── phase-complete.mp3
│   │   │   │       ├── round-win.mp3
│   │   │   │       ├── game-win.mp3
│   │   │   │       ├── game-lose.mp3
│   │   │   │       ├── skip-played.mp3
│   │   │   │       ├── notification.mp3
│   │   │   │       └── peg-move.mp3      ← Cribbage only
│   │   │   ├── i18n/
│   │   │   │   └── en.json
│   │   │   └── styles/
│   │   │       └── tokens.css
│   │   ├── __tests__/
│   │   ├── e2e/
│   │   │   ├── fixtures/
│   │   │   │   └── auth.fixture.ts
│   │   │   ├── suite1-auth.spec.ts
│   │   │   ├── suite2-lobby.spec.ts
│   │   │   ├── suite3-phase10.spec.ts
│   │   │   ├── suite4-reconnect.spec.ts
│   │   │   ├── suite5-chat.spec.ts
│   │   │   ├── suite6-spectator.spec.ts
│   │   │   ├── suite7-friends.spec.ts
│   │   │   ├── suite8-leaderboard.spec.ts
│   │   │   └── suite9-bot.spec.ts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   │
│   ├── api-service/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── requireRole.ts
│   │   │   │   └── errorHandler.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── players.routes.ts
│   │   │   │   ├── friends.routes.ts
│   │   │   │   ├── rooms.routes.ts
│   │   │   │   ├── games.routes.ts
│   │   │   │   ├── leaderboard.routes.ts
│   │   │   │   ├── messages.routes.ts
│   │   │   │   ├── admin.routes.ts
│   │   │   │   ├── health.routes.ts
│   │   │   │   ├── dev.routes.ts           ← AUTH_MODE=dev only
│   │   │   │   └── test.routes.ts          ← TEST_MODE=true only
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── rooms.service.ts
│   │   │   │   ├── friends.service.ts
│   │   │   │   ├── leaderboard.service.ts
│   │   │   │   ├── messages.service.ts
│   │   │   │   └── admin.service.ts
│   │   │   ├── db/
│   │   │   │   └── prisma.ts
│   │   │   └── redis/
│   │   │       └── client.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── socket-service/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── middleware/
│   │   │   │   └── socketAuth.ts
│   │   │   ├── namespaces/
│   │   │   │   ├── lobby.namespace.ts
│   │   │   │   └── game.namespace.ts
│   │   │   ├── handlers/
│   │   │   │   ├── joinRoom.ts
│   │   │   │   ├── rejoinRoom.ts
│   │   │   │   ├── gameAction.ts
│   │   │   │   ├── tableChat.ts
│   │   │   │   └── presence.ts
│   │   │   ├── bots/
│   │   │   │   ├── BotController.ts        ← Manages all active bots
│   │   │   │   ├── BotPlayer.ts            ← Bot action scheduler
│   │   │   │   └── strategies/
│   │   │   │       ├── phase10.strategy.ts
│   │   │   │       ├── rummy.strategy.ts
│   │   │   │       ├── ginrummy.strategy.ts
│   │   │   │       ├── cribbage.strategy.ts
│   │   │   │       └── generic.strategy.ts
│   │   │   ├── pubsub/
│   │   │   │   └── subscriber.ts
│   │   │   └── games/
│   │   │       ├── registry.ts
│   │   │       ├── phase10/
│   │   │       │   └── engine.ts
│   │   │       ├── rummy/
│   │   │       │   └── engine.ts
│   │   │       ├── ginrummy/
│   │   │       │   └── engine.ts
│   │   │       ├── canasta/
│   │   │       │   └── engine.ts
│   │   │       ├── cribbage/
│   │   │       │   └── engine.ts
│   │   │       └── …(remaining engines)
│   │   ├── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   └── worker-service/
│       ├── src/
│       │   ├── index.ts
│       │   ├── queues/
│       │   │   ├── leaderboard.queue.ts
│       │   │   ├── turnTimer.queue.ts
│       │   │   └── vapid.queue.ts          ← Web Push notification queue
│       │   ├── processors/
│       │   │   ├── leaderboard.processor.ts
│       │   │   ├── turnTimer.processor.ts
│       │   │   └── vapid.processor.ts
│       │   └── redis/
│       │       └── client.ts
│       ├── __tests__/
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
│
├── k8s/
│   ├── namespace.yaml
│   ├── frontend/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── hpa.yaml
│   ├── api/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── hpa.yaml
│   ├── socket/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── hpa.yaml
│   ├── worker/
│   │   ├── deployment.yaml
│   │   └── hpa.yaml
│   ├── ingress.yaml
│   ├── secrets.example.yaml
│   └── cert-manager.yaml
│
├── scripts/
│   ├── generate-vapid.sh               ← VAPID key generation (run once per env)
│   └── deploy.sh                       ← Full deploy: VAPID + k8s apply
│
├── package.json
├── turbo.json
└── tsconfig.base.json
```

### 4.1 Import Aliases

```typescript
'@shared/*'  → 'packages/shared-types/src/*'
'@cards/*'   → 'packages/cards-engine/src/*'
'@/*'        → 'src/*'  (within each app)
```

### 4.2 Naming Conventions

| Artifact | Convention | Example |
|---|---|---|
| React components | PascalCase `.tsx` | `CribbageBoard.tsx` |
| React hooks | `use*.ts` | `useSound.ts` |
| Services | `*.service.ts` | `admin.service.ts` |
| Route files | `*.routes.ts` | `admin.routes.ts` |
| Test files | `*.test.ts(x)` | `phase10Engine.test.ts` |
| Bot strategies | `*.strategy.ts` | `phase10.strategy.ts` |
| Sound assets | `kebab-case.mp3` | `card-deal.mp3` |
| Redis keys | `snake:case:hierarchy` | `presence:player:abc123` |
| Socket events | `snake_case` | `game_state_sync` |
| ENV variables | `SCREAMING_SNAKE_CASE` | `VAPID_PUBLIC_KEY` |

---

## 5. Redis Key Schema

```
# Presence
presence:player:{playerId}              STRING  "online"|"in-game"|"away"    TTL: 30s
presence:room:{playerId}                STRING  roomId                         TTL: 30s

# Game State (hot copy)
game:state:{roomId}                     STRING  JSON GameState                 TTL: none
game:lock:{roomId}                      STRING  serverId                       TTL: 5s
game:actions:{roomId}                   LIST    JSON GameAction append-only    TTL: none

# Bot state
bot:active:{roomId}                     HASH    { playerId → botInstanceId }   TTL: none
bot:queue:{roomId}:{playerId}           STRING  "pending"                      TTL: BOT_ACTION_MS

# Room membership
room:players:{roomId}                   SET     playerIds
room:spectators:{roomId}                SET     playerIds

# Chat history
chat:history:{roomId}                   LIST    last 100 ChatMessage (LPUSH + LTRIM)

# DM unread
dm:unread:{toPlayerId}:{fromPlayerId}   STRING  integer count

# Pub-Sub channels (publish only)
leaderboard:updated:{gameId}            CHANNEL
room:event:{roomId}                     CHANNEL
bot:action:{roomId}                     CHANNEL

# Replay
replay:actions:{roomId}                 LIST    all actions ever, no LTRIM
```

---

## 6. React Route Map

| Path | Component | Auth | Role | Notes |
|---|---|---|---|---|
| `/` | `LandingPage` | No | any | Redirects to `/lobby` if authenticated |
| `/lobby` | `LobbyPage` | Yes | any | |
| `/table/:roomId` | `TablePage` | Yes | any | |
| `/leaderboard` | `LeaderboardPage` | Yes | any | |
| `/settings` | `SettingsPage` | Yes | any | |
| `/admin` | `AdminPage` | Yes | moderator+ | |
| `/admin/reports` | `AdminPage` (tab) | Yes | moderator+ | |
| `/admin/users` | `AdminPage` (tab) | Yes | moderator+ | |
| `/admin/games` | `AdminPage` (tab) | Yes | admin | |
| `/admin/leaderboards` | `AdminPage` (tab) | Yes | admin | |
| `*` | `NotFoundPage` | No | any | |

---

## 7. Zustand Store Shapes

```typescript
// store/authStore.ts
interface AuthState {
  player: PlayerProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setPlayer: (player: PlayerProfile, token: string) => void;
  clearAuth: () => void;
  refreshToken: () => Promise<void>;
}

// store/gameStore.ts
interface GameStoreState {
  room: Room | null;
  gameState: GameState | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  phase: GamePhase;
  selectedCardIds: string[];
  chatMessages: ChatMessage[];
  animationLocked: boolean;
  activeBots: BotSeatInfo[];       // Which seats are currently bot-controlled
  soundEnabled: boolean;
  animationSpeed: 'fast' | 'normal' | 'slow';
  colorBlindMode: boolean;

  setRoom: (room: Room) => void;
  applySync: (state: GameState) => void;
  applyDelta: (delta: GameStateDelta) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  setConnectionStatus: (s: 'connected' | 'reconnecting' | 'disconnected') => void;
  addChatMessage: (msg: ChatMessage) => void;
  lockAnimation: () => void;
  unlockAnimation: () => void;
  setBotActive: (playerId: string, active: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setAnimationSpeed: (s: 'fast' | 'normal' | 'slow') => void;
  setColorBlindMode: (v: boolean) => void;
}

// store/lobbyStore.ts
interface LobbyStoreState {
  rooms: Room[];
  totalRooms: number;
  filters: RoomListQuery;
  friends: FriendEntry[];
  pendingRequests: FriendRequest[];
  notificationCount: number;
  dmInbox: DMInboxEntry[];
  openDMThreads: string[];

  setRooms: (rooms: Room[], total: number) => void;
  upsertRoom: (room: Room) => void;
  removeRoom: (roomId: string) => void;
  setFilters: (filters: Partial<RoomListQuery>) => void;
  setFriends: (friends: FriendEntry[]) => void;
  updateFriendStatus: (playerId: string, status: OnlineStatus) => void;
  addPendingRequest: (req: FriendRequest) => void;
  incrementNotifications: () => void;
  clearNotifications: () => void;
  openDM: (playerId: string) => void;
  closeDM: (playerId: string) => void;
}
```

---

## 8. Auth Strategy — Dev vs Production

*(Full content from v2.1 §8 retained. Summary: `AUTH_MODE=dev` uses local JWT issuer; `AUTH_MODE=production` uses AAD-B2C MSAL. The `useAuth()` interface is identical in both modes. B2C setup is a human operator task documented in the production checklist.)*

The five test users seeded in dev:

```typescript
const TEST_USERS = [
  { username: 'test-player-1', role: 'player',    displayName: 'TestPlayer1' },
  { username: 'test-player-2', role: 'player',    displayName: 'TestPlayer2' },
  { username: 'test-player-3', role: 'player',    displayName: 'TestPlayer3' },
  { username: 'test-moderator', role: 'moderator', displayName: 'TestMod' },
  { username: 'test-admin',     role: 'admin',     displayName: 'TestAdmin' },
];
```

Playwright auth fixture calls `POST /api/v1/dev/token` directly, injects token into `sessionStorage` — no UI login flow needed in tests.

---

## 9. AI Bot System

### 9.1 Philosophy

Bots exist to keep games moving, not to replace social play. They are always clearly labelled as bots in the UI. When a human player returns to a seat a bot is holding, the bot immediately yields and the human resumes.

### 9.2 Bot Lifecycle

```
Human player connects → human plays normally
Human player disconnects → 90-second reconnect window
If human reconnects within 90s → bot never activates
If 90s expires with no reconnect → BotController.activateBot(roomId, seatIndex)
  Bot plays the seat
  If human reconnects at any time → BotController.yieldBot(roomId, seatIndex)
    Human resumes from current game state
    Bot is deactivated for that seat
If game ends while bot is active → bot seat is credited with bot result (not added to leaderboard)
```

### 9.3 Bot Activation Rules

```typescript
interface BotActivationPolicy {
  // Always true — bots activate when async timer expires
  activateOnTimerExpiry: true;

  // Seats that bots may fill
  eligibleSeats: 'any-disconnected-human-seat';

  // Human reclaim — always true
  humanCanReclaimAtAnyTime: true;

  // Leaderboard — bots never affect leaderboards
  botResultsExcludedFromLeaderboard: true;

  // Chat — bots never send chat messages
  botsAreSilent: true;

  // Identification — always visible in UI
  botLabelVisibleToAllParticipants: true;

  // Think time (ms) — randomised per action to feel human
  thinkTimeMin: 800;
  thinkTimeMax: 2500;

  // Hard ceiling — a bot MUST play within 20s of being scheduled. The
  // primary path (BullMQ delayed job → pub/sub → BotPlayer) delivers
  // within ~3s; BotSweeper re-fires stuck turns within `staleMs +
  // intervalMs` (currently 3s + 2s = 5s) if the pub/sub message is
  // dropped. A strategy that can't produce a legal action must fall
  // back (never 'pass' mid-turn), because 'pass' clears the schedule
  // keys and will loop the sweeper forever otherwise.
  maxPlayLatencyMs: 20_000;
}
```

### 9.4 Bot Strategy Interface

Each game engine that `supportsAsync: true` must also provide a corresponding bot strategy:

```typescript
// packages/shared-types/src/bot.ts

export interface IBotStrategy {
  readonly gameId: string;

  /**
   * Given the current game state and the bot's playerId,
   * return the action the bot should take on its turn.
   * Strategy must return a valid PlayerAction — invalid actions
   * are not retried; they throw and activate the fallback.
   */
  chooseAction(state: GameState, botPlayerId: string): PlayerAction;

  /**
   * Fallback: if chooseAction throws or returns invalid,
   * the bot draws and discards the highest-point card it can legally discard.
   */
  fallbackAction(state: GameState, botPlayerId: string): PlayerAction;
}
```

### 9.5 Bot Strategy — Phase 10 (reference implementation)

The Phase 10 bot uses a priority-ordered rule set on its turn:

1. **Play a skip (if one is in hand and a valid target exists)** — target the opponent holding the most cards
2. **If the bot can lay down its current phase this turn** — lay it down
3. **If the phase is already laid** — hit the highest-value non-wild card onto any laid meld (including opponents'); if no non-wild hit fits, allow hitting with a wild so the bot sheds it instead of hoarding
4. **Draw**: prefer the discard pile top card if it advances the current phase; otherwise draw from the deck
5. **Discard** — must always produce a legal discard when the hand is non-empty. Preference: skip (if no play-skip target) → highest-value non-phase number → lowest-value phase number → wild (last resort only)

**Rule hooks that apply regardless of strategy:**

- **Skip card on the discard pile** — whether placed there via `play-skip` (targeting a specific player) or by a bare `discard` of a skip, the next-in-rotation non-out player loses their turn. In a 2-player game, this means the discarder plays the next turn.
- **Cross-player melds** — once a player has laid down, they may add cards to *any* laid-down meld (their own or an opponent's), not just their own.
- **Never return `pass` mid-turn.** If the strategy can find no legal action, fall back through `fallbackAction` → rightmost discard. `pass` is reserved for "it isn't my turn" signals (e.g. cribbage parallel-discard already complete); using it during your own turn will strand the schedule keys and hang the bot.

### 9.6 Bot UI Representation

A bot-controlled seat renders `BotSeat.tsx` instead of `PlayerSeat.tsx`:

- Avatar replaced with a robot icon (SVG, original design — circuit-board face motif)
- Display name shown as `{OriginalPlayerName} (Bot)`
- A purple `BOT` badge replaces the turn indicator colour
- A tooltip on hover: "Bot is playing for {OriginalPlayerName} — they may return at any time"
- Bot actions animate exactly as human actions (same AnimationEngine calls)
- When human reclaims: the `BOT` badge animates out, the player avatar animates in, a system message fires: "{PlayerName} has returned and taken back their seat"

### 9.7 BotController

```typescript
// socket-service/src/bots/BotController.ts

class BotController {
  // Called by socket-service when disconnect timer expires
  async activateBot(roomId: string, playerId: string): Promise<void>;

  // Called by socket-service on rejoin_room
  async yieldBot(roomId: string, playerId: string): Promise<void>;

  // Called on each game_state_delta where it is a bot's turn
  async scheduleAction(roomId: string, botPlayerId: string): Promise<void>;

  // Cleans up all bots when game ends
  async deactivateAll(roomId: string): Promise<void>;

  // Returns true if the given seatIndex is currently bot-controlled
  isBotActive(roomId: string, playerId: string): boolean;
}
```

### 9.8 Bot Acceptance Criteria

```gherkin
Given a game is in progress and Player 2 disconnects
When 90 seconds pass without Player 2 reconnecting
Then BotController.activateBot is called for Player 2's seat
  And a system message appears: "Bot has taken Player 2's seat and will play until they return"
  And Player 2's seat now shows the BotSeat component with the BOT badge
  And the bot draws and plays within 800–2500ms of its turn starting

Given a bot is playing Player 2's seat
When Player 2 reconnects (sends rejoin_room)
Then BotController.yieldBot is called immediately (before the bot's next scheduled action)
  And the seat transitions from BotSeat to PlayerSeat
  And a system message: "Player 2 has returned and taken back their seat"
  And Player 2 receives a full game_state_sync and may act on their next turn

Given a bot wins a round (goes out first)
When the round ends
Then the round result is recorded normally for game continuation
  And the bot's result is NOT added to any leaderboard entry

Given a bot draws and chooseAction throws an InvalidActionError
When the error is caught
Then fallbackAction is called
  And if fallbackAction also fails, the bot discards the rightmost card in hand
  And an error is logged but the game continues

Given AUTH_MODE=dev and TEST_MODE=true
When POST /api/v1/test/force-bot-activate { roomId, playerId } is called
Then the bot activates immediately (bypass the 90-second timer)
  And this is used by Playwright Suite 9 — Bot Tests
```

---

## 10. Sound Asset Catalogue

### 10.1 Sources

All sounds are CC0 (public domain) or royalty-free no-attribution-required. Attribution is tracked here for credit and linking, even when not legally required, as a matter of respect for creators.

| File | Description | Source | Creator | URL | License |
|---|---|---|---|---|---|
| `card-deal.mp3` | Single card dealt to a position | Freesound | Cultureshock007 | https://freesound.org/s/719539/ | CC0 |
| `card-flip.mp3` | Card flipped face-up | Freesound | f4ngy | https://freesound.org/s/240776/ | CC BY 3.0 |
| `card-discard.mp3` | Card placed on discard pile | Freesound | Cultureshock007 | https://freesound.org/s/719539/ | CC0 |
| `card-draw.mp3` | Card drawn from draw pile | Freesound | Cultureshock007 | https://freesound.org/s/719539/ | CC0 |
| `card-shuffle.mp3` | Deck shuffle at round start | Freesound | diammati | https://freesound.org/s/534981/ | CC BY 3.0 |
| `phase-complete.mp3` | Phase laid down (Phase 10) | Generated | Synthesised tone — no attribution | — | CC0 |
| `round-win.mp3` | Round won | Freesound | Audeption | https://freesound.org/s/564920/ | CC0 |
| `game-win.mp3` | Game won (full victory) | Freesound | Audeption | https://freesound.org/s/564920/ | CC0 |
| `game-lose.mp3` | Game lost | Freesound | jhillam | https://freesound.org/s/431894/ | CC0 |
| `skip-played.mp3` | Skip card played | Generated | Synthesised — swoosh tone | — | CC0 |
| `notification.mp3` | DM / friend request / spectator alert | Pixabay | royalty-free | https://pixabay.com/sound-effects/ | Royalty-free |
| `peg-move.mp3` | Cribbage peg advancing on board | Generated | Synthesised click tone | — | CC0 |

**Attribution page:** The platform must include a `/credits` page (linked from the footer) that lists every sound asset, its creator, and the source URL. This is required for CC BY assets even where not legally mandated, and is best practice for all others.

### 10.2 SoundManager

```typescript
// src/sound/SoundManager.ts
import Howl from 'howler';

export type SoundEvent =
  | 'card-deal' | 'card-flip' | 'card-discard' | 'card-draw' | 'card-shuffle'
  | 'phase-complete' | 'round-win' | 'game-win' | 'game-lose'
  | 'skip-played' | 'notification' | 'peg-move';

class SoundManager {
  private sounds: Map<SoundEvent, Howl>;
  private enabled: boolean = true;
  private volume: number = 0.7;

  play(event: SoundEvent): void;
  setEnabled(v: boolean): void;
  setVolume(v: number): void;   // 0.0–1.0
}

export const soundManager = new SoundManager();
```

### 10.3 Generated Sounds

Three sounds are synthesised programmatically using the Web Audio API rather than sourced externally, eliminating any licensing concern:

- **`phase-complete.mp3`**: A rising three-note arpeggio (C4 → E4 → G4), 350ms total, sine wave, slight reverb. Exported to MP3.
- **`skip-played.mp3`**: A descending swoosh, 200ms, sawtooth wave fading to silence.
- **`peg-move.mp3`**: A short wooden click, 80ms, synthesised percussion hit.

The generation script lives at `scripts/generate-sounds.js` and is run once as part of the initial scaffold. The output MP3s are committed to the repo.

---

## 11. TypeScript Interface Library

*(Full content from v2.1 §9 is retained with the following additions.)*

### 11.1 New: Bot Types

```typescript
// packages/shared-types/src/bot.ts

export interface BotSeatInfo {
  playerId: string;        // The original human player's ID
  displayName: string;
  seatIndex: number;
  activatedAt: string;     // ISO 8601
}

export interface BotActivatedPayload {
  playerId: string;        // Which seat the bot took
  seatIndex: number;
}

export interface BotYieldedPayload {
  playerId: string;        // Which seat the human reclaimed
  seatIndex: number;
}
```

### 11.2 New: Game Action Replay

```typescript
// Add to gameState.ts

export interface GameAction {
  id: string;              // UUID
  roomId: string;
  gameId: string;
  playerId: string;        // 'bot:{playerId}' for bot actions
  action: PlayerAction;
  appliedAt: string;       // ISO 8601
  resultVersion: number;   // GameState.version after this action
  isBot: boolean;
}
```

### 11.3 New: Admin Types

```typescript
// packages/shared-types/src/admin.ts

export interface ModerationReport {
  id: string;
  reportedByPlayerId: string;
  reportedPlayerId: string;
  messageId?: string;
  reason: string;
  status: 'pending' | 'actioned' | 'dismissed';
  createdAt: string;
  actionedAt?: string;
  actionedByModeratorId?: string;
}

export interface MuteRecord {
  id: string;
  playerId: string;
  mutedByModeratorId: string;
  reason: string;
  expiresAt: string | null;    // null = permanent
  createdAt: string;
}

export type MuteDuration = '15min' | '1hr' | '24hr' | '7day' | 'permanent';

export interface ApplyMutePayload {
  playerId: string;
  duration: MuteDuration;
  reason: string;
}

export interface AdminDashboardStats {
  activePlayers: number;
  activeRooms: number;
  pendingReports: number;
  activelyMuted: number;
  gamesPlayedToday: number;
}
```

### 11.4 New: Cribbage Board Types

```typescript
// packages/shared-types/src/gameState.ts — add to existing file

export interface CribbageBoardState {
  // Each player has two pegs: front (current) and back (previous position)
  pegs: CribbagePegSet[];
  skunkLine: 91;          // Always 91 in standard cribbage
  doubleskunkLine: 61;    // Always 61
  winScore: 121;          // Always 121
}

export interface CribbagePegSet {
  playerId: string;
  color: 'red' | 'green' | 'blue';  // Assigned by seat index
  frontPeg: number;     // 0–121
  backPeg: number;      // 0–121 (trails front peg)
}
```

### 11.5 New: Sound Types

```typescript
// packages/shared-types/src/sound.ts

export type SoundEvent =
  | 'card-deal' | 'card-flip' | 'card-discard' | 'card-draw'
  | 'card-shuffle' | 'phase-complete' | 'round-win' | 'game-win'
  | 'game-lose' | 'skip-played' | 'notification' | 'peg-move';

export interface SoundCredit {
  file: string;
  description: string;
  creator: string;
  sourceUrl: string;
  license: string;
}
```

---

## 12. Epic 1 — Auth & Identity

*(Full Stories 1.0–1.5 from v2.1 retained unchanged.)*

---

## 13. Epic 2 — cards.js Fork & Phase 10 Deck

*(Stories 2.1–2.4 from v2.1 retained. The following legal review story is added.)*

### Story 2.5 — Phase 10 Art Legal Review Gate (P0)

**As a** Developer, **I want** a mandatory review gate before Phase 10 SVG art merges to `main` **so that** the platform cannot inadvertently ship artwork that creates trademark confusion.

**Acceptance Criteria:**

```gherkin
Given the Phase 10 SVG files are complete and passing unit tests
When the implementing agent marks Unit 4 (cards-engine) as ready for merge
Then a MERGE BLOCKED label is applied to the PR automatically via GitHub Actions
  And the PR description includes the checklist:
    [ ] All 60 SVGs reviewed by a human against SPEC.md §13 visual specification
    [ ] Confirmed: no SVG reproduces Mattel's specific card layout, typography, or back design
    [ ] Confirmed: colour scheme (red/blue/green/yellow + black Wild + charcoal Skip) is original
    [ ] Confirmed: accessibility symbols (◆●■▲) are used as game mechanics, not as Mattel trade dress
    [ ] Legal reviewer (human) has signed off in this PR comment thread
  And the PR cannot be merged until all checklist items are checked by a human with write access

Given the legal review checklist is fully checked by an authorized human
When they add the comment "/legal-approved" to the PR
Then the MERGE BLOCKED label is removed and CI proceeds normally
```

**Implementation note:** The GitHub Actions workflow includes a job `legal-gate` that runs on any PR touching `packages/cards-engine/svg/phase10/**`. It sets a required status check to `pending` unless the PR body contains the completed checklist and the `/legal-approved` comment is present from a code owner.

---

## 14. Epic 3 — Lobby Experience

*(Stories 3.1–3.6 from v2.1 retained unchanged.)*

---

## 15. Epic 4 — Game Table

*(Stories 4.1–4.6 from v2.1 retained. The following bot story is added.)*

### Story 4.7 — Bot Seat Display (P0)

**As a** Player, **I want** to clearly see which seats are bot-controlled **so that** I always know who I am playing against.

**Acceptance Criteria:**

```gherkin
Given a bot has activated for Player 2's seat
When I view the game table
Then Player 2's seat renders BotSeat.tsx instead of PlayerSeat.tsx
  And the avatar shows a robot icon (circuit-board motif, SVG)
  And the name shows "{Player2Name} (Bot)"
  And a purple "BOT" badge is visible in the top-right of the seat
  And hovering the BOT badge shows a tooltip: "Bot is playing for {Player2Name} — they may return"

Given a bot is taking its turn
When the bot's think time is running (800–2500ms)
Then the seat shows an animated "Thinking…" indicator identical to a human player's
  And after the think time, the bot's action animates with the same AnimationEngine calls
  And the card sounds play (deal, discard, etc.) as normal

Given the human player reclaims their seat while the bot is mid-think
When BotController.yieldBot is called
Then if the bot's action has not yet been submitted, it is cancelled
  And if the bot's action was already submitted and processed, it is not rolled back
  And the seat transitions to PlayerSeat immediately
  And a system message: "{PlayerName} has returned and taken back their seat"
```

---

## 16. Epic 5 — Chat & Messaging

*(Stories 5.1–5.5 from v2.1 retained unchanged.)*

---

## 17. Epic 6 — Friends & Social Graph

*(Stories 6.1–6.4 from v2.1 retained unchanged.)*

---

## 18. Epic 7 — Leaderboards

*(Stories 7.1–7.3 from v2.1 retained. The following clarification applies to bot results.)*

### Story 7.4 — Bot Results Excluded from Leaderboards (P0)

**Acceptance Criteria:**

```gherkin
Given a game ends and some participants were bot-controlled seats
When computeResult is called
Then PlayerRanking entries for bot-controlled seats are flagged: isBot: true
  And the leaderboard worker skips any PlayerRanking where isBot: true
  And the human players' results are recorded normally
  And if all remaining human players are ranked (not all seats were bots), the result is valid
  And a game where only bots finished (all humans disconnected permanently) is marked abandoned
    And no leaderboard entries are created for an abandoned game
```

---

## 19. Epic 8 — Game Catalog & Engines

*(Stories 8.1–8.3 from v2.1 retained. The following stories replace/expand the Cribbage story.)*

### Story 8.4 — Cribbage Engine (P1)

**As a** Player, **I want** Cribbage rules to be correctly enforced **so that** the game plays exactly as the real card game.

**Acceptance Criteria (selected rules — full test suite required):**

```gherkin
Given a 2-player Cribbage game starts
When startGame is called
Then each player receives 6 cards
  And the deck is standard 52 cards
  And Aces are low (value 1) for runs; all face cards count 10 for scoring

Given the deal is complete
When each player has discarded 2 cards to the crib
Then the crib has exactly 4 cards
  And the cut card is revealed from the top of the remaining deck

Given the cut card is a Jack
When revealed
Then the dealer scores 2 points ("His Heels" / Nibs)
  And a system message: "Dealer scores 2 for His Heels (Jack cut)"

Given the pegging phase begins (play)
When a player plays a card
Then the running count is updated and broadcast in CribbageBoardState
  And 15s: playing to exactly 15 scores 2, system message: "{Name} scores 2 for fifteen"
  And 31s: playing to exactly 31 scores 2, count resets to 0
  And Pairs: matching last card scores 2 (pair), 6 (pair-royal), 12 (double pair-royal)
  And Runs: 3+ sequential cards in any order score equal to run length
  And Go: if a player cannot play without exceeding 31, they say Go, opponent scores 1
  And Last card: player who plays last card without reaching 31 scores 1 for Go

Given counting (show) occurs after all cards are played
When a player's hand is counted
Then 15s, runs, pairs, flushes, and nobs are scored in that order
  And Nobs: Jack in hand matching starter card suit scores 1
  And Flush: 4-card flush in hand scores 4; 5-card flush (including starter) scores 5
  And scoring is automatic — no player input required
  And results are displayed in the CribbageBoard UI with animated peg movements

Given a player reaches or exceeds 121 points during pegging OR during counting
When the win condition is detected
Then the game ends immediately (not at end of round)
  And isGameOver returns true
  And a system message: "{Name} wins by reaching 121!"

Given a player reaches 121 before their opponent reaches 91 (skunk line)
When game ends
Then the winner is awarded a "skunk" in the match record (P2 implementation)

Given the crib belongs to the dealer
When counting the crib
Then the dealer counts it last, after both players count their hands
```

### Story 8.5 — Cribbage Board Visual Component (P1)

**As a** Player, **I want** a visual cribbage board in the game UI **so that** I can track scores intuitively the way real cribbage players do.

**Visual Specification:**

The `CribbageBoard.tsx` component renders an SVG cribbage board within the game table's info panel. It must be implemented as a pure React + SVG component with no canvas dependency.

**Board Layout:**

```
┌─────────────────────────────────┐
│  HOME                     GOAL  │
│  ●○○○○  ○○○○○  ○○○○○  … ○○○○●  │ ← Red lane  (Player 1)
│  ●○○○○  ○○○○○  ○○○○○  … ○○○○●  │ ← Blue lane (Player 2)
│  ●○○○○  ○○○○○  ○○○○○  … ○○○○●  │ ← Green lane (4-player)
│         ↑               ↑       │
│     Double           Skunk      │
│     Skunk (61)       (91)       │
└─────────────────────────────────┘
```

**Detailed specification:**

- **Dimensions:** 720×160px viewBox (horizontal board, landscape orientation)
- **Track layout:** The board always renders three lanes (red, blue, green), matching a standard modern 3-track physical cribbage board. Used lanes are assigned to players in turn order; unused lanes render as empty tracks (holes visible, lane label muted grey, no pegs).
- **Holes:** 121 holes per lane. Holes are grouped in sets of 5 with a visible gap between each group. Each hole is a circle, radius 5px, fill `#D4C5A9` (empty), fill player-colour (occupied by front peg), fill lighter-player-colour (occupied by back peg).
- **Hole positions:** Holes run left-to-right starting at position 1 (hole 0 is the "home" start position, off the left edge). A single "goal" hole sits at position 121, slightly separated from hole 120.
- **Skunk line:** A vertical red line and small "S" label at hole 91
- **Double-skunk line:** A vertical orange line and "SS" label at hole 61
- **Board surround:** Rounded rectangle, wood-grain texture achieved with a subtle SVG `feTurbulence` filter, fill `#8B6914` (dark walnut tone)
- **Lane labels:** Tiny player colour dot and display name abbreviation at the left of each lane
- **Pegs:** Each player has two circular pegs (front and back). Front peg: solid player colour, radius 7px, drop shadow. Back peg: player colour at 50% opacity, radius 6px. Pegs render above the board surface (higher z-index / SVG layer order).
- **Peg animation:** When a peg advances, it animates along the track using a CSS path animation. Duration: 400ms per 5 holes moved (scaled). The `peg-move.mp3` sound fires once per animation start.
- **Scoring popup:** When points are scored, a `+N` tooltip appears above the scoring player's front peg and fades out over 1.2 seconds.

**Acceptance Criteria:**

```gherkin
Given a 2-player Cribbage game is in progress
When the CribbageBoard renders
Then it shows three lanes (red = Player 1, blue = Player 2, green = empty)
  And each lane has exactly 121 holes grouped in sets of 5
  And the empty third lane has a muted grey label and no pegs
  And a vertical skunk line is visible at hole 91 with label "S"
  And a vertical double-skunk line is visible at hole 61 with label "SS"
  And the goal hole at 121 is visually distinct (slightly larger, gold border)

Given Player 1 scores 15 points (moving from hole 10 to hole 25)
When the peg animation runs
Then the front peg moves from hole 10 to hole 25 over 1200ms (400ms × 3 groups of 5)
  And the back peg is left at hole 10
  And the peg-move sound fires
  And a "+15" tooltip appears above the peg and fades after 1.2 seconds
  And the board state reflects: frontPeg: 25, backPeg: 10

Given Player 1's score reaches or passes 91
When their front peg crosses the skunk line
Then the skunk line briefly pulses (CSS animation, 500ms) to draw attention

Given the board is rendered on a mobile viewport (< 480px wide)
When the component renders
Then the board scales to 100% width maintaining aspect ratio
  And all 121 holes remain visible (no clipping)
  And peg labels are hidden (holes remain distinguishable by position)

Given a screen reader accesses the cribbage board
When the component renders
Then an aria-label on the SVG reads: "Cribbage scoring board"
  And each player's score is also displayed as text below the board:
    "{PlayerName}: {score} points"
```

### Story 8.6 — Game Replay (P0 — infrastructure only; UI is P2)

**As a** Developer, **I want** all game actions to be persisted in an append-only log **so that** game replays and debugging are possible without additional engineering effort later.

**Acceptance Criteria:**

```gherkin
Given any game engine's applyAction succeeds
When the resulting state is written to PostgreSQL
Then a GameAction record is also appended to the game_actions table with:
  id, roomId, gameId, playerId, action (JSON), appliedAt, resultVersion, isBot

Given the write to game_actions fails (transient error)
When the error is caught
Then the action write is retried up to 3 times with 100ms backoff
  And if all retries fail, the error is logged but the game state write is NOT rolled back
  And an alert is generated (the game continues; replay is the lower-priority concern)

Given a game is over and a developer calls GET /api/v1/games/replay/:roomId
When AUTH_MODE=dev OR the caller is an admin
Then the response is the ordered list of all GameAction records for that room
  And this endpoint is used for debugging and future replay UI

Given 10,000 game actions accumulate over 30 days
When the database is queried
Then game_actions has no DELETE policy (append-only forever)
  And a database index exists on (roomId, appliedAt) for efficient per-game queries
```

**Prisma model addition:**

```prisma
model GameAction {
  id            String   @id @default(uuid())
  roomId        String
  gameId        String
  playerId      String
  actionJson    Json
  isBot         Boolean  @default(false)
  appliedAt     DateTime @default(now())
  resultVersion Int

  @@index([roomId, appliedAt])
}
```

---

## 20. Epic 9 — Connection Resilience & Async Play

*(Stories 9.1–9.4 from v2.1 retained. Story 9.4 Async Play expanded below.)*

### Story 9.4 — Async Play & Turn Notifications (P1)

**Acceptance Criteria (full):**

```gherkin
Given a room is created with asyncMode = true
When the game starts
Then each player receives a Web Push notification when it is their turn
  And the notification title is: "Your turn in {GameName}!"
  And the notification body is: "{RoomName} — {N} cards remaining in deck"
  And clicking the notification opens the platform at /table/{roomId}

Given it is a player's turn and they have not acted within the turn timer (24h default)
When the timer fires (BullMQ job)
Then BotController.activateBot is called for that player's seat
  And the bot plays the turn immediately
  And the bot remains active for subsequent turns until the human returns

Given a player's turn timer is configured at room creation
When the host selects a timer duration
Then the options are: 24 hours | 48 hours | 72 hours
  And the timer applies per-turn (reset on each new turn, not per-game)
  And the host cannot change the timer after the game starts

Given Web Push is not supported by the player's browser
When it is their turn
Then an in-app notification appears in the notification bell on their next visit
  And no error is thrown — Web Push failure is silent and graceful
```

---

## 21. Epic 10 — Infrastructure & DevOps

*(Stories 10.1–10.5 from v2.1 retained. The following stories are added.)*

### Story 10.6 — VAPID Key Provisioning (P0)

**As a** DevOps engineer, **I want** VAPID keys to be automatically generated and injected during deployment **so that** Web Push works out of the box without manual key management.

**Implementation:**

```bash
# scripts/generate-vapid.sh
#!/bin/bash
# Generates VAPID keys and writes them to the environment.
# Run once per environment. Output is idempotent — will not overwrite existing keys.
# Usage: ./scripts/generate-vapid.sh [--env staging|production]

set -e

ENV=${1:-staging}
SECRETS_FILE=".env.${ENV}.secrets"

if grep -q "VAPID_PUBLIC_KEY=" "$SECRETS_FILE" 2>/dev/null; then
  echo "VAPID keys already present in $SECRETS_FILE — skipping generation"
  exit 0
fi

echo "Generating VAPID keys for $ENV..."
node -e "
  const webpush = require('web-push');
  const keys = webpush.generateVAPIDKeys();
  console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
  console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
" >> "$SECRETS_FILE"

echo "VAPID_SUBJECT=mailto:admin@platform.example.com" >> "$SECRETS_FILE"
echo "VAPID keys written to $SECRETS_FILE"
```

```bash
# scripts/deploy.sh
#!/bin/bash
# Full deployment: VAPID key check → docker build → k8s apply
set -e

ENV=${1:-staging}

# Step 1: Ensure VAPID keys exist
./scripts/generate-vapid.sh --env "$ENV"

# Step 2: Load secrets into k8s Secret
kubectl create secret generic card-platform-secrets \
  --from-env-file=".env.${ENV}.secrets" \
  --dry-run=client -o yaml | kubectl apply -f -

# Step 3: Build and push images
docker build -t card-platform/api:$GIT_SHA apps/api-service
docker build -t card-platform/socket:$GIT_SHA apps/socket-service
docker build -t card-platform/worker:$GIT_SHA apps/worker-service
docker build -t card-platform/frontend:$GIT_SHA apps/frontend

# Step 4: Apply k8s manifests
kubectl apply -f k8s/ --recursive

# Step 5: Rolling update
kubectl set image deployment/api-deployment api=card-platform/api:$GIT_SHA
kubectl set image deployment/socket-deployment socket=card-platform/socket:$GIT_SHA
kubectl set image deployment/worker-deployment worker=card-platform/worker:$GIT_SHA
kubectl set image deployment/frontend-deployment frontend=card-platform/frontend:$GIT_SHA

kubectl rollout status deployment/api-deployment
kubectl rollout status deployment/socket-deployment
echo "Deployment complete: $GIT_SHA"
```

**Acceptance Criteria:**

```gherkin
Given scripts/generate-vapid.sh is run on a fresh environment
When the script completes
Then .env.{ENV}.secrets contains VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
  And the keys are valid (web-push can use them to send a test notification)

Given scripts/generate-vapid.sh is run a second time on the same environment
When the script detects existing keys
Then it exits without overwriting the existing keys
  And prints "VAPID keys already present — skipping generation"

Given scripts/deploy.sh is run in CI
When the full deploy completes
Then all k8s deployments roll out with zero downtime
  And health checks pass within 120 seconds of image update
```

### Story 10.7 — Credits Page (P1)

**Acceptance Criteria:**

```gherkin
Given the platform is running
When I navigate to /credits
Then I see a page listing all sound assets from §10 Sound Asset Catalogue
  And each entry shows: File name, Description, Creator name (linked to source URL), License
  And CC BY assets are clearly marked as requiring attribution
  And the page is accessible: all links have descriptive text, proper heading hierarchy
```

---

## 22. Epic 11 — Admin & Moderation UI

**Epic goal:** Moderators can review reports and mute users from a dedicated admin panel. Admins can manage the game catalog and leaderboards. All moderation actions are logged.

### Story 11.1 — Admin Layout & Access (P0)

**As a** Moderator, **I want** a dedicated admin interface **so that** I can perform moderation actions without touching the database directly.

**Acceptance Criteria:**

```gherkin
Given I am authenticated with role 'moderator' or 'admin'
When I navigate to /admin
Then the AdminPage renders with tabs: Reports | Users | (admin-only: Games, Leaderboards)
  And a summary dashboard shows AdminDashboardStats: active players, active rooms, pending reports, muted users, games today

Given I am authenticated with role 'player'
When I navigate to /admin
Then I am redirected to /lobby with a toast: "Access denied"

Given a moderator is viewing /admin/reports
When a new report is submitted by a player
Then the report appears in the ReportsQueue in real time (via socket event)
  And the pending count in the dashboard increments
```

### Story 11.2 — Reports Queue (P0)

**As a** Moderator, **I want** to review reported messages and take action **so that** the platform remains safe.

**Acceptance Criteria:**

```gherkin
Given I open the Reports tab
When it renders
Then I see a table of pending ModerationReports sorted by createdAt ascending (oldest first)
  And each row shows: reported player name, reporting player name, message preview, timestamp, [Review] button

Given I click [Review] on a report
When the review modal opens
Then I see the full message text, full conversation context (5 messages before and after), and action buttons:
  [Dismiss] [Warn (DM)] [Mute 15min] [Mute 1hr] [Mute 24hr] [Mute 7 days] [Mute Permanent]

Given I click [Mute 1hr]
When the mute is applied
Then a MuteRecord is created in the database
  And the muted player immediately receives a banner: "You have been muted by a moderator until {time}"
  And the muted player's messages are hidden for all users until the mute expires
  And the report status is updated to 'actioned'
  And the action is logged in the moderation_audit_log table

Given I click [Dismiss]
When the dismissal is processed
Then the report status is updated to 'dismissed'
  And no action is taken against the reported player
  And the report disappears from the pending queue

Given a mute expires
When the current time passes MuteRecord.expiresAt
Then the worker removes the mute automatically
  And the player can send messages again
  And no notification is sent to the player (silent expiry)
```

### Story 11.3 — User Search & Manual Mute (P1)

**As a** Moderator, **I want** to find and mute any player by name **so that** I can act on reports that don't have a specific message attached.

**Acceptance Criteria:**

```gherkin
Given I am on the Users tab
When I search for a player by display name
Then I see their profile: avatar, name, join date, games played, active mutes, report history

Given I view a player who is currently muted
When I see their profile
Then the active MuteRecord is displayed with: reason, duration, applied-by moderator, expiry time
  And an [Unmute] button is visible

Given I click [Unmute]
When the unmute is processed
Then the MuteRecord is deleted
  And the player can send messages immediately
  And the action is logged in moderation_audit_log
```

### Story 11.4 — Game Catalog Management (P0 — admin only)

**As an** Admin, **I want** to enable or disable games in the catalog **so that** I can control which games are available without a code deployment.

**Acceptance Criteria:**

```gherkin
Given I am on the Games tab (admin only)
When it renders
Then I see all registered games with: name, category, enabled/disabled toggle, active room count

Given I toggle a game to disabled
When PATCH /api/v1/admin/games/:id { enabled: false } is called
Then the game disappears from the Game Browser for all players immediately
  And existing in-progress rooms for that game continue until they finish
  And new rooms cannot be created for the disabled game

Given I toggle a game back to enabled
When the toggle is applied
Then the game reappears in the Game Browser within 30 seconds (React Query cache TTL)
```

### Story 11.5 — Leaderboard Management (P1 — admin only)

**As an** Admin, **I want** to manually trigger a leaderboard reset or recalculation **so that** I can correct data issues without waiting for the scheduler.

**Acceptance Criteria:**

```gherkin
Given I am on the Leaderboards tab
When I select a game and click [Recalculate Monthly Leaderboard]
Then POST /api/v1/admin/leaderboards/:gameId/recalculate is called
  And the BullMQ leaderboard job runs immediately (bypassing the 30-second interval)
  And a success toast: "Leaderboard for {GameName} recalculated"
  And connected clients receive the leaderboard_updated socket event within 5 seconds

Given I click [Reset Monthly Leaderboard for {GameName}]
When I confirm the destructive action in a confirmation dialog
Then all LeaderboardEntry rows for the current month and game are deleted
  And a success toast: "Monthly leaderboard for {GameName} has been reset"
```

### Story 11.6 — Moderation Audit Log (P0)

**Acceptance Criteria:**

```gherkin
Given any moderation action is taken (mute, unmute, dismiss, warn)
When the action is processed
Then a moderation_audit_log entry is created with:
  actionType, moderatorId, targetPlayerId, reason, timestamp
  And this log is visible in the admin panel under Users → {player} → Moderation History
  And the log is never deleted (append-only)
```

**Prisma additions:**

```prisma
model MuteRecord {
  id                 String    @id @default(uuid())
  playerId           String
  mutedByModId       String
  reason             String
  expiresAt          DateTime?
  createdAt          DateTime  @default(now())
  player             Player    @relation(fields: [playerId], references: [id])
}

model ModerationReport {
  id                 String    @id @default(uuid())
  reportedByPlayerId String
  reportedPlayerId   String
  messageId          String?
  reason             String
  status             ReportStatus @default(PENDING)
  createdAt          DateTime  @default(now())
  actionedAt         DateTime?
  actionedByModId    String?
}

model ModerationAuditLog {
  id             String   @id @default(uuid())
  actionType     String   // 'mute' | 'unmute' | 'dismiss' | 'warn'
  moderatorId    String
  targetPlayerId String
  reason         String?
  metadata       Json?
  createdAt      DateTime @default(now())
  @@index([targetPlayerId, createdAt])
}

enum ReportStatus { PENDING ACTIONED DISMISSED }
```

---

## 23. Epic 12 — Accessibility & i18n

*(Stories 11.1–11.5 from v2.1 retained, renumbered as 12.1–12.5. No changes to content.)*

---

## 24. WebSocket Event Reference

*(Full event tables from v2.1 §21 retained with the following additions.)*

### 24.1 New Events — Namespace `/game`

**Server → Client (additions)**

| Event | Payload Type | Description |
|---|---|---|
| `bot_activated` | `BotActivatedPayload` | Bot has taken a seat |
| `bot_yielded` | `BotYieldedPayload` | Human has reclaimed their seat from bot |

**Client → Server (additions)**

| Event | Payload Type | Description |
|---|---|---|
| `request_resync` | `RequestResyncPayload` | Client detected a `game_state_delta` gap (delta.prevVersion != locally applied version) and needs a fresh snapshot. Server replies with `game_state_sync`. |

### 24.3 Messaging Reliability Contract

The `/game` namespace makes the following guarantees:

1. **Per-recipient redaction.** Every `game_state_sync` and `game_state_delta` is filtered per socket before emit. A player's `hand` array is private to that player; opponents' cards are replaced with face-down placeholders (id preserved for stable React keys, `value: 0`, `faceUp: false`, type/colour fields stripped). Spectators are treated as "every hand is an opponent's." Laid-down / face-up data lives in `publicData` and is always visible. Implementation: `apps/socket-service/src/utils/gameStateRedaction.ts`.
2. **Sequence tracking.** Every delta carries `version` (new state) and `prevVersion` (the version it was computed from). Clients validate `prevVersion === currentlyAppliedVersion` before applying. On mismatch — a dropped or reordered delta — the client emits `request_resync` and applies the server's fresh snapshot instead of merging a diverging partial update.
3. **At-least-once bot turn delivery.** The worker publishes bot turns to `bot:action:{roomId}` after the BullMQ delay. Pub/sub is fire-and-forget, so `BotSweeper` scans `bot:schedule:*` every 2s and re-fires any turn that's >3s past its fire time. `BotPlayer.executeAction` uses the `version` field to reject stale replays idempotently (see `scheduledForVersion` guard).
4. **Turn progress invariant.** A bot strategy must never return `{type: 'pass'}` during its own active turn. `pass` is reserved for "nothing to do" signals (e.g. cribbage parallel-discard already complete). Violating this strands the schedule keys and sends the sweeper into a re-fire loop visible to the user as "Thinking…" indefinitely. The Phase 10 strategy's step-4 (`decideDiscard`) is the reference implementation: it ranks legal discards and falls back to a wild card as a last resort rather than passing.

These rules apply to every game engine, not just Phase 10.

### 24.2 New Events — Namespace `/lobby`

**Server → Client (additions)**

| Event | Payload Type | Description |
|---|---|---|
| `moderation_muted` | `{ expiresAt: string \| null }` | Sent to the muted player only |
| `admin_report_received` | `ModerationReport` | Sent to all connected moderators/admins |

---

## 25. REST API Reference

*(Full API tables from v2.1 §22 retained with the following additions.)*

### 25.1 Admin Endpoints (require moderator or admin role)

| Method | Path | Body | Response | Role |
|---|---|---|---|---|
| `GET` | `/admin/dashboard` | — | `AdminDashboardStats` | moderator+ |
| `GET` | `/admin/reports` | `?status=pending&page=` | `PaginatedReports` | moderator+ |
| `PATCH` | `/admin/reports/:id` | `{ action: 'dismiss' \| 'actioned' }` | `ModerationReport` | moderator+ |
| `POST` | `/admin/mute` | `ApplyMutePayload` | `MuteRecord` | moderator+ |
| `DELETE` | `/admin/mute/:playerId` | — | `{ success: true }` | moderator+ |
| `GET` | `/admin/users/:id` | — | `AdminPlayerProfile` | moderator+ |
| `GET` | `/admin/audit` | `?playerId=&page=` | `ModerationAuditLog[]` | moderator+ |
| `PATCH` | `/admin/games/:id` | `{ enabled: boolean }` | `GameCatalogEntry` | admin |
| `POST` | `/admin/leaderboards/:gameId/recalculate` | — | `{ success: true }` | admin |
| `DELETE` | `/admin/leaderboards/:gameId/monthly` | — | `{ success: true }` | admin |

### 25.2 New Replay Endpoint (admin + dev only)

| Method | Path | Response | Guard |
|---|---|---|---|
| `GET` | `/games/replay/:roomId` | `GameAction[]` | admin role OR `AUTH_MODE=dev` |

---

## 26. TDD & Playwright Strategy

*(Full strategy from v2.1 §23 retained with the following addition.)*

### Suite 9: Bot System

**Checkpoints and screenshots:**

```
1. Both players in an active Phase 10 game (screenshot — both viewports)
2. POST /api/v1/test/force-bot-activate { roomId, playerId: "test-player-2" }
   (bypasses 90s timer in test mode)
3. Player 2's seat transitions to BotSeat (screenshot — both viewports)
   Assert: BOT badge visible, avatar shows robot icon, name shows "TestPlayer2 (Bot)"
4. Bot takes a turn (screenshot — after bot action: discard visible on pile)
   Assert: animation played (via data-testid="last-action-indicator")
   Assert: peg-move or card sounds fired (via audio spy)
5. POST /api/v1/test/force-player-rejoin { roomId, playerId: "test-player-2" }
   (simulates Player 2 reconnecting)
6. Seat transitions back to PlayerSeat (screenshot — both viewports)
   Assert: "TestPlayer2 has returned" system message in chat
   Assert: BOT badge gone
7. Player 2 can take their next turn normally (screenshot — after Player 2 acts)
```

---

---

# PART B — AGENT ORCHESTRATION PLAYBOOK

---

## 27. Agent Role Definitions

### 27.1 `CLAUDE.md` — Project Context File

```markdown
# Card Platform — CLAUDE.md

## What This Project Is
A multiplayer browser-based card game platform. Full spec is in SPEC.md at the repo root.
Read SPEC.md in full before writing any code.

## Absolute Rules (Never Break These)
1. All TypeScript interfaces come from packages/shared-types. Never invent local types that duplicate them.
2. All Redis keys follow the schema in SPEC.md §5 exactly. Never use ad-hoc keys.
3. All file paths follow the directory structure in SPEC.md §4. Never create files in unlisted locations.
4. Every route, store slice, and component must match the maps in SPEC.md §6 and §7.
5. AUTH_MODE and TEST_MODE guard every dev-only and test-only code path. Production builds contain zero dev shortcuts.
6. Test-first: write the failing test before writing implementation code.
7. No console.log — use the logger utility (src/utils/logger.ts in each app).
8. Every new .env variable must be added to .env.example with a description comment.
9. Playwright screenshots at every checkpoint listed in SPEC.md §26.
10. All user-facing strings go in src/i18n/en.json. No hardcoded English in JSX.
11. Bots are never added to leaderboards. Bot actions are flagged isBot:true in game_actions.
12. Sound assets in src/sound/assets/ must match the catalogue in SPEC.md §10 exactly. No unapproved assets.
13. The Phase 10 SVG PR requires human legal sign-off before merging (SPEC.md §13 Story 2.5).
14. VAPID keys are generated by scripts/generate-vapid.sh. Never hardcode or commit VAPID secrets.
15. The moderation_audit_log and game_actions tables are append-only — no DELETE operations.

## Auth Mode
AUTH_MODE=dev — local JWT issuer active. MSAL code written but inactive.

## Bot System
Bots activate when async turn timer expires. They are rule-based (no ML).
Each async-capable game engine must have a corresponding strategy in socket-service/src/bots/strategies/.

## Sound
All sounds are CC0 or royalty-free. Attribution tracked in SPEC.md §10. 
Howler.js is the audio library. SoundManager singleton in src/sound/SoundManager.ts.

## Stack Summary
- Frontend: React 18 + Vite 5 + TypeScript strict + Zustand + React Query + shadcn/ui + Tailwind
- API: Node 20 + Express 4 + Prisma 5 + PostgreSQL 16
- Socket: Node 20 + Socket.io v4 + Redis 7
- Worker: Node 20 + BullMQ
- Tests: Vitest (FE), Jest (BE), Playwright (E2E)
- Cards: packages/cards-engine (cards.js fork)
- Audio: Howler.js

## Definition of Done for Any Story
1. Implementation code written
2. Unit tests passing (coverage threshold met: ≥80% FE, ≥85% BE)
3. Reviewer agent: PASS report (zero FAIL items)
4. Playwright test written and passing (if story has UI)
5. Screenshots produced at all checkpoints
6. tsc --noEmit passes in all affected apps
7. npm run lint passes in all affected apps
8. CLAUDE.md updated if new patterns introduced
```

### 27.2 `.claude/agents/architect.md`

```markdown
---
name: architect
description: >
  System architect. Use when: starting a new epic, designing cross-service boundaries,
  designing the bot strategy interface, designing the cribbage board SVG component,
  or when the implementer hits an unresolved design question.
  Does NOT write implementation code.
tools: Read, Grep, Glob, WebFetch
model: claude-opus-4-6
permissionMode: default
---

You are the senior architect for the Card Platform.

Before any response:
1. Read SPEC.md and CLAUDE.md fully
2. Read existing related code in the repo

Your outputs are always design documents saved to .claude/decisions/{topic}-{date}.md

Format every design document with:
- Problem statement
- Constraints (from SPEC.md)
- Proposed design (data flow as ASCII, interfaces, sequence diagram)
- Edge cases and error handling
- Test strategy (what to test, not how)
- Spec ambiguities requiring human resolution (flag explicitly)

Never write implementation code. Produce designs only.
```

### 27.3 `.claude/agents/implementer.md`

```markdown
---
name: implementer
description: >
  Primary code writer. Use for implementing stories, writing new files, modifying files.
  Always works test-first. One implementer active per work unit to avoid conflicts.
tools: Read, Write, Edit, Bash, Grep, Glob
model: claude-sonnet-4-6
permissionMode: default
---

You are the lead implementer for the Card Platform.

Before writing any code:
1. Read CLAUDE.md
2. Read the specific SPEC.md sections for this story
3. Read existing related code in the repo for context

Workflow for every story:
1. Write failing test (describe behavior, not implementation)
2. Run npm test — confirm it fails for the right reason
3. Write minimum code to pass
4. Refactor
5. Run npm test — confirm all tests pass
6. Run tsc --noEmit in the affected app — confirm zero errors
7. Run npm run lint — confirm zero errors
8. Report: files created/modified, test results, coverage %, any spec gaps

Special rules:
- Sound assets: do not download sounds yourself. Reference the file paths from SPEC.md §10.
  The devops agent handles downloading and placing asset files.
- Bot strategies: every IBotStrategy implementation must have a fallbackAction that always succeeds.
- SVG generation: Phase 10 card SVGs must match SPEC.md §13 Story 2.3 spec exactly.
  After generating, run the W3C SVG validator on each file.
- Cribbage board: pure React + SVG, no canvas. CribbageBoardState drives all rendering.
```

### 27.4 `.claude/agents/reviewer.md`

```markdown
---
name: reviewer
description: >
  Code quality reviewer. Use AFTER implementer completes a story.
  Reviews for spec compliance, security, performance, accessibility, test quality.
  Read-only — never modifies code.
tools: Read, Grep, Glob, Bash
model: claude-sonnet-4-6
permissionMode: readOnly
---

You are the senior code reviewer for the Card Platform.

Rate each item: PASS / WARN / FAIL. Any FAIL blocks merge.

## Review Checklist

### Spec Compliance
- [ ] Each Given/When/Then in the story's acceptance criteria is implemented
- [ ] File locations match SPEC.md §4 directory structure exactly
- [ ] Redis keys match SPEC.md §5 schema
- [ ] Socket event names match SPEC.md §24
- [ ] API routes match SPEC.md §25
- [ ] Bot results excluded from leaderboard (SPEC.md §18 Story 7.4)
- [ ] game_actions table is append-only (no DELETE) (SPEC.md §19 Story 8.6)
- [ ] moderation_audit_log is append-only (SPEC.md §22 Story 11.6)

### Auth & Security
- [ ] Dev-only code guarded by AUTH_MODE check; absent from production
- [ ] Test-only endpoints guarded by TEST_MODE check
- [ ] No secrets hardcoded or logged
- [ ] All authenticated routes use authMiddleware
- [ ] Admin routes use requireRole middleware

### Bot System
- [ ] IBotStrategy.fallbackAction always returns a valid action (never throws)
- [ ] BotController.yieldBot is called before bot submits next action on rejoin
- [ ] Bot display name format: "{OriginalName} (Bot)"
- [ ] isBot: true set on all GameAction records from bots

### Sound
- [ ] No sound assets referenced that are not in SPEC.md §10 catalogue
- [ ] SoundManager.play() called — not direct Howl instantiation
- [ ] Sound plays respect soundEnabled setting from gameStore

### Type Safety
- [ ] No `any` types without explicit justification comment
- [ ] All cross-service data uses interfaces from packages/shared-types
- [ ] tsc --noEmit passes

### Testing
- [ ] Happy path AND ≥2 error cases per function
- [ ] Coverage threshold met
- [ ] Tests test behavior not implementation

### Code Quality
- [ ] No console.log
- [ ] Functions < 40 lines
- [ ] No hardcoded English in JSX

### Accessibility (frontend)
- [ ] Interactive elements have accessible names
- [ ] CribbageBoard has ARIA label + text score fallback
- [ ] Color is not sole information carrier

## Output
Save report to .claude/reviews/{story-id}-review.md
```

### 27.5 `.claude/agents/tester.md`

```markdown
---
name: tester
description: >
  E2E test writer and runner. Use AFTER reviewer approves a story.
  Writes Playwright tests for the story and runs them against docker-compose.
  Produces screenshots at all checkpoints defined in SPEC.md §23.
tools: Read, Write, Edit, Bash, Grep, Glob
model: claude-sonnet-4-6
permissionMode: default
---

You are the E2E test engineer for the Card Platform project.

Your responsibilities:
- Read the story's acceptance criteria and the Playwright strategy in SPEC.md §23
- Use the auth fixture from e2e/fixtures/auth.fixture.ts (never implement custom login)
- Take screenshots at EVERY checkpoint listed in SPEC.md §23 for the relevant suite
- Screenshot naming: `playwright-report/screenshots/{suite-name}/{step-number}-{description}.png`
- Run: `npm run test:e2e -- --grep "{story name}"` from repo root
- If tests fail: diagnose whether it is a test bug or an implementation bug
  - Test bug: fix the test
  - Implementation bug: document in .claude/test-failures/{story-id}.md and report to orchestrator

## Screenshot Requirements (non-negotiable)
Every test must call page.screenshot() at:
1. After initial page load
2. After every significant state change
3. After every socket event that changes visible UI
4. At the final state of the test scenario

## Test Isolation
- Each test must be fully independent (no shared state between tests)
- Use test.beforeEach to navigate to a clean starting point
- Use docker-compose test reset endpoint between test suites if needed

## Output
Report to orchestrator:
- Tests written: list of test names
- Tests passing: Y/N per test
- Screenshots produced: list of paths
- Implementation bugs found: list with descriptions
```

---

### 27.6 `.claude/agents/devops.md`

```markdown
---
name: devops
description: >
  Infrastructure engineer. Use for: Dockerfiles, Kubernetes manifests, GitHub Actions,
  docker-compose, nginx, deployment scripts, VAPID key generation, sound asset download.
tools: Read, Write, Edit, Bash, Grep, Glob
model: claude-sonnet-4-6
permissionMode: default
---

You are the DevOps engineer for the Card Platform.

## Additional Responsibility: Sound Asset Acquisition

As part of Unit 4 (cards-engine) and Unit 9 (game table with sound), you are responsible for:
1. Downloading sound files from the URLs in SPEC.md §10 Sound Asset Catalogue
2. Converting to MP3 if needed (use ffmpeg: ffmpeg -i input.wav -q:a 2 output.mp3)
3. Placing files at: apps/frontend/src/sound/assets/{filename}.mp3
4. Verifying each file plays correctly (check duration > 0, file size > 0)
5. Documenting any files that could not be acquired from the listed source, and finding a CC0 alternative

## VAPID Key Management
- Run scripts/generate-vapid.sh for each environment
- Never hardcode VAPID keys in any config file
- Verify VAPID keys work by running the test notification script after generation

## Deployment Scripts
- scripts/generate-vapid.sh must be idempotent (safe to run multiple times)
- scripts/deploy.sh must exit non-zero on any failure
- All k8s health checks: GET /health → 200 within 3 seconds

## Dockerfile rules
- Multi-stage: node:20 build stage → node:20-alpine production
- No devDependencies in production image
- No secrets baked in
- Images < 200MB

After any infrastructure change:
- Run docker-compose up --build
- Verify all health endpoints respond
- Report what changed and verification result
```

---

## 28. Master Orchestrator Prompt

```
You are the Master Orchestrator for the Card Platform build.

## Prerequisites (Verify Before Starting)
1. Claude Code v2.1.32 or later is installed (claude --version)
2. CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 is set in your environment or settings.json
3. SPEC.md and CLAUDE.md exist at the repo root
4. .env file exists (copied from .env.example, populated with dev values)
5. docker-compose up -d postgres redis succeeds
6. npm install succeeds from repo root

If any prerequisite fails, stop and report the failure. Do not proceed.

## Your Responsibilities
- Read SPEC.md fully before doing anything
- Maintain .claude/tasks/master-task-list.md throughout the build
- Spawn the right sub-agent for each task
- Run the implementer → reviewer loop until every review PASSES
- Run the tester for every unit that has a Playwright suite
- Only mark a unit DONE when all Definition of Done criteria are met
- Create new sessions for each work unit (to avoid context exhaustion)

## Work Unit Sequence

### Unit 0 — Scaffolding (orchestrator, no sub-agents)
Create the exact directory structure from SPEC.md §4.
Create package.json files for each workspace (use npm workspaces + Turborepo).
Create tsconfig files (base + per-app, using tsconfig.base.json).
Create .claude/agents/ directory with all 6 agent definition files from SPEC.md §27.
Copy .env.example to .env and populate with local dev values.
Create CLAUDE.md at repo root.
Run: npm install
Mark DONE when: npm install succeeds and tsc compiles the empty workspace.

### Unit 1 — Shared Types Package
Spawn: implementer
  Task: Implement all interfaces from SPEC.md §11 in packages/shared-types/src/
        Files: auth.ts, bot.ts, cards.ts, chat.ts, friends.ts, gameEngine.ts,
               gameState.ts, leaderboard.ts, rooms.ts, socket.ts, sound.ts, index.ts
        Write __tests__/types.test.ts — import every exported type (compile check only)
        Run: npm run build in packages/shared-types
Then: reviewer → loop until PASS
DONE when: build succeeds, zero TypeScript errors.

### Unit 2 — Database Schema & Seed
Spawn: implementer
  Task: Implement apps/api-service/prisma/schema.prisma
        Include ALL models from SPEC.md §11 including:
          - GameAction (append-only, index on roomId+appliedAt) from Story 8.6
          - MuteRecord, ModerationReport, ModerationAuditLog from Story 11.6
          - CribbageBoardState is not a DB model — it lives in GameState JSON
        Write prisma/seed.ts with all 5 test users from SPEC.md §8
        Run: npx prisma migrate dev --name init
        Run: npx prisma db seed
        Write __tests__/schema.test.ts verifying seed data and table existence
Then: reviewer → loop until PASS
DONE when: migrations applied, seed runs clean, tests pass.

### Unit 3 — Auth Middleware & Dev Token
Spawn: implementer
  Task: Implement auth middleware per SPEC.md §8 and Story 1.0
        Files: api-service/src/middleware/auth.ts (dev + production branches)
               api-service/src/routes/dev.routes.ts (AUTH_MODE=dev only)
               frontend/src/auth/AuthProvider.tsx, DevAuthProvider.tsx, useAuth.ts
               frontend/src/auth/tokenInterceptor.ts
               frontend/e2e/fixtures/auth.fixture.ts
        Write unit tests for both middleware modes (mock JWKS for production branch)
Then: reviewer → loop until PASS
Spawn: tester (Suite 1 — Authentication)
Loop tester until Suite 1 passes with all screenshots.
DONE when: Suite 1 Playwright passes.

### Unit 4 — cards-engine + Phase 10 SVGs + Sound Assets
Spawn: architect
  Task: Design the Phase 10 SVG generation approach (programmatic SVG in Node vs
        hand-crafted SVG). Save to .claude/decisions/phase10-svg-design.md
Then: implementer
  Task: Implement packages/cards-engine per SPEC.md §13 Stories 2.1–2.4
        Generate all 60 Phase 10 SVG card faces per Story 2.3 visual specification
        Run W3C SVG validator on every generated SVG
        Implement AnimationEngine with all methods from Story 2.4
        Write unit tests for: deck composition (60 cards), alt text, animation timing
Then: reviewer → loop until PASS
Spawn: devops
  Task: Download and place all sound assets from SPEC.md §10 catalogue
        Convert to MP3 if needed
        Verify each file at apps/frontend/src/sound/assets/
        Run scripts/generate-sounds.js to create synthesised sounds
        Report: which files were acquired, any that needed alternative sources

IMPORTANT: After Unit 4 reviewer PASS, the Phase 10 SVG PR must be flagged for
legal review per Story 2.5. The orchestrator must:
  - Create a PR with the MERGE BLOCKED label
  - Include the legal review checklist in the PR description
  - PAUSE this unit and continue with Units 5–7 in parallel (SVGs not yet in main)
  - Resume Unit 4 merge only after human legal sign-off (/legal-approved comment)

### Unit 5 — REST API Core
Spawn: implementer
  Task: Implement api-service routes: health, games, rooms, players, friends,
        leaderboard, messages, admin per SPEC.md §25
        Implement all service layer functions
        Implement Redis client singleton (client.ts)
        Write supertest integration tests: all routes, happy + error paths
        Include admin routes with requireRole middleware
Then: reviewer → loop until PASS
DONE when: all API tests pass including admin routes.

### Unit 6 — Socket Service Core
Spawn: architect
  Task: Design the socket service architecture including:
        - Bot activation trigger points (on disconnect timer in BullMQ → socket notification)
        - How BotController integrates with gameAction handler
        - Redis pub-sub flow for bot:action channel
        Save to .claude/decisions/socket-and-bot-architecture.md
Then: implementer
  Task: Implement socket-service per SPEC.md §24 (/lobby and /game namespaces)
        Implement socketAuth middleware (dev + production modes)
        Implement BotController (activate, yield, deactivateAll, isBotActive)
        Implement BotPlayer (scheduleAction with randomised think time 800–2500ms)
        Write socket integration tests using socket.io-client in Jest
        Test: join_room, game_action, bot_activated, bot_yielded events
Then: reviewer → loop until PASS
DONE when: socket tests pass including bot activation and yield scenarios.

### Unit 7 — Phase 10 Game Engine + Bot Strategy
Spawn: implementer
  Task: Implement socket-service/src/games/phase10/engine.ts (IGameEngine)
        Implement socket-service/src/bots/strategies/phase10.strategy.ts (IBotStrategy)
        Implement socket-service/src/bots/strategies/generic.strategy.ts
        (Generic: always draw from pile, discard highest-point non-phase card)
        Write exhaustive Jest tests for engine (all 10 phases, Wild, Skip, scoring)
        Write Jest tests for bot strategy: valid action returned in all game states,
        fallbackAction never throws
Then: reviewer → loop until PASS
DONE when: engine ≥85% coverage, bot strategy tests pass.

### Unit 8 — Frontend: Lobby
Spawn: implementer
  Task: Implement React frontend lobby and social layer per SPEC.md §14
        Pages: LandingPage, LobbyPage
        Components: GameBrowser, GameCard, RoomBrowserModal, CreateRoomModal, FilterSidebar
        Components: FriendList, FriendEntry, PlayerSearch, StatusDot
        Stores: authStore, lobbyStore per SPEC.md §7
        Hooks: useSocket, usePresence, useRooms
        API client: client.ts with token interceptor, all api/*.api.ts files
        Write Vitest unit tests for stores and key components
Then: reviewer → loop until PASS
Spawn: tester (Suite 2 — Lobby)
Loop tester until Suite 2 passes.
DONE when: Suite 2 Playwright passes.

### Unit 9 — Frontend: Game Table + Sound
Spawn: implementer
  Task: Implement TablePage and game table components per SPEC.md §15
        Components: GameTable, PlayerSeat, BotSeat, ActionBar, GameSettingsPanel
        Components: CribbageBoard.tsx + CribbagePeg.tsx (SVG board, SPEC.md §19 Story 8.5)
        Cards: CardComponent, HandComponent, PileComponent using cards-engine
        DnD: @dnd-kit integration for drag-and-drop card play
        Keyboard: Tab/Space/D/Escape handlers
        Sound: SoundManager.ts using Howler.js, useSound.ts hook
               Wire soundManager.play() to every AnimationEngine callback
        gameStore per SPEC.md §7
        Write Vitest tests for gameStore state machine transitions
        Write Vitest tests for CribbageBoard: peg positions, skunk line rendering
Then: reviewer → loop until PASS
Spawn: tester (Suite 3 — Phase 10, Suite 9 — Bot)
Loop tester until both suites pass.
DONE when: Suites 3 and 9 pass with screenshots.

### Unit 10 — Reconnection & Resilience
Spawn: implementer
  Task: Implement reconnection logic per SPEC.md §20 Stories 9.1–9.3
        Socket exponential backoff config
        rejoin_room handler with full state sync
        Connection status banner component
        Token refresh flow (dev and production paths)
        Write Jest tests for server-side disconnect + bot activation trigger
Then: reviewer → loop until PASS
Spawn: tester (Suite 4 — Reconnection)
DONE when: Suite 4 passes.

### Unit 11 — Chat & Messaging
Spawn: implementer
  Task: Implement chat per SPEC.md §16 Stories 5.1–5.5
        Components: TableChat, DMDrawer, MessageBubble
        Socket: /lobby namespace DM handlers
        Chat history (last 100 messages) on join
        Emoji reactions
        Spectator message labelling
        Moderation: mute user (client-side message hiding)
        notification.mp3 plays on DM receipt
Then: reviewer → loop until PASS
Spawn: tester (Suite 5 — Chat, Suite 6 — Spectator)
DONE when: Suites 5 and 6 pass.

### Unit 12 — Friends & Social Graph
Spawn: implementer
  Task: Implement friends per SPEC.md §17 Stories 6.1–6.4
        All friend API routes, services, components
        Room invite flow
        Friend suggestions
Then: reviewer → loop until PASS
Spawn: tester (Suite 7 — Friends)
DONE when: Suite 7 passes.

### Unit 13 — Leaderboards
Spawn: implementer
  Task: Implement leaderboard pipeline per SPEC.md §18
        BullMQ worker processor (leaderboard.processor.ts)
        Bot result exclusion in processor
        API routes (global + friends, monthly + all-time)
        LeaderboardTable component
        Redis pub-sub → socket → React Query cache invalidation
Then: reviewer → loop until PASS
Spawn: tester (Suite 8 — Leaderboard)
DONE when: Suite 8 passes (including <5s update assertion, bot exclusion verified).

### Unit 14 — Admin & Moderation UI
Spawn: implementer
  Task: Implement Epic 11 (Admin & Moderation) per SPEC.md §22 Stories 11.1–11.6
        AdminPage with tabs: Reports, Users, Games (admin), Leaderboards (admin)
        AdminDashboardStats display
        ReportsQueue with review modal
        MuteUserPanel with duration selector
        GameCatalogManager toggle
        LeaderboardManager recalculate/reset
        Admin API routes (server + frontend)
        Moderation audit log writes
        moderation_muted socket event to muted player
        admin_report_received socket event to moderators
Then: reviewer → loop until PASS
DONE when: admin routes tested (supertest), components have Vitest tests, 
          reviewer PASS.

### Unit 15 — Additional Game Engines (Priority 1)
For each engine below, run a separate implementer → reviewer loop:
  - RummyEngine + rummy.strategy.ts
  - GinRummyEngine + ginrummy.strategy.ts
  - CanastEngine (no async/bot needed — asyncMode: false)
DONE when: all 3 engines have passing tests at ≥85% coverage.

### Unit 16 — Cribbage Engine
Spawn: architect
  Task: Design the Cribbage pegging phase state machine and counting algorithm.
        Include: how CribbageBoardState flows from engine to client,
        how peg positions are calculated, how the skunk line detection works.
        Save to .claude/decisions/cribbage-engine-design.md
Then: implementer
  Task: Implement CribbageEngine per SPEC.md §19 Story 8.4
        Implement cribbage.strategy.ts (bot: play highest card under 31, then discard lowest)
        Write full Jest test suite (all scoring combinations, pegging, counting, win condition)
Then: reviewer → loop until PASS
DONE when: engine tests pass at ≥85% coverage.

### Unit 17 — Priority 3 Game Engines
Implement each with a separate implementer → reviewer loop:
  SpadesEngine, HeartsEngine, EuchreEngine, WhistEngine, OhHellEngine
  (No bot strategies required — these games are real-time only)
DONE when: all 5 engines pass unit tests.

### Unit 18 — Priority 4 Game Engines
GoFishEngine + gofish.strategy.ts (async supported)
CrazyEightsEngine + crazyeights.strategy.ts (async supported)
WarEngine (real-time only)
SpitEngine (real-time only)
IdiotEngine (real-time only)
DONE when: all 5 engines pass unit tests.

### Unit 19 — Infrastructure & DevOps
Spawn: devops
  Task: Dockerfiles for all 4 services + nginx.conf for frontend
        docker-compose.yml (dev) and docker-compose.test.yml (CI)
        K8s manifests (all deployments, services, HPA, ingress) per SPEC.md §21
        scripts/generate-vapid.sh and scripts/deploy.sh per Story 10.6
        scripts/generate-sounds.js (synthesised sounds: phase-complete, skip-played, peg-move)
        GitHub Actions: ci.yml + e2e.yml per SPEC.md §26
        Credits page at /credits per Story 10.7
        Legal gate GitHub Action per Story 2.5
Then: reviewer (infrastructure review)
Loop until PASS
Run: docker-compose up --build — verify all services start
Run: full Playwright suite (all 9 suites) against docker-compose.test.yml
DONE when: all suites pass in docker-compose.

### Unit 20 — Async Play & Turn Timers
Spawn: implementer
  Task: Implement BullMQ turnTimer.processor.ts
        On timer expiry: call BotController.activateBot via Redis channel
        Web Push notifications via vapid.processor.ts
        Turn timer display in async game table (countdown UI)
        Room creation: turn timer duration selector (24h/48h/72h)
Then: reviewer → loop until PASS
DONE when: timer tests pass (mock BullMQ), bot activation on expiry tested.

### Unit 21 — Accessibility Audit
Spawn: reviewer (accessibility specialist)
  Task: Audit all frontend components against SPEC.md §23 acceptance criteria
        Specifically audit: CribbageBoard ARIA, bot seat ARIA, admin panel focus management
Report: list of FAIL and WARN items
Spawn: implementer for each FAIL item
Repeat until reviewer audit is fully PASS.

### Unit 22 — Full Integration & Hardening
Spawn: tester
  Task: Run complete Playwright suite (all 9 suites) against docker-compose.test.yml
        Verify all screenshots produced at all checkpoints
        Run Lighthouse on /lobby page — verify score ≥ 85
        Run coverage reports across all services — verify thresholds met
        Run: npx prisma validate
        Verify VAPID key generation script works end-to-end (test notification)
Report full pass/fail. Fix remaining failures.
DONE when: all 9 Playwright suites pass, coverage met, Lighthouse ≥ 85.

## Failure Handling
- Implementer fails to fix reviewer issues after 3 loops → spawn architect for redesign, restart implementer
- Playwright test fails after 2 tester loops → spawn reviewer to classify (implementation vs test bug)
- Legal gate blocks Unit 4 merge → continue with all other units, return to Unit 4 merge after human sign-off

## Parallel Execution (Use Agent Teams)
These units can run in parallel once their dependencies are met:
  - Units 5 and 6 can run in parallel after Unit 3
  - Units 11, 12, 13, 14 can run in parallel after Units 8 and 9
  - Units 15, 16, 17, 18 can run in parallel after Unit 7
  - Unit 19 can start in parallel with Units 15–18

## Completion
When Unit 22 is DONE:
1. Run: npm run test:e2e (all 9 suites) — confirm all pass
2. Produce: .claude/reports/implementation-complete.md
   Include: all work units, loop counts per unit, known limitations
3. Present the Production Deployment Checklist:
   [ ] B2C tenant provisioned (SPEC.md §8.5 setup steps)
   [ ] Production .env populated with B2C values
   [ ] scripts/deploy.sh run for production environment
   [ ] VAPID keys generated for production (scripts/generate-vapid.sh --env production)
   [ ] Phase 10 SVG legal review completed and PR merged to main
   [ ] /credits page verified in production
   [ ] Admin test accounts created in production B2C tenant
   [ ] Smoke test: create game, play one turn, verify leaderboard updates

BEGIN with Unit 0 now.
```

---

## 29. Sub-Agent Prompt Library

*(Prompts from v2.1 §26 retained. The following additional prompts are added.)*

### 29.1 Add a Bot Strategy for a New Game

```
You are the Master Orchestrator adding a bot strategy for {GameName}.
1. Read SPEC.md §9 AI Bot System fully
2. Read packages/shared-types/src/bot.ts for IBotStrategy interface
3. Read the existing phase10.strategy.ts as a reference implementation
4. Spawn architect to design the {GameName} bot strategy:
   - What is the optimal discard priority?
   - What draw preference rule works for this game?
   - What is the fallbackAction (must always succeed)?
   Save to .claude/decisions/{gamename}-bot-strategy.md
5. Spawn implementer:
   Implement socket-service/src/bots/strategies/{gamename}.strategy.ts
   Write Jest tests: valid action returned in all game states, fallback never throws
6. Spawn reviewer → loop until PASS
7. Register the strategy in BotController for the game's ID
```

### 29.2 Implement Production Auth Switch

```
You are the Master Orchestrator switching to production AAD-B2C auth.
Prerequisites: B2C tenant provisioned, production .env populated.

Spawn implementer:
1. Implement MsalAuthProvider.tsx per SPEC.md §8.5:
   - Identical useAuth() interface to DevAuthProvider
   - Popup flow (not redirect) for sign-in
   - Silent token renewal 5 minutes before expiry
   - On renewal failure: game_paused event + re-auth modal
2. Implement api-service/src/middleware/auth.ts production branch:
   validateMsalToken() using jwks-rsa, caching enabled
3. Write unit tests (mock MSAL, mock JWKS)
Spawn reviewer → loop until PASS
Note: Playwright E2E continues using DevAuthProvider via TEST_MODE=true
```

### 29.3 Acquire Missing Sound Asset

```
You are the Master Orchestrator acquiring a replacement sound asset.
The sound {filename} could not be acquired from its listed source in SPEC.md §10.

Spawn devops:
1. Search Freesound.org and Pixabay for a CC0 alternative for {description}
2. Download the alternative
3. Convert to MP3 if needed: ffmpeg -i input.wav -q:a 2 {filename}.mp3
4. Place at apps/frontend/src/sound/assets/{filename}.mp3
5. Update the Sound Asset Catalogue in SPEC.md §10 with:
   - New source URL
   - Creator name
   - License
6. Update /credits page data
Report: alternative found, placed, SPEC.md updated.
```

### 29.4 Debug a Bot Infinite Loop

```
You are the Master Orchestrator debugging a suspected bot infinite loop.
Symptom: {describe symptom}

1. Spawn reviewer to read BotController.ts and {gamename}.strategy.ts
   Check: does chooseAction have any path that could loop or block?
   Check: does fallbackAction always return without iteration?
   Check: is scheduleAction guarded against being called twice for the same turn?
2. If reviewer finds the issue, spawn implementer to fix it
3. Write a specific Jest test that reproduces the bug before fixing it
4. Implementer fixes the bug
5. Spawn reviewer again — confirm fix does not regress other tests
```

---

## 30. Implementation Sequence & Work Units

| Unit | Name | Primary Agent | Key Dependencies | Playwright Suite | Parallel OK After |
|---|---|---|---|---|---|
| 0 | Scaffolding | orchestrator | — | — | — |
| 1 | Shared Types | implementer | 0 | — | — |
| 2 | DB Schema & Seed | implementer | 1 | — | — |
| 3 | Auth Middleware | implementer | 2 | Suite 1 | — |
| 4 | cards-engine + SVGs + Sounds | implementer + devops | 1 | — | — |
| 5 | REST API Core | implementer | 2, 3 | — | 3 done |
| 6 | Socket Service + Bot Core | implementer | 3, 5 | — | 3 done |
| 7 | Phase 10 Engine + Bot Strategy | implementer | 1, 6 | — | 6 done |
| 8 | Frontend: Lobby | implementer | 5, 6 | Suite 2 | — |
| 9 | Frontend: Table + Sound + Cribbage Board | implementer | 4, 7, 8 | Suites 3, 9 | — |
| 10 | Reconnection | implementer | 6, 9 | Suite 4 | — |
| 11 | Chat & Messaging | implementer | 6, 8 | Suites 5, 6 | 8+9 done |
| 12 | Friends | implementer | 5, 8 | Suite 7 | 8+9 done |
| 13 | Leaderboards | implementer | 5, 6 | Suite 8 | 8+9 done |
| 14 | Admin & Moderation UI | implementer | 5, 8 | — | 8+9 done |
| 15 | Priority 1 Engines (3x) | implementer | 7 | — | 7 done |
| 16 | Cribbage Engine | implementer + architect | 7 | — | 7 done |
| 17 | Priority 3 Engines (5x) | implementer | 7 | — | 7 done |
| 18 | Priority 4 Engines (5x) | implementer | 7 | — | 7 done |
| 19 | Infrastructure & DevOps | devops | all | all suites | 15–18 started |
| 20 | Async Play & Turn Timers | implementer | 6, 9 | — | 10 done |
| 21 | Accessibility Audit | reviewer | 8, 9, 11 | — | 14 done |
| 22 | Full Integration | tester | all | all 9 suites | all done |

**Critical path:** 0→1→2→3→5→6→7→8→9→10→19→22

**Maximum parallelism:** After Unit 9 is done, Units 11, 12, 13, 14, 15, 16, 17, 18 can all run simultaneously using Agent Teams — each touches different files and game engine directories.

**Legal gate:** Unit 4's SVG files are ready after the reviewer PASS on Unit 4, but the merge to `main` is blocked pending human legal sign-off. All other units proceed independently. The legal gate does not block the build.

---

*End of Document — Card Platform Product Specification v2.2 + Agent Orchestration Playbook*

*To start the build: enable Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), confirm Claude Code ≥ v2.1.32, then paste the Master Orchestrator Prompt (§28) into a new Claude Code session.*

*Production deployment requires human completion of the B2C setup checklist and legal sign-off on Phase 10 card art. Everything else is fully automated.*
