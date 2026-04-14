# Card Platform — Product Specification v2.1
# + Agent Orchestration Playbook

**Document status:** First Draft — v2.1  
**Audience:** Engineers, QA, AI Agents, Product  
**Last updated:** 2026-04-11  
**Supersedes:** v2.0

---

## Table of Contents

### Part A — Product Specification
1. [Document Conventions](#1-document-conventions)
2. [Platform Overview & Non-Functional Requirements](#2-platform-overview)
3. [Technology Stack](#3-technology-stack)
4. [Monorepo Directory Structure](#4-monorepo-directory-structure)
5. [Redis Key Schema](#5-redis-key-schema)
6. [React Route Map](#6-react-route-map)
7. [Zustand Store Shapes](#7-zustand-store-shapes)
8. [Auth Strategy — Dev vs Production](#8-auth-strategy)
9. [TypeScript Interface Library](#9-typescript-interface-library)
10. [Epic 1 — Auth & Identity](#10-epic-1--auth--identity)
11. [Epic 2 — cards.js Fork & Phase 10 Deck](#11-epic-2--cardsjs-fork--phase-10-deck)
12. [Epic 3 — Lobby Experience](#12-epic-3--lobby-experience)
13. [Epic 4 — Game Table](#13-epic-4--game-table)
14. [Epic 5 — Chat & Messaging](#14-epic-5--chat--messaging)
15. [Epic 6 — Friends & Social Graph](#15-epic-6--friends--social-graph)
16. [Epic 7 — Leaderboards](#16-epic-7--leaderboards)
17. [Epic 8 — Game Catalog & Engines](#17-epic-8--game-catalog--engines)
18. [Epic 9 — Connection Resilience & Async Play](#18-epic-9--connection-resilience--async-play)
19. [Epic 10 — Infrastructure & DevOps](#19-epic-10--infrastructure--devops)
20. [Epic 11 — Accessibility & i18n](#20-epic-11--accessibility--i18n)
21. [WebSocket Event Reference](#21-websocket-event-reference)
22. [REST API Reference](#22-rest-api-reference)
23. [TDD & Playwright Strategy](#23-tdd--playwright-strategy)

### Part B — Agent Orchestration Playbook
24. [Agent Role Definitions](#24-agent-role-definitions)
25. [Master Orchestrator Prompt](#25-master-orchestrator-prompt)
26. [Sub-Agent Prompt Library](#26-sub-agent-prompt-library)
27. [Implementation Sequence & Work Units](#27-implementation-sequence--work-units)
28. [Open Questions](#28-open-questions)

---

# PART A — PRODUCT SPECIFICATION

---

## 1. Document Conventions

### 1.1 Story Format
> **As a** `[persona]`, **I want** `[capability]` **so that** `[benefit]`.

### 1.2 Personas

| Persona | Description |
|---|---|
| `Guest` | Unauthenticated visitor |
| `Player` | Authenticated user |
| `Host` | Player who created a room |
| `Spectator` | Host-approved viewer of an in-progress game |
| `Moderator` | Elevated-privilege platform moderator |
| `Admin` | Full platform administrator |
| `Developer` | Engineer or AI agent building the platform |

### 1.3 Acceptance Criteria Format
Written as Given/When/Then (Gherkin-style). Every story must have at minimum one passing Playwright test before merge to `main`.

### 1.4 Priority Tiers

| Tier | Meaning |
|---|---|
| **P0** | Launch blocker |
| **P1** | Launch target |
| **P2** | Post-launch v1.1 |

---

## 2. Platform Overview

### 2.1 Vision
A modern browser-based multiplayer card game platform supporting up to six simultaneous players per table, hosting both standard 52-card deck games and Phase 10 games using an original extended deck.

### 2.2 Launch Game Catalog

**Priority 1 — Rummy Family**
- Phase 10 *(Phase 10 deck, 2–6 players)*
- Rummy *(standard, 2–6 players)*
- Gin Rummy *(standard, 2–4 players)*
- Canasta *(standard, 4 players)*

**Priority 2 — Cribbage**
- Cribbage *(standard, 2–4 players)*

**Priority 3 — Trick-Taking**
- Spades, Hearts, Euchre, Whist *(standard, 4 players)*
- Oh Hell! *(standard, 3–6 players)*

**Priority 4 — Other**
- Go Fish, Crazy Eights, War, Spit/Speed, Idiot/Shithead

### 2.3 Non-Functional Requirements

| Requirement | Target |
|---|---|
| Lobby FCP | < 1.5 s on 10 Mbps |
| Game action round-trip (p99) | < 200 ms |
| Reconnection + full state sync | < 10 s after network restored |
| Leaderboard update after game end | < 5 s for connected clients |
| Lighthouse performance (lobby) | ≥ 85 |
| Unit test coverage — frontend | ≥ 80% line |
| Unit test coverage — backend | ≥ 85% line |

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, TypeScript strict |
| UI Components | shadcn/ui + Tailwind CSS v3 |
| Card Rendering | `packages/cards-engine` (cards.js fork, extended) |
| Client State | Zustand v4 + React Query v5 |
| Auth (Dev) | Local JWT issuer + `jsonwebtoken` |
| Auth (Production) | AAD-B2C + MSAL Browser/React |
| Real-time | `socket.io-client` v4 |
| Backend Runtime | Node.js 20 LTS |
| REST API | Express 4 + TypeScript |
| Socket Server | Express + `socket.io` v4 + TypeScript |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Redis 7 |
| ORM | Prisma 5 |
| Background Jobs | BullMQ |
| Containers | Docker (multi-stage, Alpine) |
| Orchestration | Kubernetes (provider-agnostic) |
| Unit Tests | Vitest (frontend), Jest (backend) |
| E2E Tests | Playwright v1.44+ |
| CI/CD | GitHub Actions |

---

## 4. Monorepo Directory Structure

Every agent must write files to exactly these locations. No exceptions without updating this map.

```
card-platform/                          ← repo root
├── .github/
│   └── workflows/
│       ├── ci.yml                      ← lint + unit tests + build
│       └── e2e.yml                     ← Playwright against docker-compose
├── .claude/
│   └── agents/                         ← Claude Code sub-agent definitions
│       ├── orchestrator.md
│       ├── architect.md
│       ├── implementer.md
│       ├── reviewer.md
│       ├── tester.md
│       └── devops.md
├── CLAUDE.md                           ← Project context for all agents
├── docker-compose.yml                  ← Local dev stack
├── docker-compose.test.yml             ← CI test stack
├── .env.example                        ← All vars documented, no secrets
│
├── packages/
│   ├── shared-types/                   ← Cross-service TypeScript contracts
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── cards.ts
│   │   │   ├── chat.ts
│   │   │   ├── friends.ts
│   │   │   ├── gameEngine.ts
│   │   │   ├── gameState.ts
│   │   │   ├── leaderboard.ts
│   │   │   ├── rooms.ts
│   │   │   ├── socket.ts
│   │   │   └── index.ts               ← re-exports all
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cards-engine/                  ← cards.js fork + Phase 10 extension
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
│       │   ├── standard/              ← Standard 52-card SVGs
│       │   └── phase10/               ← Original Phase 10 SVGs
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
│   ├── frontend/                      ← React + Vite SPA
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── auth/
│   │   │   │   ├── AuthProvider.tsx   ← Dev JWT or MSAL depending on env
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
│   │   │   │   │   ├── ActionBar.tsx
│   │   │   │   │   └── GameSettingsPanel.tsx
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
│   │   │   │   └── useRooms.ts
│   │   │   ├── api/
│   │   │   │   ├── client.ts          ← Axios instance + interceptors
│   │   │   │   ├── auth.api.ts
│   │   │   │   ├── rooms.api.ts
│   │   │   │   ├── friends.api.ts
│   │   │   │   ├── leaderboard.api.ts
│   │   │   │   └── messages.api.ts
│   │   │   ├── i18n/
│   │   │   │   └── en.json
│   │   │   └── styles/
│   │   │       └── tokens.css         ← CSS custom properties
│   │   ├── __tests__/                 ← Vitest unit tests
│   │   ├── e2e/                       ← Playwright tests
│   │   │   ├── fixtures/
│   │   │   │   └── auth.fixture.ts   ← Reusable login helper
│   │   │   ├── suite1-auth.spec.ts
│   │   │   ├── suite2-lobby.spec.ts
│   │   │   ├── suite3-phase10.spec.ts
│   │   │   ├── suite4-reconnect.spec.ts
│   │   │   ├── suite5-chat.spec.ts
│   │   │   ├── suite6-spectator.spec.ts
│   │   │   ├── suite7-friends.spec.ts
│   │   │   └── suite8-leaderboard.spec.ts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   │
│   ├── api-service/                   ← Express REST API
│   │   ├── src/
│   │   │   ├── index.ts               ← Express app entry
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts            ← JWT validation (dev + prod)
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
│   │   │   │   ├── health.routes.ts
│   │   │   │   └── test.routes.ts     ← TEST_MODE only endpoints
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── rooms.service.ts
│   │   │   │   ├── friends.service.ts
│   │   │   │   ├── leaderboard.service.ts
│   │   │   │   └── messages.service.ts
│   │   │   ├── db/
│   │   │   │   └── prisma.ts          ← Prisma client singleton
│   │   │   └── redis/
│   │   │       └── client.ts          ← Redis client singleton
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── socket-service/                ← Socket.io server
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── middleware/
│   │   │   │   └── socketAuth.ts
│   │   │   ├── namespaces/
│   │   │   │   ├── lobby.namespace.ts ← /lobby namespace handlers
│   │   │   │   └── game.namespace.ts  ← /game namespace handlers
│   │   │   ├── handlers/
│   │   │   │   ├── joinRoom.ts
│   │   │   │   ├── rejoinRoom.ts
│   │   │   │   ├── gameAction.ts
│   │   │   │   ├── tableChat.ts
│   │   │   │   └── presence.ts
│   │   │   ├── pubsub/
│   │   │   │   └── subscriber.ts      ← Redis pub-sub subscriber
│   │   │   └── games/
│   │   │       └── registry.ts
│   │   ├── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   └── worker-service/                ← BullMQ background worker
│       ├── src/
│       │   ├── index.ts
│       │   ├── queues/
│       │   │   ├── leaderboard.queue.ts
│       │   │   └── turnTimer.queue.ts
│       │   ├── processors/
│       │   │   ├── leaderboard.processor.ts
│       │   │   └── turnTimer.processor.ts
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
├── package.json                        ← Workspace root (npm workspaces)
├── turbo.json                          ← Turborepo build config
└── tsconfig.base.json                  ← Shared TS config
```

### 4.1 Import Aliases

Every app configures these path aliases. Agents must use them.

```typescript
// All apps — Vite (frontend) or tsconfig paths (backend)
'@shared/*'  → 'packages/shared-types/src/*'
'@cards/*'   → 'packages/cards-engine/src/*'
'@/*'        → 'src/*'  (within each app)
```

### 4.2 Naming Conventions

| Artifact | Convention | Example |
|---|---|---|
| React components | PascalCase `.tsx` | `GameTable.tsx` |
| React hooks | camelCase `use*.ts` | `useGameState.ts` |
| Services (backend) | camelCase `.service.ts` | `rooms.service.ts` |
| Route files | camelCase `.routes.ts` | `rooms.routes.ts` |
| Test files | same name + `.test.ts(x)` | `gameStore.test.ts` |
| Prisma model | PascalCase | `GameState` |
| Redis keys | `snake:case:hierarchy` | `presence:player:abc123` |
| Socket events | `snake_case` | `game_state_sync` |
| ENV variables | `SCREAMING_SNAKE_CASE` | `DATABASE_URL` |

---

## 5. Redis Key Schema

All services must use exactly these key patterns. No ad-hoc key invention.

```
# Presence
presence:player:{playerId}                STRING   "online"|"in-game"|"away"    TTL: 30s
presence:room:{playerId}                  STRING   roomId (when in-game)          TTL: 30s

# Game State (hot copy)
game:state:{roomId}                       STRING   JSON serialized GameState      TTL: none (deleted on game-over)
game:lock:{roomId}                        STRING   serverId (optimistic lock)     TTL: 5s

# Room membership
room:players:{roomId}                     SET      playerIds
room:spectators:{roomId}                  SET      playerIds

# Chat history
chat:history:{roomId}                     LIST     last 100 serialized ChatMessage (LPUSH + LTRIM)

# DM unread counts
dm:unread:{toPlayerId}:{fromPlayerId}     STRING   integer count

# Pub-Sub channels (publish only — no keys stored)
leaderboard:updated:{gameId}              CHANNEL
room:event:{roomId}                       CHANNEL

# BullMQ (managed by BullMQ, do not touch directly)
bull:{queueName}:*
```

---

## 6. React Route Map

React Router v6. Every route and its auth requirements.

| Path | Component | Auth Required | Notes |
|---|---|---|---|
| `/` | `LandingPage` | No | Redirects to `/lobby` if authenticated |
| `/lobby` | `LobbyPage` | Yes | Main hub post-login |
| `/table/:roomId` | `TablePage` | Yes | Game table |
| `/leaderboard` | `LeaderboardPage` | Yes | Leaderboard tab |
| `/settings` | `SettingsPage` | Yes | Profile + preferences |
| `*` | `NotFoundPage` | No | 404 fallback |

### 6.1 Route Guard Implementation

```typescript
// src/components/shared/ProtectedRoute.tsx
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

---

## 7. Zustand Store Shapes

These are the canonical client-side store interfaces. Agents must not invent different shapes.

```typescript
// src/store/authStore.ts
interface AuthState {
  player: PlayerProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setPlayer: (player: PlayerProfile, token: string) => void;
  clearAuth: () => void;
  refreshToken: () => Promise<void>;
}

// src/store/gameStore.ts
interface GameState_Store {
  // State
  room: Room | null;
  gameState: GameState | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  phase: GamePhase;
  selectedCardIds: string[];
  chatMessages: ChatMessage[];
  animationLocked: boolean;

  // Actions
  setRoom: (room: Room) => void;
  applySync: (state: GameState) => void;
  applyDelta: (delta: GameStateDelta) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  setConnectionStatus: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  addChatMessage: (msg: ChatMessage) => void;
  lockAnimation: () => void;
  unlockAnimation: () => void;
}

// src/store/lobbyStore.ts
interface LobbyState {
  // State
  rooms: Room[];
  totalRooms: number;
  filters: RoomListQuery;
  friends: FriendEntry[];
  pendingRequests: FriendRequest[];
  notificationCount: number;
  dmInbox: DMInboxEntry[];
  openDMThreads: string[];       // playerIds with open DM drawers

  // Actions
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

### 8.1 Philosophy

Authentication is fully swappable via the `AUTH_MODE` environment variable:

| `AUTH_MODE` | Frontend Provider | Backend Validation |
|---|---|---|
| `dev` | `DevAuthProvider` — issues local JWTs, presents a login form with test user selection | `validateDevToken()` — verifies with local HMAC secret |
| `production` | `MsalAuthProvider` — full AAD-B2C MSAL flow | `validateMsalToken()` — verifies against B2C JWKS endpoint |

No production auth code runs in dev mode. No dev shortcuts exist in production builds. The `AuthProvider.tsx` is the single switchboard:

```typescript
// src/auth/AuthProvider.tsx
export function AuthProvider({ children }: { children: ReactNode }) {
  if (import.meta.env.VITE_AUTH_MODE === 'production') {
    return <MsalAuthProvider>{children}</MsalAuthProvider>;
  }
  return <DevAuthProvider>{children}</DevAuthProvider>;
}
```

### 8.2 Dev Auth — Local JWT Issuer

The API service in `dev` mode exposes a `POST /api/v1/dev/token` endpoint that accepts a username and returns a signed JWT. This endpoint is **completely absent** from production builds (guarded by `if (process.env.AUTH_MODE !== 'dev') return`).

```typescript
// apps/api-service/src/routes/dev.routes.ts
// ONLY registered when AUTH_MODE === 'dev'

router.post('/dev/token', (req, res) => {
  const { username, role = 'player' } = req.body;
  
  const payload: DevTokenPayload = {
    sub: `dev-${username}`,
    oid: `dev-${username}`,
    name: username,
    extension_DisplayName: username,
    extension_PlayerRole: role,
    emails: [`${username}@dev.local`],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const token = jwt.sign(payload, process.env.DEV_JWT_SECRET!, {
    algorithm: 'HS256',
  });

  res.json({ token, expiresIn: 3600 });
});
```

```typescript
// src/auth/DevAuthProvider.tsx
// Renders a simple "Select test user" login form
// On submit: calls POST /api/v1/dev/token, stores token in sessionStorage
// Implements the same useAuth() interface as MsalAuthProvider
```

### 8.3 Dev Auth — Test Users

The following test users are pre-seeded in the database via `prisma/seed.ts`:

```typescript
const TEST_USERS = [
  { username: 'test-player-1', role: 'player', displayName: 'TestPlayer1' },
  { username: 'test-player-2', role: 'player', displayName: 'TestPlayer2' },
  { username: 'test-player-3', role: 'player', displayName: 'TestPlayer3' },
  { username: 'test-moderator', role: 'moderator', displayName: 'TestMod' },
  { username: 'test-admin',     role: 'admin',     displayName: 'TestAdmin' },
];
```

Playwright E2E tests always use `test-player-1` and `test-player-2`. The auth fixture calls `POST /api/v1/dev/token` directly (bypassing the UI) to obtain tokens, then injects them into browser context storage.

### 8.4 Playwright Auth Fixture

```typescript
// e2e/fixtures/auth.fixture.ts
import { test as base, Page } from '@playwright/test';

export type AuthFixture = {
  player1Page: Page;
  player2Page: Page;
};

export const test = base.extend<AuthFixture>({
  player1Page: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await injectDevToken(page, 'test-player-1');
    await use(page);
    await ctx.close();
  },
  player2Page: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await injectDevToken(page, 'test-player-2');
    await use(page);
    await ctx.close();
  },
});

async function injectDevToken(page: Page, username: string) {
  const res = await fetch(`${process.env.API_URL}/api/v1/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const { token } = await res.json();
  await page.goto('/');
  await page.evaluate((t) => sessionStorage.setItem('auth_token', t), token);
}
```

### 8.5 Production AAD-B2C Configuration

When `AUTH_MODE=production`, the following additional environment variables are required:

```bash
# B2C Tenant
VITE_AAD_TENANT_NAME=<tenant-name>
VITE_AAD_TENANT_ID=<tenant-guid>
VITE_AAD_CLIENT_ID=<app-registration-client-id>
VITE_AAD_SIGNIN_POLICY=B2C_1_signupsignin
VITE_AAD_PROFILEEDIT_POLICY=B2C_1_profileedit
VITE_AAD_PASSWORDRESET_POLICY=B2C_1_passwordreset
VITE_AAD_API_SCOPE=https://<tenant-name>.onmicrosoft.com/<api-app-id>/access_as_user
VITE_REDIRECT_URI=https://<platform-domain>/

# Server-side validation
AAD_TENANT_ID=<tenant-guid>
AAD_CLIENT_ID=<app-registration-client-id>
```

**B2C setup checklist** (human operator task, not automatable by agents):
- [ ] Create B2C tenant in Azure Portal
- [ ] Register two applications: `card-platform-spa` and `card-platform-api`
- [ ] Create user flows: `B2C_1_signupsignin`, `B2C_1_profileedit`, `B2C_1_passwordreset`
- [ ] Add custom claims: `extension_DisplayName`, `extension_AvatarUrl`, `extension_PlayerRole`
- [ ] Create two test accounts in the B2C tenant
- [ ] Populate the production `.env` with the values above

The production `MsalAuthProvider` and `validateMsalToken()` implementations are written and tested using mock JWKS in unit tests. They simply don't execute unless `AUTH_MODE=production`.

### 8.6 useAuth() Interface (Same in Both Modes)

```typescript
// src/auth/useAuth.ts — both providers implement this exact interface
interface AuthContext {
  player: PlayerProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<string>;
}
```

---

## 9. TypeScript Interface Library

Lives in `packages/shared-types/src/`. Consumed by all services.

### 9.1 Auth

```typescript
// auth.ts
export interface DevTokenPayload {
  sub: string;
  oid: string;
  name: string;
  emails: string[];
  extension_DisplayName: string;
  extension_AvatarUrl?: string;
  extension_PlayerRole: PlayerRole;
  iat: number;
  exp: number;
}

export type MsalTokenPayload = DevTokenPayload; // Same shape — B2C policy produces identical claims

export type PlayerRole = 'player' | 'moderator' | 'admin';

export interface PlayerProfile {
  id: string;
  aadObjectId: string;
  displayName: string;
  avatarUrl?: string;
  role: PlayerRole;
  createdAt: string;
  lastSeenAt: string;
}

export interface PublicPlayerProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
}
```

### 9.2 Cards

```typescript
// cards.ts
export type DeckType = 'standard' | 'phase10';
export type Phase10Color = 'red' | 'blue' | 'green' | 'yellow';
export type CardType = 'number' | 'wild' | 'skip' | 'face';
export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardValue =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13
  | 'jack' | 'queen' | 'king' | 'ace'
  | 'wild' | 'skip';

export interface Card {
  id: string;
  deckType: DeckType;
  cardType: CardType;
  value: CardValue;
  suit?: CardSuit;           // standard deck only
  color?: Phase10Color;      // phase10 deck only
  faceUp: boolean;
  pointValue: number;
}

export interface CardDefinition {
  id: string;
  faceImagePath: string;
  altText: string;
  color?: Phase10Color;
  value: CardValue;
  cardType: CardType;
  pointValue: number;
}

export interface DeckDefinition {
  id: DeckType;
  name: string;
  cards: CardDefinition[];
  backImagePath: string;
}

export interface AnimationOptions {
  duration: number;
  easing?: string;
  stagger?: number;
  onComplete?: () => void;
}

export interface HandOptions {
  spread: number;
  overlap: number;
  fanned: boolean;
  maxVisible?: number;
}
```

### 9.3 Game State

```typescript
// gameState.ts
export type GamePhase =
  | 'waiting' | 'dealing' | 'player-turn'
  | 'animating' | 'round-over' | 'game-over';

export interface GameState {
  roomId: string;
  gameId: string;
  version: number;
  phase: GamePhase;
  players: GamePlayer[];
  currentTurnPlayerId: string;
  drawPileCount: number;
  discardPile: Card[];
  round: number;
  startedAt: string;
  turnDeadline?: string;
}

export interface GamePlayer {
  playerId: string;
  displayName: string;
  avatarUrl?: string;
  seatIndex: number;
  hand: Card[];
  handCount: number;
  isConnected: boolean;
  turnSkipped: boolean;
  score?: number;
  currentPhase?: number;        // Phase 10
  completedPhases?: number[];   // Phase 10
  phaseMelds?: PhaseMeld[];     // Phase 10
}

export interface PhaseMeld {
  meldId: string;
  ownerId: string;
  meldType: 'set' | 'run' | 'color';
  cards: Card[];
}

export interface PlayerAction {
  type: ActionType;
  payload: ActionPayload;
  clientVersion: number;
}

export type ActionType =
  | 'draw-from-pile' | 'draw-from-discard' | 'discard'
  | 'lay-down-phase' | 'hit-meld' | 'play-card'
  | 'use-skip' | 'declare-gin' | 'knock'
  | 'peg' | 'play-to-trick';

export type ActionPayload =
  | DrawPayload | DiscardPayload | LayDownPhasePayload
  | HitMeldPayload | PlayCardPayload | UseSkipPayload;

export interface DrawPayload { source: 'pile' | 'discard'; }
export interface DiscardPayload { cardId: string; }
export interface LayDownPhasePayload {
  melds: Array<{ meldType: 'set' | 'run' | 'color'; cardIds: string[] }>;
}
export interface HitMeldPayload { meldId: string; cardIds: string[]; }
export interface PlayCardPayload { cardId: string; targetMeldId?: string; }
export interface UseSkipPayload { cardId: string; targetPlayerId: string; }

export interface GameStateDelta {
  version: number;
  ops: JsonPatchOp[];
}
export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

export interface GameResult {
  roomId: string;
  gameId: string;
  completedAt: string;
  winnerId: string;
  rankings: PlayerRanking[];
}
export interface PlayerRanking {
  playerId: string;
  rank: number;
  primaryScore: number;
  secondaryScore?: number;
  phasesCompleted?: number;
}

export type GameErrorCode =
  | 'VERSION_MISMATCH' | 'NOT_YOUR_TURN' | 'INVALID_CARD'
  | 'INVALID_PHASE' | 'PHASE_ALREADY_LAID' | 'CANNOT_HIT_BEFORE_PHASE'
  | 'MUST_DISCARD' | 'SKIP_CANNOT_BE_IN_PHASE';
```

### 9.4 Rooms

```typescript
// rooms.ts
export type RoomStatus = 'waiting' | 'in-progress' | 'finished' | 'abandoned';
export type ParticipantRole = 'player' | 'spectator';
export type OnlineStatus = 'online' | 'in-game' | 'away' | 'offline';

export interface Room {
  id: string;
  gameId: string;
  name: string;
  host: PublicPlayerProfile;
  maxPlayers: number;
  isPrivate: boolean;
  allowSpectators: boolean;
  asyncMode: boolean;
  status: RoomStatus;
  deckType: DeckType;
  participants: RoomParticipant[];
  spectators: RoomParticipant[];
  createdAt: string;
}

export interface RoomParticipant {
  id: string;
  player: PublicPlayerProfile;
  seatIndex: number;
  role: ParticipantRole;
  joinedAt: string;
  isConnected: boolean;
}

export interface CreateRoomPayload {
  gameId: string;
  name?: string;
  maxPlayers: number;
  isPrivate: boolean;
  password?: string;
  allowSpectators: boolean;
  asyncMode: boolean;
  deckType: DeckType;
  gameVariant?: string;
}

export interface JoinRoomPayload { password?: string; }

export interface SpectatorApprovalPayload {
  requestingPlayerId: string;
  approved: boolean;
}

export interface RoomListQuery {
  gameId?: string;
  status?: RoomStatus;
  deckType?: DeckType;
  hasOpenSeats?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedRooms {
  rooms: Room[];
  total: number;
  page: number;
  pageSize: number;
}
```

### 9.5 Chat

```typescript
// chat.ts
export interface ChatMessage {
  id: string;
  roomId?: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  senderRole: ParticipantRole | 'system';
  isSpectator: boolean;
  body: string;
  sentAt: string;
  reactions: MessageReaction[];
  isSystemMessage: boolean;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  playerIds: string[];
}

export interface SendTableMessagePayload { body: string; }
export interface ReactToMessagePayload { messageId: string; emoji: string; }

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  sentAt: string;
  readAt?: string;
}

export interface SendDirectMessagePayload {
  toPlayerId: string;
  body: string;
}

export interface DMInboxEntry {
  withPlayer: PublicPlayerProfile;
  lastMessage: DirectMessage;
  unreadCount: number;
}
```

### 9.6 Friends

```typescript
// friends.ts
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendEntry {
  friendship: { id: string; createdAt: string };
  player: PublicPlayerProfile;
  status: OnlineStatus;
  currentRoomId?: string;
}

export interface FriendRequest {
  id: string;
  sender: PublicPlayerProfile;
  receiver: PublicPlayerProfile;
  status: FriendRequestStatus;
  createdAt: string;
}

export interface SendFriendRequestPayload { targetPlayerId: string; }
export interface RespondFriendRequestPayload {
  status: 'accepted' | 'declined';
}
export interface BlockPayload { targetPlayerId: string; }
```

### 9.7 Leaderboards

```typescript
// leaderboard.ts
export type LeaderboardScope = 'global' | 'friends';
export type LeaderboardPeriod = 'all-time' | string; // 'YYYY-MM'

export interface LeaderboardEntry {
  rank: number;
  player: PublicPlayerProfile;
  primaryScore: number;
  secondaryScore?: number;
  gamesPlayed: number;
  lastActiveAt: string;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  gameId: string;
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  currentUserEntry?: LeaderboardEntry;
  total: number;
  page: number;
  pageSize: number;
}

export interface LeaderboardQuery {
  gameId: string;
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  page?: number;
  pageSize?: number;
}
```

### 9.8 Game Engine

```typescript
// gameEngine.ts
export type GameCategory = 'rummy' | 'cribbage' | 'trick-taking' | 'other';

export interface IGameEngine {
  readonly id: string;
  readonly name: string;
  readonly category: GameCategory;
  readonly deckType: DeckType;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly supportsAsync: boolean;
  readonly rankingMetric: RankingMetric;
  readonly variants: GameVariant[];

  startGame(players: GameEnginePlayer[]): GameState;
  applyAction(state: GameState, action: PlayerAction): GameState;
  isGameOver(state: GameState): boolean;
  computeResult(state: GameState): GameResult;
  handleDisconnect(state: GameState, playerId: string): DisconnectPolicy;
  getSystemMessages(prev: GameState, next: GameState): string[];
}

export interface RankingMetric {
  primaryMetricLabel: string;
  secondaryMetricLabel?: string;
  higherIsBetter: boolean;
  minimumGames: number;
}

export interface GameVariant { id: string; name: string; description: string; }
export interface GameEnginePlayer {
  playerId: string;
  displayName: string;
  seatIndex: number;
}
export interface GameCatalogEntry {
  id: string;
  name: string;
  category: GameCategory;
  deckType: DeckType;
  minPlayers: number;
  maxPlayers: number;
  supportsAsync: boolean;
  variants: GameVariant[];
  activeRoomCount: number;
}

export type DisconnectPolicy = 'pause' | 'ai-fill' | 'end-round' | 'continue';

export class InvalidActionError extends Error {
  constructor(message: string, public code: GameErrorCode) { super(message); }
}
```

### 9.9 Socket Payloads

```typescript
// socket.ts
export interface RoomStatePayload { room: Room; }
export interface PlayerJoinedPayload { participant: RoomParticipant; }
export interface PlayerLeftPayload { playerId: string; }
export interface PlayerDisconnectedPayload {
  playerId: string;
  reconnectDeadlineSeconds: number;
}
export interface PlayerReconnectedPayload { playerId: string; }
export interface GameStartingPayload { countdownSeconds: number; }
export interface GameStateSyncPayload { state: GameState; }
export interface GameStateDeltaPayload { delta: GameStateDelta; }
export interface GameOverPayload { result: GameResult; }
export interface GamePausedPayload {
  reason: 'player-disconnected' | 'token-expired' | 'host-paused';
  affectedPlayerId?: string;
}
export interface InvalidActionPayload { error: string; code: GameErrorCode; }
export interface TurnTimerPayload { playerId: string; secondsRemaining: number; }
export interface PresenceUpdatePayload {
  playerId: string;
  status: OnlineStatus;
  currentRoomId?: string;
}
export interface SpectatorRequestPayload {
  requestingPlayer: PublicPlayerProfile;
  roomId: string;
}
export interface SpectatorApprovedPayload { roomId: string; approved: boolean; }
export interface LeaderboardUpdatedPayload { gameId: string; }
export interface AuthTokenRequest { token: string; }
```

### 9.10 API Error Envelope

```typescript
// All API error responses conform to this shape
export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
```

---

## 10. Epic 1 — Auth & Identity

*(Stories 1.1–1.5 from v2.0 are retained verbatim. Key addition: dev mode stories.)*

### Story 1.0 — Dev Auth Token Endpoint (P0)

**As a** Developer, **I want** a local JWT endpoint in dev mode **so that** the full platform can be tested without Azure AD B2C credentials.

**Acceptance Criteria:**

```gherkin
Given AUTH_MODE=dev and the API service starts
When GET /api/v1/dev/users is called
Then it returns the 5 test users list

Given AUTH_MODE=dev
When POST /api/v1/dev/token { username: "test-player-1" } is called
Then it returns { token: "<valid-jwt>", expiresIn: 3600 }
  And the JWT is verifiable with DEV_JWT_SECRET using HS256
  And the JWT contains sub, oid, extension_DisplayName, extension_PlayerRole claims

Given AUTH_MODE=production
When POST /api/v1/dev/token is called (any request)
Then the server returns HTTP 404 (route does not exist)

Given the Playwright auth fixture calls POST /api/v1/dev/token
When the token is injected into sessionStorage
Then navigating to /lobby renders the authenticated state
  And player display name matches "TestPlayer1"
```

*(Stories 1.1–1.5 from v2.0 apply unchanged. In dev mode, "sign in" shows the test user picker form.)*

---

## 11–20. Epics 2–11

*(All Epic content from v2.0 §6–§15 is incorporated here unchanged — Phase 10 card design in §11/Story 2.3, Lobby in §12, Game Table in §13, Chat in §14, Friends in §15, Leaderboards in §16, Game Catalog in §17, Resilience in §18, Infrastructure in §19, Accessibility in §20.)*

**One addition to Epic 10 — Infrastructure:**

### Story 10.6 — Environment Variable Manifest (P0)

The `.env.example` at the repo root documents every variable. Agents must keep this file updated when adding new env vars.

```bash
# .env.example

# ── Auth ──────────────────────────────────────────────────────
AUTH_MODE=dev                          # 'dev' | 'production'
DEV_JWT_SECRET=change-me-in-dev       # HS256 secret for dev JWT signing

# Production only (ignored when AUTH_MODE=dev)
VITE_AAD_TENANT_NAME=
VITE_AAD_TENANT_ID=
VITE_AAD_CLIENT_ID=
VITE_AAD_SIGNIN_POLICY=B2C_1_signupsignin
VITE_AAD_PROFILEEDIT_POLICY=B2C_1_profileedit
VITE_AAD_PASSWORDRESET_POLICY=B2C_1_passwordreset
VITE_AAD_API_SCOPE=
VITE_REDIRECT_URI=http://localhost:5173/
AAD_TENANT_ID=
AAD_CLIENT_ID=

# ── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://cardplatform:cardplatform@localhost:5432/cardplatform

# ── Redis ─────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Services ──────────────────────────────────────────────────
API_PORT=3001
SOCKET_PORT=3002
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3002
CORS_ORIGIN=http://localhost:5173

# ── Web Push (async notifications) ───────────────────────────
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@platform.local

# ── Worker ────────────────────────────────────────────────────
LEADERBOARD_UPDATE_INTERVAL_MS=30000
TURN_TIMER_DEFAULT_SECONDS=86400

# ── Feature flags ─────────────────────────────────────────────
TEST_MODE=false          # Enables /api/v1/test/* endpoints (CI only)
```

---

## 21. WebSocket Event Reference

*(Full event tables from v2.0 §16 apply unchanged.)*

---

## 22. REST API Reference

*(Full API table from v2.0 §17 applies unchanged, with one addition:)*

### 22.1 Dev & Test Endpoints

These endpoints only exist when `AUTH_MODE=dev` OR `TEST_MODE=true`:

| Method | Path | Body | Response | Guard |
|---|---|---|---|---|
| `GET` | `/api/v1/dev/users` | — | `DevUser[]` | `AUTH_MODE=dev` |
| `POST` | `/api/v1/dev/token` | `{ username, role? }` | `{ token, expiresIn }` | `AUTH_MODE=dev` |
| `POST` | `/api/v1/test/force-game-over` | `{ roomId, winnerId }` | `{ success }` | `TEST_MODE=true` |
| `POST` | `/api/v1/test/advance-leaderboard` | `{ gameId }` | `{ success }` | `TEST_MODE=true` |
| `DELETE` | `/api/v1/test/reset-room` | `{ roomId }` | `{ success }` | `TEST_MODE=true` |

---

## 23. TDD & Playwright Strategy

*(Full strategy from v2.0 §18 applies. Key addition: all Playwright suites use the `auth.fixture.ts` from §8.4 instead of any MSAL-dependent flow. No B2C is required for any test.)*

---

---

# PART B — AGENT ORCHESTRATION PLAYBOOK

---

## 24. Agent Role Definitions

These are Claude Code subagent definition files. Place them in `.claude/agents/` in the repo root. Each file is a Markdown document with YAML frontmatter that Claude Code reads when spawning that agent type.

---

### 24.1 `CLAUDE.md` — Project Context File

This file is loaded automatically by Claude Code for every session. It is the single most important file in the repo.

```markdown
# Card Platform — CLAUDE.md

## What This Project Is
A multiplayer browser-based card game platform. Full spec is in SPEC.md at the repo root.
Read SPEC.md before writing any code.

## Absolute Rules (Never Break These)
1. All TypeScript interfaces come from packages/shared-types. Never invent local types that duplicate them.
2. All Redis keys follow the schema in SPEC.md §5. Never use ad-hoc keys.
3. All file paths follow the directory structure in SPEC.md §4. Never create files in unlisted locations.
4. Every route, store slice, and component must match the maps in SPEC.md §6 and §7.
5. AUTH_MODE guards every dev-only code path. Production builds must never contain dev shortcuts.
6. Test-first: write the failing test before writing implementation code.
7. Never commit a console.log to main. Use the logger utility.
8. Every new .env variable must be added to .env.example with a comment.
9. Playwright screenshots must be taken at every checkpoint listed in SPEC.md §23.
10. All user-facing strings go in src/i18n/en.json. No hardcoded English in JSX.

## Current Auth Mode
AUTH_MODE=dev — using local JWT issuer. MSAL code is written but not active.

## Stack Quick Reference
- Frontend: React 18 + Vite 5 + TypeScript strict + Zustand + React Query + shadcn/ui + Tailwind
- API: Node 20 + Express 4 + Prisma 5 + PostgreSQL 16
- Socket: Node 20 + Socket.io v4 + Redis 7
- Worker: Node 20 + BullMQ
- Tests: Vitest (FE), Jest (BE), Playwright (E2E)
- Cards: packages/cards-engine (cards.js fork)

## How Tests Work
- `npm test` in any app runs unit tests
- `npm run test:e2e` from repo root runs Playwright against docker-compose.test.yml
- All unit tests must pass before any agent marks a story complete
- All Playwright tests must pass and produce screenshots before an epic is marked done

## Definition of Done for Any Story
1. Implementation code written
2. Unit tests written and passing (coverage threshold met)
3. Code reviewed by reviewer agent (no blocking issues)
4. Playwright test written (if story has UI)
5. Screenshots produced at all checkpoints
6. No TypeScript errors (`tsc --noEmit` passes)
7. No ESLint errors
8. CLAUDE.md updated if new patterns introduced
```

---

### 24.2 `.claude/agents/architect.md`

```markdown
---
name: architect
description: >
  System architect. Use when: starting a new epic, designing a new service boundary,
  defining data models, designing socket event flows, or when the implementer
  encounters a design decision that isn't resolved in the spec.
  Do NOT use for writing implementation code or tests.
tools: Read, Grep, Glob, WebFetch
model: claude-opus-4-6
permissionMode: default
---

You are the senior architect for the Card Platform project.

Your responsibilities:
- Read SPEC.md and CLAUDE.md before every response
- Produce detailed technical designs when asked: data flow diagrams (as ASCII),
  interface definitions, sequence diagrams, database schema decisions
- Identify spec gaps or ambiguities and produce a decision document
- Review the existing codebase to ensure your designs are consistent
- Never write implementation code — produce designs and specifications only
- Output design documents to .claude/decisions/{topic}-{date}.md

When asked to design a solution:
1. Read the relevant epic and stories from SPEC.md
2. Read existing related code in the repo
3. Identify all interfaces involved (from packages/shared-types)
4. Produce a written design with: data flow, edge cases, error handling, and test strategy
5. List any spec ambiguities that need resolution before implementation begins
```

---

### 24.3 `.claude/agents/implementer.md`

```markdown
---
name: implementer
description: >
  Primary code writer. Use for: implementing stories, writing new files,
  modifying existing files. Always works test-first.
  One implementer per epic at a time to avoid file conflicts.
tools: Read, Write, Edit, Bash, Grep, Glob
model: claude-sonnet-4-6
permissionMode: default
---

You are the lead implementer for the Card Platform project.

Your responsibilities:
- Read CLAUDE.md and the relevant epic stories before writing any code
- Write code test-first: failing test → minimum implementation → refactor
- Follow all naming conventions in CLAUDE.md exactly
- Use shared types from packages/shared-types — never duplicate interfaces
- Use Redis keys exactly as defined in SPEC.md §5
- Never hardcode strings in JSX — use i18n keys
- After each story implementation, run: npm test in the relevant app
- Report: files created/modified, test results, any spec gaps encountered

When implementing a story:
1. Read the story's acceptance criteria carefully
2. Write the test file first (describe the behavior, not the implementation)
3. Run the test to confirm it fails for the right reason
4. Write minimum code to make it pass
5. Refactor
6. Run npm test — confirm all tests pass
7. Report results to the orchestrator
```

---

### 24.4 `.claude/agents/reviewer.md`

```markdown
---
name: reviewer
description: >
  Code quality reviewer. Use AFTER implementer completes a story or batch of stories.
  Reviews for: correctness, spec compliance, security, performance, accessibility.
  Never implements — produces a structured review report only.
tools: Read, Grep, Glob, Bash
model: claude-sonnet-4-6
permissionMode: readOnly
---

You are the senior code reviewer for the Card Platform project.

Your review must cover ALL of the following. For each item, rate: PASS / WARN / FAIL.
A FAIL on any item blocks the story from being marked done.

## Review Checklist

### Spec Compliance
- [ ] Story acceptance criteria fully implemented (check each Given/When/Then)
- [ ] File locations match SPEC.md §4 directory structure
- [ ] Redis keys match SPEC.md §5 schema exactly
- [ ] Socket event names match SPEC.md §21 exactly
- [ ] API routes match SPEC.md §22 exactly

### Type Safety
- [ ] No `any` types without explicit justification comment
- [ ] All cross-service data uses interfaces from packages/shared-types
- [ ] `tsc --noEmit` passes in the affected app

### Auth & Security
- [ ] Dev-only code is guarded by AUTH_MODE/TEST_MODE checks
- [ ] No secrets hardcoded or logged
- [ ] All authenticated routes use authMiddleware
- [ ] JWT validation covers: expiry, signature, audience

### Testing
- [ ] Unit tests cover happy path AND at least 2 error cases per function
- [ ] Coverage threshold met (≥80% FE, ≥85% BE)
- [ ] Tests test behavior, not implementation details

### Code Quality
- [ ] No console.log (use logger)
- [ ] Error handling present and meaningful
- [ ] No hardcoded English strings in JSX (use i18n keys)
- [ ] Functions are < 40 lines; complex logic is extracted

### Accessibility (frontend only)
- [ ] Interactive elements have aria-labels or associated labels
- [ ] Color is not the sole information carrier
- [ ] Focus management correct in modals

## Output Format
Produce a structured report:
```
## Review Report — {Story ID} — {date}
### Summary: PASS | FAIL (N blocking issues)
### Blocking Issues (FAIL items)
  1. [file:line] Description — Required fix
### Warnings (WARN items)
  1. [file:line] Description — Suggested improvement
### Passed Checks
  - List of passed items
```
Save to: .claude/reviews/{story-id}-review.md
```

---

### 24.5 `.claude/agents/tester.md`

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

### 24.6 `.claude/agents/devops.md`

```markdown
---
name: devops
description: >
  Infrastructure and containerization engineer.
  Use for: Dockerfiles, Kubernetes manifests, GitHub Actions workflows,
  docker-compose files, nginx config, environment configuration.
  Does not write application code.
tools: Read, Write, Edit, Bash, Grep, Glob
model: claude-sonnet-4-6
permissionMode: default
---

You are the DevOps engineer for the Card Platform project.

Your responsibilities:
- Dockerfile: multi-stage builds (build stage: node:20, production: node:20-alpine)
  - No devDependencies in production images
  - No secrets baked into images
  - Images < 200MB
- Kubernetes: follow manifest structure in SPEC.md §4 k8s/ directory
  - HPA targets as defined in SPEC.md §19
  - Sticky sessions for socket-service (cookie affinity)
  - Health check: GET /health → 200 within 3 seconds
- nginx.conf for frontend: SPA fallback routing, gzip, cache headers for SVGs/JS
- GitHub Actions: per SPEC.md §23 CI/CD pipeline
- docker-compose.yml: local dev stack (all 5 services + postgres + redis)
- docker-compose.test.yml: CI stack (same but TEST_MODE=true, no volumes)

After any infrastructure change:
- Run `docker-compose up --build` to verify build succeeds
- Verify health endpoints respond
- Report: what was changed and verification result
```

---

## 25. Master Orchestrator Prompt

This is the prompt you paste into a new Claude Code session to begin the entire build. It reads the spec, plans the work units, and manages the sub-agent team through the full implementation.

---

```
You are the Master Orchestrator for the Card Platform build.

## Your Mission
Coordinate a team of specialized sub-agents to implement the Card Platform product 
specification from SPEC.md, one work unit at a time, until the full platform is built, 
tested, and passing all Playwright E2E suites.

## Environment Setup (Do This First)
Before spawning any agents:
1. Read SPEC.md in its entirety
2. Read CLAUDE.md
3. Confirm the following files exist at repo root:
   - SPEC.md
   - CLAUDE.md
   - .env (copied from .env.example with DEV values filled in)
   - docker-compose.yml
   - package.json (workspace root)
4. Run: docker-compose up -d postgres redis
5. Confirm postgres and redis are healthy before proceeding
6. Initialize task list at: .claude/tasks/master-task-list.md

## Work Unit Sequence
Process these work units in strict order. Do not start a work unit until the 
previous one is fully DONE (all tests passing, review approved).

### Unit 0 — Scaffolding (no agent team needed, do this yourself)
Create the directory structure from SPEC.md §4 exactly.
Create package.json files for each workspace.
Create tsconfig files.
Create .env from .env.example with dev values.
Create CLAUDE.md.
Create all sub-agent definition files in .claude/agents/.
Mark DONE when: `npm install` succeeds from repo root.

### Unit 1 — Shared Types Package
Spawn: implementer
Task: Implement packages/shared-types/src/ with all interfaces from SPEC.md §9.
     Write index.ts that re-exports all.
     Write a __tests__/types.test.ts that imports every exported type (compile check).
Then spawn: reviewer (review implementer output)
If reviewer finds FAIL items: spawn implementer again with the review report.
Loop implementer → reviewer until review PASSES.
Mark DONE when: `npm run build` in packages/shared-types succeeds with zero errors.

### Unit 2 — Database Schema & Seed
Spawn: implementer
Task: Implement apps/api-service/prisma/schema.prisma from SPEC.md §9 data models.
     Write prisma/seed.ts with all 5 test users.
     Run: npx prisma migrate dev --name init
     Run: npx prisma db seed
     Write __tests__/schema.test.ts verifying seed data exists.
Then spawn: reviewer
Loop until PASS.
Mark DONE when: all seed users exist in DB and tests pass.

### Unit 3 — Auth Middleware & Dev Token Endpoint
Spawn: architect
Task: Design the auth middleware strategy document covering both dev and production
     modes. Save to .claude/decisions/auth-middleware.md.
Then spawn: implementer
Task: Implement apps/api-service/src/middleware/auth.ts and dev.routes.ts 
     per SPEC.md §8 and Story 1.0.
     Implement apps/frontend/src/auth/ (AuthProvider, DevAuthProvider, useAuth).
     Write unit tests for both middleware modes.
Then spawn: reviewer → loop until PASS.
Then spawn: tester (Suite 1 — Authentication)
Loop tester until all Suite 1 tests pass and screenshots produced.
Mark DONE when: Suite 1 Playwright passes.

### Unit 4 — cards-engine Package (Phase 10 Deck)
Spawn: implementer
Task: Implement packages/cards-engine per SPEC.md §11.
     Generate all 60 Phase 10 SVG card faces per Story 2.3 visual specification.
     Implement AnimationEngine with all methods from Story 2.4.
     Write unit tests for deck composition, animation timing, alt text.
Then spawn: reviewer → loop until PASS.
Mark DONE when: package builds and all unit tests pass.

### Unit 5 — REST API Core (Rooms, Players, Games)
Spawn: implementer
Task: Implement api-service routes: health, games, rooms, players per SPEC.md §22.
     Implement services layer.
     Implement Redis client singleton.
     Write supertest integration tests for all routes (happy + error paths).
Then spawn: reviewer → loop until PASS.
Mark DONE when: all API tests pass.

### Unit 6 — Socket Service Core
Spawn: architect
Task: Design socket service handler sequence for join_room, rejoin_room, game_action.
     Save to .claude/decisions/socket-architecture.md.
Then spawn: implementer
Task: Implement socket-service per SPEC.md §21 (/lobby and /game namespaces).
     Implement socket auth middleware (dev + production modes).
     Implement Redis pub-sub subscriber.
     Write socket integration tests using socket.io-client in Jest.
Then spawn: reviewer → loop until PASS.
Mark DONE when: socket tests pass including reconnection scenario.

### Unit 7 — Phase 10 Game Engine
Spawn: implementer
Task: Implement apps/socket-service/src/games/phase10/engine.ts implementing IGameEngine.
     All 10 phases, Wild rules, Skip rules, scoring, turn structure.
     Write exhaustive Jest tests per SPEC.md §23 §18.3 game engine tests.
     Every acceptance criterion in Story 4.4 must have a corresponding test.
Then spawn: reviewer → loop until PASS.
Mark DONE when: engine tests pass at ≥85% coverage.

### Unit 8 — Frontend: Lobby
Spawn: implementer
Task: Implement React frontend lobby: LandingPage, LobbyPage, GameBrowser, 
     RoomBrowserModal, CreateRoomModal, FilterSidebar, Social Panel.
     Connect to API and socket services.
     Implement Zustand stores per SPEC.md §7.
     Write Vitest unit tests for stores and key components.
Then spawn: reviewer → loop until PASS.
Then spawn: tester (Suite 2 — Lobby)
Loop tester until Suite 2 passes with screenshots.
Mark DONE when: Suite 2 Playwright passes.

### Unit 9 — Frontend: Game Table
Spawn: implementer
Task: Implement TablePage, GameTable, PlayerSeat, CardComponent, ActionBar.
     Implement drag-and-drop with @dnd-kit.
     Implement keyboard navigation (Tab, Space, D, Escape).
     Connect game socket events to gameStore.
     Write Vitest unit tests for gameStore state machine transitions.
Then spawn: reviewer → loop until PASS.
Then spawn: tester (Suite 3 — Phase 10 Turn Play)
Loop tester until Suite 3 passes.
Mark DONE when: Suite 3 Playwright passes.

### Unit 10 — Reconnection & Resilience
Spawn: implementer
Task: Implement reconnection logic: socket exponential backoff, rejoin_room handler,
     full state sync on reconnect, token refresh flow, connection status banner.
     Write Jest tests for server-side disconnect handling.
Then spawn: reviewer → loop until PASS.
Then spawn: tester (Suite 4 — Reconnection)
Loop tester until Suite 4 passes (including setOffline/setOnline).
Mark DONE when: Suite 4 Playwright passes.

### Unit 11 — Chat & Messaging
Spawn: implementer
Task: Implement TableChat, DMDrawer, MessageBubble, emoji reactions.
     Implement /lobby namespace DM handlers.
     Implement chat history delivery on join.
     Write unit and socket tests.
Then spawn: reviewer → loop until PASS.
Then spawn: tester (Suite 5 — Chat, Suite 6 — Spectator)
Loop tester until both suites pass.
Mark DONE when: Suites 5 & 6 pass.

### Unit 12 — Friends & Social Graph
Spawn: implementer
Task: Implement friends API routes, services, and frontend components.
     Implement friend request flow (send, receive, accept, decline, block).
     Implement presence updates in social panel.
     Implement room invite flow.
Then spawn: reviewer → loop until PASS.
Then spawn: tester (Suite 7 — Friends)
Loop tester until Suite 7 passes.
Mark DONE when: Suite 7 Playwright passes.

### Unit 13 — Leaderboards
Spawn: implementer
Task: Implement BullMQ worker leaderboard processor.
     Implement leaderboard API routes (global + friends scopes, monthly + all-time).
     Implement LeaderboardTable frontend component.
     Implement Redis pub-sub → socket → React Query cache invalidation pipeline.
Then spawn: reviewer → loop until PASS.
Then spawn: tester (Suite 8 — Leaderboard)
Loop tester until Suite 8 passes (including < 5 second update assertion).
Mark DONE when: Suite 8 Playwright passes.

### Unit 14 — Additional Game Engines (Priority 1)
Spawn: implementer (one engine at a time — separate loops)
Implement: RummyEngine, GinRummyEngine, CanastEngine (each with full tests)
Each engine: implementer → reviewer loop until PASS.
Mark DONE when: all 3 engines have passing tests.

### Unit 15 — Infrastructure & DevOps
Spawn: devops
Task: Dockerfiles for all 4 services. nginx.conf for frontend.
     docker-compose.yml (dev) and docker-compose.test.yml (CI).
     Kubernetes manifests (all deployments, services, HPA, ingress) per SPEC.md §19.
     GitHub Actions CI workflow (.github/workflows/ci.yml and e2e.yml).
Then spawn: reviewer (infrastructure review).
Loop until PASS.
Run: docker-compose up --build — verify all services start and health checks pass.
Run full Playwright suite against docker-compose.test.yml.
Mark DONE when: entire Playwright suite passes in docker-compose.

### Unit 16 — Priority 2 & 3 Game Engines
Implement: CribbageEngine, SpadesEngine, HeartsEngine, EuchreEngine, WhistEngine, OhHellEngine
Each: implementer → reviewer loop.
Mark DONE when: all engines pass unit tests.

### Unit 17 — Priority 4 Game Engines
Implement: GoFishEngine, CrazyEightsEngine, WarEngine, SpitEngine, IdiotEngine
Each: implementer → reviewer loop.
Mark DONE when: all engines pass unit tests.

### Unit 18 — Accessibility Audit
Spawn: reviewer (accessibility specialist mode)
Task: Audit all frontend components against SPEC.md §20 acceptance criteria.
     Check: keyboard navigation, ARIA live regions, color-blind mode, contrast ratios.
Spawn: implementer for each FAIL item found.
Loop until accessibility review is fully PASS.
Mark DONE when: reviewer audit produces no FAIL items.

### Unit 19 — Full Integration & Hardening
Spawn: tester
Task: Run the complete Playwright suite (all 8 suites) against docker-compose.test.yml.
     Verify all screenshots are produced.
     Verify performance: Lighthouse score ≥ 85 on lobby page.
     Verify coverage thresholds met across all services.
Report full pass/fail. Fix any remaining failures.
Mark DONE when: all Playwright suites pass, all screenshots present, coverage thresholds met.

## Agent Spawn Instructions
To spawn a sub-agent, use Claude Code's agent spawn syntax:
  Spawn a teammate using the {agent-type} agent type to {task description}.

Pass to each agent:
  1. The relevant SPEC.md section(s) to read
  2. The specific files they should create or modify
  3. The expected output (test results, review report, screenshot list)

## Task List Format
Maintain .claude/tasks/master-task-list.md:
```
# Master Task List
## Units
| Unit | Name | Status | Agent | Notes |
|------|------|--------|-------|-------|
| 0    | Scaffolding | DONE | orchestrator | |
| 1    | Shared Types | IN_PROGRESS | implementer | |
...

## Blocker Log
- [date] Unit N blocked by: description
```

## What Constitutes DONE
A work unit is DONE only when ALL of the following are true:
1. Implementation code exists and matches the spec
2. All unit tests pass and meet coverage thresholds
3. Reviewer has produced a PASS report (no FAIL items)
4. Playwright tests pass (where applicable) and all screenshots exist
5. `tsc --noEmit` passes in all affected apps
6. `npm run lint` passes in all affected apps
7. Task list is updated

## Failure Handling
If an implementer fails to fix reviewer issues after 3 loops:
  - Spawn architect to produce a revised design
  - Restart implementer with the revised design
  - Log the blocker in the task list

If a Playwright test fails after 2 tester loops:
  - Spawn reviewer to classify: implementation bug vs test bug
  - Route to implementer (implementation) or tester (test fix) accordingly

## When Everything Is Done
When Unit 19 is marked DONE:
  1. Run: git log --oneline | head -30 to show commit history
  2. Run: npm run test:e2e from repo root — confirm all pass
  3. Produce final report: .claude/reports/implementation-complete.md
     Including: all work units, agent loops count, known limitations, production checklist
  4. Present the production checklist (B2C setup steps from SPEC.md §8.5) 
     as the remaining human operator tasks before production deployment

BEGIN NOW with Unit 0.
```

---

## 26. Sub-Agent Prompt Library

These are focused prompts you can use to spawn individual agents for targeted tasks outside the master orchestration flow, or to restart a specific unit.

### 26.1 Restart a Specific Unit

```
You are the Master Orchestrator resuming work on the Card Platform.
Read CLAUDE.md and .claude/tasks/master-task-list.md to understand current state.
Read the review report at .claude/reviews/{story-id}-review.md.
Spawn an implementer agent to fix ALL FAIL items in that review.
Pass the implementer: the review report, the relevant spec sections, and the files to modify.
After implementer completes, spawn reviewer again.
Continue the loop until review passes.
```

### 26.2 Debug a Failing Playwright Test

```
You are the Master Orchestrator debugging a Playwright test failure.
The failing test is: {suite-name} — {test-name}
The error is: {paste error output}

1. Read the test file at apps/frontend/e2e/{suite-file}
2. Read the relevant acceptance criteria in SPEC.md for this story
3. Spawn a reviewer to classify: is this an implementation bug or a test bug?
   - Read the implementation code that the test exercises
   - Determine if the implementation matches the spec
4. If implementation bug: spawn implementer with specific fix instructions
5. If test bug: spawn tester with specific fix instructions
6. Re-run the test and report result.
```

### 26.3 Add a New Game Engine

```
You are the Master Orchestrator adding a new game engine: {GameName}.
1. Read SPEC.md §17 (Epic 8) and the IGameEngine interface in packages/shared-types/src/gameEngine.ts
2. Spawn architect to produce a design document for {GameName} engine
   including: deck usage, turn structure, win conditions, scoring, IGameEngine method implementations
   Save to: .claude/decisions/{gamename}-engine-design.md
3. Spawn implementer to implement:
   - apps/socket-service/src/games/{gamename}/engine.ts
   - apps/socket-service/src/games/{gamename}/engine.test.ts
   - Register in apps/socket-service/src/games/registry.ts
4. Spawn reviewer
5. Loop until PASS
6. Update master task list
```

### 26.4 Implement Production Auth (When Ready)

```
You are the Master Orchestrator switching the platform to production AAD-B2C auth.
Prerequisites: B2C tenant is provisioned, all values in .env (production section) are populated.

1. Spawn implementer to:
   a. Implement apps/frontend/src/auth/MsalAuthProvider.tsx using @azure/msal-browser
      - Implements the same useAuth() interface as DevAuthProvider
      - Reads config from VITE_AAD_* environment variables
      - Uses popup (not redirect) for sign-in to preserve socket state
      - Silent token renewal 5 minutes before expiry
      - On renewal failure: emits token-expired pause, shows re-auth modal
   b. Implement apps/api-service/src/middleware/auth.ts production path:
      - validateMsalToken() using jwks-rsa against B2C JWKS endpoint
      - Caches JWKS keys (cache: true, rateLimit: true)
      - Validates: expiry, signature, audience, issuer
   c. Set VITE_AUTH_MODE=production and AUTH_MODE=production in production .env
2. Write unit tests for MsalAuthProvider using mock MSAL (jest mock)
3. Write unit tests for validateMsalToken using a locally signed test JWKS
4. Spawn reviewer
5. Loop until PASS
Note: Playwright E2E tests continue to use DevAuthProvider via TEST_MODE=true 
even in production builds (test environments use dev auth, production traffic uses MSAL).
```

### 26.5 Infrastructure Deploy Check

```
You are the Master Orchestrator running an infrastructure verification.
1. Spawn devops to:
   a. Run: docker-compose -f docker-compose.test.yml up --build -d
   b. Wait 30 seconds for all services to start
   c. Check each service health endpoint:
      - curl http://localhost:3001/health → must return {"status":"ok"}
      - curl http://localhost:3002/health → must return {"status":"ok"}
      - curl http://localhost:5173 → must return HTML
   d. Report: all services healthy Y/N, any startup errors
2. If any service is unhealthy, spawn implementer to fix the Dockerfile or config.
3. Report final status.
```

---

## 27. Implementation Sequence & Work Units

Summary table for tracking across sessions:

| Unit | Name | Primary Agent | Dependencies | Playwright Suite | Est. Complexity |
|---|---|---|---|---|---|
| 0 | Scaffolding | orchestrator | — | — | Low |
| 1 | Shared Types | implementer | 0 | — | Low |
| 2 | DB Schema & Seed | implementer | 1 | — | Low |
| 3 | Auth Middleware | implementer | 2 | Suite 1 | Medium |
| 4 | cards-engine + SVGs | implementer | 1 | — | High |
| 5 | REST API Core | implementer | 2,3 | — | Medium |
| 6 | Socket Service Core | implementer | 3,5 | — | High |
| 7 | Phase 10 Engine | implementer | 1,6 | — | High |
| 8 | Frontend: Lobby | implementer | 5,6 | Suite 2 | High |
| 9 | Frontend: Game Table | implementer | 4,7,8 | Suite 3 | High |
| 10 | Reconnection | implementer | 6,9 | Suite 4 | Medium |
| 11 | Chat & Messaging | implementer | 6,8 | Suites 5,6 | Medium |
| 12 | Friends | implementer | 5,8 | Suite 7 | Medium |
| 13 | Leaderboards | implementer | 5,6 | Suite 8 | Medium |
| 14 | Rummy Engines (3x) | implementer | 7 | — | High |
| 15 | Infrastructure | devops | all | all suites | Medium |
| 16 | Priority 2–3 Engines | implementer | 7 | — | Medium |
| 17 | Priority 4 Engines | implementer | 7 | — | Low |
| 18 | Accessibility Audit | reviewer | 8,9,11 | — | Low |
| 19 | Full Integration | tester | all | all suites | Low |

**Critical path:** 0 → 1 → 2 → 3 → 5 → 6 → 7 → 9 → 10 → 19

Units 4, 11, 12, 13, 14, 16, 17 can be parallelized against the critical path using Agent Teams if multiple tmux panes are available. Units on the critical path must be sequential.

---

## 28. Open Questions

| # | Question | Resolution Path |
|---|---|---|
| 1 | **AI opponents** — Should bots fill empty seats when async timer expires? | Product decision before Unit 7 |
| 2 | **Phase 10 card art legal review** — SVG designs in §11 are original. Confirm no trademark confusion with Mattel before committing art to main. | Legal before Unit 4 implementation ships to production |
| 3 | **Web Push VAPID keys** — Who provisions and rotates per environment? | Ops runbook before Unit 13 (async) |
| 4 | **Cribbage board UI** — Visual crib board vs numeric score display? | Product before Unit 16 |
| 5 | **Game replay** — Add `game_actions` append-only table from day one at low cost? | Engineering architecture decision before Unit 2 |
| 6 | **Moderator admin UI** — In scope for launch or DB-query only? | Product before Unit 11 |
| 7 | **Sound assets** — Who creates or licenses card deal/flip/discard sounds? | Design before Unit 9 |

---

*End of Document — Card Platform Product Specification v2.1 + Agent Orchestration Playbook*
*To start the build: copy the Master Orchestrator Prompt (§25) into a new Claude Code session with Agent Teams enabled.*
