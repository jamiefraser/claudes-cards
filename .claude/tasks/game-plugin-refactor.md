# Agent Prompt — Refactor to a Game-Plugin Architecture

**Status:** Proposal / Not yet started
**Owner (code agent):** `orchestrator` → delegates to `architect`, `implementer`, `reviewer`
**Scope:** Multi-PR epic. Do **not** attempt in a single branch.
**Mandatory reading before acting:** `SPEC.md` (entire file), `CLAUDE.md`, `.claude/decisions/socket-and-bot-architecture-2026-04-11.md`.

---

## 1. Goal

Refactor `claudes-cards` so that **each card game is a self-contained plugin** that plugs into a small **core framework**. The core owns every concern that is *not* game-specific. Game plugins own *everything* that changes from one game to the next — rules logic, bot strategy, rules text, game-specific UI surfaces, and the map from user intent → `PlayerAction`.

Downstream goal (not in scope for this epic but must not be foreclosed by the design): a user should be able to **describe a game in natural language / structured JSON**, have an LLM generate a plugin conforming to this contract, and have the generated plugin hot-plug into the lobby after review.

This is therefore a **two-layer refactor**:

1. **Decouple** — extract every game's logic and UI out of the shared shells (`socket-service/src/index.ts`, `apps/frontend/src/components/table/GameTable.tsx`, `ActionBar.tsx`, etc.) into plugin packages.
2. **Stabilize** — harden the plugin boundary into a contract documented in code (zod-validated manifest), in shared-types, and in SPEC.md, so future plugins can be authored (by humans *or* generators) without touching the core.

---

## 2. Current State — What's Already Good and What's Leaking

Read these files before proposing any design change.

### 2.1 The server-side engine boundary is already clean
- `packages/shared-types/src/gameEngine.ts` — `IGameEngine` interface. All 16 engines implement it.
- `apps/socket-service/src/games/registry.ts` — `GameRegistry` with id normalization (`gin-rummy` ↔ `ginrummy`). Already keyed lookup, already strategy-aware.
- `packages/shared-types/src/bot.ts` — `IBotStrategy` interface. All games that need one implement it.
- `apps/socket-service/src/bots/BotPlayer.ts` — triple-fallback executor that only talks through the registry.

**Conclusion:** the server engine contract is close to ready. The refactor there is mostly *relocation* (into plugin packages) and *auto-discovery* (kill the manual register list).

### 2.2 The server bootstrap hardcodes every game
- `apps/socket-service/src/index.ts` lines 23–107 — 16 `import`s + 16 `registry.register(...)` calls. New game = edit this file.

### 2.3 The frontend is the leak
- `apps/frontend/src/components/table/GameTable.tsx` — **1,533 lines**, **26+ `gameState.gameId === 'X'` branches**, direct imports of `CanastaMeldTargetModal`, `Phase10HitTargetModal`, `CribbageBoard`, `CribbagePegArea`, `CribbageCountingDisplay`, `CribbagePhaseToast`, `GinRummyShowdown`, `Phase10Objective`, `Phase10HandScore`, plus inline Canasta pickup flow, cribbage auto-Go effect, cribbage click-to-play, crazy-eights declared-suit badge, phase10 hit-target resolution, rummy-family layout branch vs non-rummy layout branch.
- `apps/frontend/src/components/table/ActionBar.tsx` — **1,064 lines**, **7+ gameId branches**, Canasta pickup staging UI, Gin Rummy knock/gin/big-gin, Cribbage sub-phase buttons, Crazy Eights wild-suit picker, Phase 10 Hit Meld, generic trick-game Play button.
- `apps/frontend/src/utils/gameRules.ts` — rules bundles all jammed into `en.json` under `en.rules.games[gameId]`.
- `apps/frontend/src/components/table/` — 20+ flat files mixing framework concerns (`GameTable`, `PlayerSeat`, `BotSeat`, `TableFelt`, `WaitingRoom`) with plugin-specific concerns (`CanastaMeldTargetModal`, `CanastaWildDistributionModal`, `CribbageBoard`, `CribbageCountingDisplay`, `CribbagePegArea`, `CribbagePhaseToast`, `GinRummyShowdown`, `Phase10HandScore`, `Phase10Objective`, `Phase10HitTargetModal`).

### 2.4 Catalog metadata is duplicated
- `apps/api-service/prisma/seed.ts` hardcodes `GAME_CATALOG` (id/name/category/min/max/supportsAsync) for all 16 games.
- Each engine independently declares `minPlayers`, `maxPlayers`, `supportsAsync` on its class.
- The DB `GameCatalog` table is read by `GET /api/v1/games` and drives `GameBrowser`.
- These three sources drift. The engine-side declaration should be canonical; the seed should derive from it.

### 2.5 Bot strategies already colocate well
- `apps/socket-service/src/bots/strategies/<game>.strategy.ts` — one per game, each names its own `gameId`. These move into the plugin package verbatim.

---

## 3. Target Architecture

### 3.1 New directory layout

```
packages/
  game-plugin-sdk/              # Contract + zod manifest schema + test helpers
    src/
      manifest.ts               # Manifest TS type + zod schema
      plugin.ts                 # GamePlugin / GamePluginServer / GamePluginClient types
      layouts.ts                # LayoutFamily enum ('rummy-family' | 'trick-taking' | 'cribbage' | 'freeform')
      testing/                  # conformance test helpers (engine + bot)
      validateManifest.ts
      index.ts
  games/
    phase10/
      package.json              # name: @card-platform/game-phase10
      manifest.ts               # exports the manifest
      server/
        engine.ts               # moved from apps/socket-service/src/games/phase10/engine.ts
        bot.ts                  # moved from apps/socket-service/src/bots/strategies/phase10.strategy.ts
        index.ts                # exports { createEngine, createBotStrategy }
      client/
        TableCenter.tsx
        Overlays.tsx             # Phase10HandScore + Phase10HitTargetModal
        ActionBarExtension.tsx
        useCardInteraction.ts
        Objective.tsx            # was Phase10Objective.tsx
        layout.ts                # layout: 'rummy-family'
        rules.ts                 # (or rules.json — localizable)
        index.ts                 # exports GameClientModule
      __tests__/
        engine.test.ts
        bot.test.ts
        client.test.tsx
      plugin.ts                 # wires server + lazy client dynamic-import, exports GamePlugin
      index.ts                  # default export: GamePlugin
    rummy/ ...
    ginrummy/ ...
    canasta/ ...
    cribbage/ ...
    spades/ ...
    hearts/ ...
    euchre/ ...
    whist/ ...
    ohhell/ ...
    gofish/ ...
    crazyeights/ ...
    war/ ...
    spit/ ...
    idiot/ ...

apps/
  api-service/
    src/
      services/
        gameCatalog.service.ts   # reads manifests (via @card-platform/game-registry)
                                 # and upserts GameCatalog on boot
  socket-service/
    src/
      core/                      # renamed from games/ — keeps registry + bot controller
        registry.ts              # autoload driven by packages/game-registry
        loader.ts                # imports every @card-platform/game-* plugin and registers
      games/                     # DELETED — lives in packages/games/*/server now
      bots/
        strategies/              # DELETED — lives in packages/games/*/server now
        BotController.ts, BotPlayer.ts, BotSweeper.ts, schedulingHelpers.ts  # kept
  frontend/
    src/
      components/
        table/
          core/                  # the plugin-agnostic shell
            GameTable.tsx        # slimmed down — no gameId branches
            ActionBar.tsx        # slim shell — renders common + plugin ActionBarExtension
            TableFelt.tsx, PlayerSeat.tsx, BotSeat.tsx, RadialSeats.tsx,
            WaitingRoom.tsx, RulesPanel.tsx, SettingsPopover.tsx,
            RoomInfoPill.tsx, MeldsArea.tsx, WinCelebration.tsx, layout/
          plugins/                # thin registrations — see §3.5
      games/                      # client plugin loader (dynamic import)
        registry.ts
        useGamePlugin.ts
      i18n/
        en.json                   # rules.sectionTitles + common strings only
                                  # per-game rules live in packages/games/*/client/rules

packages/
  game-registry/                  # tiny package that every bootstrap imports
    src/index.ts                  # re-exports every plugin in packages/games/*
                                  # so the socket-service, api-service, and frontend
                                  # all see the same set
```

### 3.2 The plugin contract (sketch — finalize in `game-plugin-sdk`)

```ts
// packages/game-plugin-sdk/src/plugin.ts
import type { IGameEngine, IBotStrategy, GameConfig, GameState, PlayerAction }
  from '@card-platform/shared-types';
import type { ComponentType, ReactNode } from 'react';

export type LayoutFamily = 'rummy-family' | 'trick-taking' | 'cribbage' | 'freeform';

/** Static, serializable metadata. MUST be describable as pure JSON so an
 *  LLM-generated plugin can emit it and zod can validate it at registration. */
export interface GamePluginManifest {
  /** kebab-case canonical id, e.g. 'gin-rummy'. Stored in the DB and Room.gameId. */
  id: string;
  /** One-word alias used by Socket/engine internals, e.g. 'ginrummy'. */
  aliases?: string[];
  name: string;
  category: 'rummy' | 'trick-taking' | 'cribbage' | 'other';
  minPlayers: number;
  maxPlayers: number;
  supportsAsync: boolean;
  turnTimerSeconds: number | null;
  deckType: 'standard' | 'phase10' | string;  // extensible; validated at load
  layout: LayoutFamily;
  enabledByDefault: boolean;
  /** Icon asset path relative to frontend `public/` or inline SVG data-uri. */
  iconAsset?: string;
  /** Human tagline for the lobby card. */
  tagline?: string;
  /** Schema version — bump when the contract changes. */
  pluginApiVersion: 1;
}

/** Server-side half — runs in socket-service. */
export interface GamePluginServer {
  createEngine(): IGameEngine;
  /** Optional. If omitted and supportsAsync=true, GenericBotStrategy is used. */
  createBotStrategy?(): IBotStrategy;
}

/** Client-side half — dynamic-imported by the frontend. Keep the bundle small. */
export interface GameClientModule {
  /** Drives which layout family the core <GameTable> uses. */
  layout: LayoutFamily;
  /** Rendered inside the felt — stock/discard piles or plugin-specific zones. */
  TableCenter?: ComponentType<TableCenterProps>;
  /** Overlays rendered above the felt (modals, toasts, showdown panels). */
  Overlays?: ComponentType<OverlayProps>;
  /** Appended into the ActionBar alongside common controls. */
  ActionBarExtension?: ComponentType<ActionBarExtensionProps>;
  /** Anything that belongs in the local-player bottom dock below the hand
   *  (e.g. Phase10 objective badge, personal scoreboard). */
  BottomDockExtras?: ComponentType<BottomDockProps>;
  /** Hook that maps a hand-card click / drop into a PlayerAction. Returning
   *  null falls back to core behaviour (select/deselect). */
  useCardInteraction?: (ctx: TableContext) => CardInteractionHandlers;
  /** Localizable rules bundle consumed by core's RulesPanel. */
  rules: RulesBundle;
}

export interface GamePlugin {
  manifest: GamePluginManifest;
  server: GamePluginServer;
  /** Lazy: the client bundle is code-split. */
  loadClient(): Promise<GameClientModule>;
}
```

The exact shape of `TableContext`, `CardInteractionHandlers`, `OverlayProps`, etc. must be designed by the `architect` agent in Phase 1 and then held stable. The guiding rule: **anything the current `GameTable.tsx`/`ActionBar.tsx` reaches into `gameState.publicData` for today must be reachable through a typed accessor the plugin owns.**

### 3.3 Core framework responsibilities (things the core keeps owning)

- Lobby (GameBrowser, GameCard, RoomBrowserModal, CreateRoomModal)
- Game catalog (DB table + `GET /api/v1/games`) — now **derived** from manifests
- Room lifecycle (create / join / leave / start / end) — unchanged
- Player list / BotSeat / PlayerSeat / RadialSeats / layout primitives
- TableFelt, TableChat, RulesPanel shell, SettingsPopover, RoomInfoPill
- Hand/Pile/Card primitives (`HandComponent`, `PileComponent`, `CardComponent`)
- Dnd-kit root + sortable hand + common drop targets ('discard-pile', plus plugin-registered extra drop zones)
- Score, leaderboard ingest (worker-service), async turn timers, bot activation policy, moderation, presence, notifications
- Socket events (`game_action`, `game_state_sync`, `game_state_delta`, `bot_activated`, etc.) — all unchanged, since the envelope is game-agnostic
- i18n infrastructure (`en.json`) for common strings; per-game rules localize through the plugin

### 3.4 Plugin responsibilities (things every plugin must provide)

- `manifest` (static)
- `server.createEngine()` — existing `IGameEngine` implementation
- `server.createBotStrategy?()` — existing `IBotStrategy` implementation (or omit for generic)
- `client.TableCenter` — whatever goes inside the felt that's game-specific. Most rummy-family games render just stock+discard via a core-provided helper; cribbage provides the peg area + board; gin rummy shows the showdown summary during showdown; crazy eights draws the declared-suit badge on top of the discard.
- `client.Overlays` — any modals or scoring overlays (`Phase10HitTargetModal`, `Phase10HandScore`, `CanastaMeldTargetModal`, `CanastaWildDistributionModal`, `GinRummyShowdown`, cribbage `CountingDisplay`/`PhaseToast`).
- `client.ActionBarExtension` — the game-specific button cluster (Knock/Gin for Gin Rummy, Meld/Discard/Take Top for Canasta, Discard-to-crib / Cut / Play / Count / Next for Cribbage, wild-suit picker for Crazy Eights, Hit Meld for Phase 10 after lay-down, "Play" for trick-taking games).
- `client.useCardInteraction` — how a click/drop becomes a `PlayerAction`. E.g., Cribbage's pegging-phase click-to-play, Canasta's discard-pile-pickup entry.
- `client.rules` — rules bundle (localizable).
- **Tests** — engine unit tests, bot strategy tests, at least one Playwright scenario per plugin at minimum.

### 3.5 How the frontend loads a plugin

1. `<TablePage roomId=…>` renders `<GameTable roomId=…/>`.
2. Core `<GameTable>` reads `gameState.gameId` → `useGamePlugin(gameId)` (from `apps/frontend/src/games/useGamePlugin.ts`) which dynamic-imports the plugin's client module and caches it.
3. Until the module resolves, render a skeleton.
4. Once resolved, the shell renders the common chrome and slots `TableCenter`, `ActionBarExtension`, `Overlays`, `BottomDockExtras` into their reserved positions. All game-specific imports at the top of `GameTable.tsx` go away.

Plugin registration in `apps/frontend/src/games/registry.ts`:

```ts
export const gamePlugins: Record<string, () => Promise<GamePlugin>> = {
  'phase10':       () => import('@card-platform/game-phase10'),
  'rummy':         () => import('@card-platform/game-rummy'),
  'gin-rummy':     () => import('@card-platform/game-ginrummy'),
  'canasta':       () => import('@card-platform/game-canasta'),
  'cribbage':      () => import('@card-platform/game-cribbage'),
  // …
};
```

This list is generated by a codegen step (Phase 7) that walks `packages/games/*/manifest.ts`.

---

## 4. Non-negotiables (re-state CLAUDE.md rules that bite this refactor)

1. **Shared types stay in `packages/shared-types`.** The plugin contract, manifest type, and zod schema live in `packages/game-plugin-sdk` **which re-exports** from shared-types — no duplicate `IGameEngine`.
2. **Redis key schema is unchanged** (SPEC.md §5). Plugins must never invent new Redis keys. Anything game-specific persists inside `GameState.publicData`.
3. **Directory structure.** SPEC.md §4 must be updated in the same PR that introduces new directories. Do not merge a PR whose file layout violates the spec that's on `master`.
4. **Route + component maps.** SPEC.md §6/§7 must be updated when the component layout moves.
5. **AUTH_MODE / TEST_MODE discipline.** Plugin code follows the same rules; no dev shortcuts in plugin bundles.
6. **Test-first.** Every moved file is moved under an already-green test suite, or with a new failing test committed before the implementation.
7. **No `console.log` in plugin code** — plugins consume a logger passed by the core (or use the same `apps/<svc>/src/utils/logger.ts` pattern; decide in Phase 1 and document in the ADR).
8. **Every new `.env` variable → `.env.example`** with a comment.
9. **All user-facing strings stay i18n'd.** Per-plugin rules bundles are just i18n scopes; no hardcoded English in plugin JSX.
10. **Bots never on leaderboards.** Bot actions still flagged `isBot:true` in `game_actions` — BotPlayer already handles this and must not change.
11. **Sound catalogue unchanged.** Plugin sound use must route through `SoundManager`.
12. **Append-only tables untouched.** `moderation_audit_log` and `game_actions` still never get a DELETE; plugin code doesn't touch them directly.
13. **Docs-in-sync (rule 16).** Every phase below ends with a spec/ADR update in the *same* PR.

---

## 5. Phased Plan (each phase = one or more PRs; merge order matters)

> Each phase lists: **what**, **deliverables**, **acceptance**, **out of scope**. An `implementer` must not skip ahead. A `reviewer` must reject any PR whose changes straddle multiple phases.

### Phase 0 — Spec + ADR (no code)

**What.** Get the design written down before moving files.

**Deliverables.**
- New ADR: `.claude/decisions/game-plugin-architecture-YYYY-MM-DD.md`. Captures the contract, the package layout, the auto-discovery story, how the plugin-API-version bump is handled, and the LLM-generation future.
- Update `SPEC.md`:
  - §4 Directory Structure — add `packages/game-plugin-sdk`, `packages/game-registry`, `packages/games/*`.
  - §6/§7 — annotate component map as "core + per-plugin" and cross-reference the SDK.
  - New section (e.g. §27) "Game plugin architecture" with the manifest schema, plugin contract, registration flow, and conformance requirements.
  - §13 stories — add a story for each phase below so the progress is auditable.
- Update `CLAUDE.md` "Absolute Rules" with a new rule: *"Game-specific logic and UI live in `packages/games/<game>/`. The core apps must not import from a specific plugin."*
- Update `.claude/CLAUDE.md` to mirror the above.

**Acceptance.**
- Human sign-off on ADR.
- CI passes (only docs changed).

**Out of scope.** Any code moves.

---

### Phase 1 — `packages/game-plugin-sdk`

**What.** Build the contract package.

**Deliverables.**
- New workspace package `@card-platform/game-plugin-sdk` with:
  - `manifest.ts` — `GamePluginManifest` TS type + matching **zod** schema. Zod chosen because it lets us validate LLM-generated manifests at runtime.
  - `plugin.ts` — `GamePlugin`, `GamePluginServer`, `GameClientModule`, prop types for each client slot.
  - `layouts.ts` — `LayoutFamily` enum.
  - `testing/conformance.ts` — a reusable test suite `runPluginConformance(plugin)` that asserts:
    - Manifest passes zod validation.
    - `createEngine()` returns an object that matches `IGameEngine` shape and whose `startGame` produces a `GameState` with `version===1`, correct `gameId`, correct `players.length === config.playerIds.length`.
    - `applyAction` monotonically increments version.
    - `getValidActions` returns a non-empty array on the starting state for the current player when the game is not immediately over.
    - `createBotStrategy?()`, if present, returns an object whose `gameId` matches `manifest.id` (after normalization) and whose `fallbackAction` never throws on the initial state.
  - `index.ts` — re-exports.
- Wire the package into `package.json` workspaces and `tsconfig.base.json` paths.

**Acceptance.**
- `tsc --noEmit` clean across monorepo.
- `npm test -w @card-platform/game-plugin-sdk` green.
- Zero changes to existing apps.

**Out of scope.** Any plugin extraction.

---

### Phase 2 — Pilot migration: **Phase 10** as the reference plugin

**What.** Migrate the single most-involved rummy-family game first. Everything learned here shapes the other 15 plugins; it is intentionally slow and careful.

**Deliverables.**
- New package `@card-platform/game-phase10` at `packages/games/phase10/`.
  - `manifest.ts` — id `'phase10'`, aliases `[]`, category `'rummy'`, min 2 / max 6, supportsAsync true, turnTimer from current config, layout `'rummy-family'`.
  - `server/engine.ts` ← moved from `apps/socket-service/src/games/phase10/engine.ts`.
  - `server/bot.ts` ← moved from `apps/socket-service/src/bots/strategies/phase10.strategy.ts`.
  - `server/index.ts` — `createEngine`, `createBotStrategy`.
  - `client/TableCenter.tsx` — draws the stock+discard via core helper; no Phase10-specific center today, so mostly an export of a thin wrapper.
  - `client/Overlays.tsx` — renders `Phase10HandScore` + `Phase10HitTargetModal`. Move those two files in from `apps/frontend/src/components/table/`.
  - `client/ActionBarExtension.tsx` — the "Lay Down" / "Hit Meld" button block currently in `ActionBar.tsx`. Takes the local `phase10LaidDown` boolean + a resolver hook.
  - `client/BottomDockExtras.tsx` — `Phase10Objective` moved in.
  - `client/useCardInteraction.ts` — current hit-meld drop target handling moved here. It returns `{ onDrop(overId, activeId, ctx) → PlayerAction | null }`.
  - `client/rules.ts` — rules text extracted from `en.json`'s `en.rules.games.phase10` into this module (localization key structure preserved — core still looks up section titles via `en.rules.sectionTitles`).
  - `client/index.ts` — default export satisfying `GameClientModule`.
  - `plugin.ts` — exports the `GamePlugin` object.
- `apps/frontend/src/games/{registry.ts,useGamePlugin.ts}` — loader infrastructure introduced. Initially only Phase 10 is registered.
- **Core changes — scoped to Phase 10 only:**
  - In `GameTable.tsx` introduce a slot system (`<CoreTable plugin={phase10Plugin} …/>`). Route Phase 10 through the new slot system **only**; all other games keep the legacy code path via a branch at the top of `GameTable` that calls the old rendering while the migration is in progress. The goal is that the **legacy path is a frozen code island** that shrinks each phase.
  - In `ActionBar.tsx` introduce an `ActionBarExtensionSlot` that Phase 10 fills; other games keep the old branch.
- **Server changes:**
  - `apps/socket-service/src/core/loader.ts` introduced. On boot it imports the Phase 10 plugin and calls `registry.register(...)`. The existing 15 manual registrations stay put.
  - Delete `apps/socket-service/src/games/phase10/` and `apps/socket-service/src/bots/strategies/phase10.strategy.ts`. Repoint existing tests.
- **Tests:**
  - All existing Phase 10 engine/bot/e2e tests still pass, moved into the plugin package.
  - New conformance test `runPluginConformance(phase10Plugin)` added.
  - Playwright: run the existing Phase 10 flow unchanged (same checkpoints per SPEC.md §26).
- **Docs:** update SPEC.md directory structure listing to reflect `packages/games/phase10/`.

**Acceptance.**
- CI green.
- Playwright Phase 10 screenshots diff ≤ anti-aliasing tolerance against baseline.
- Reviewer agent PASS.
- Zero `gameState.gameId === 'phase10'` occurrences remaining outside the Phase 10 plugin package.
- `grep -r "from '@card-platform/game-phase10'" apps/` returns only the loader file.

**Out of scope.** Any other game. Do not refactor trick-taking, cribbage, canasta yet.

---

### Phase 3 — Canasta, Gin Rummy, Rummy

**What.** The other rummy-family games. Canasta is the nastiest (pickup staging modal, wild distribution modal, frozen-pile UI, partnership variant derivation). Do it second-last in this phase so the contract from Phase 10 is stressed by Rummy and Gin Rummy first.

Per game, follow the Phase 2 template. Additional work specific to each:

- **Gin Rummy** — move `GinRummyShowdown.tsx` into `client/Overlays.tsx`. Move `knockEligibility`/`ginrummyDeadwood` utilities to the plugin. Showdown state projection currently built inline in `GameTable.tsx` (lines ~787-800) goes into the plugin.
- **Rummy** — minimal client; mostly rummyMelds shape consolidation.
- **Canasta** — move `CanastaMeldTargetModal`, `CanastaWildDistributionModal` into `client/Overlays.tsx`. Move the pickup-staging UI and extendable-meld derivation from `ActionBar.tsx` into the plugin's `ActionBarExtension.tsx`. The `actionBarProps.canasta` derivation block currently in `GameTable.tsx` (lines ~696-760) gets replaced by the plugin publishing a `useActionBarContext()` projection from `gameState`.

**Acceptance (per game).**
- Existing tests green in the new location.
- Playwright scenarios for each game unchanged.
- All `gameState.gameId === '<game>'` branches outside the plugin removed.
- Reviewer PASS.

---

### Phase 4 — Cribbage

**What.** Cribbage is its own layout family (`'cribbage'`) because of the peg board + pegging area + showdown flow.

Per game, follow the Phase 2 template. Specific additions:
- Move `CribbageBoard.tsx`, `CribbagePegArea.tsx`, `CribbageCountingDisplay.tsx`, `CribbagePhaseToast.tsx` into `client/`.
- The auto-Go effect and click-to-play logic currently in `GameTable.tsx` (lines ~192-216 and ~333-370) moves to `useCardInteraction` in the plugin.
- Cribbage's dealer resolution (publicData['dealerIndex']) is plugin-specific — cribbage exposes a `useDealer()` helper consumed by the core seat chrome.

---

### Phase 5 — Trick-taking games (Spades, Hearts, Euchre, Whist, Oh Hell)

**What.** These share a bot strategy (GenericBotStrategy) and a generic "Play selected card" action. The plugin contract should support a *shared* layout profile where every game of this category uses the same client module modulo small differences (trump declaration for Euchre, bidding for Spades/Oh Hell).

- Introduce a shared `TrickTakingActionBar` in `packages/game-plugin-sdk/src/helpers/` that individual plugins compose with their own bid/trump UI.
- Each of the 5 plugins is primarily a manifest + engine + thin client composition.

---

### Phase 6 — Remaining plugins (Go Fish, Crazy Eights, War, Spit, Idiot)

**What.** Final five. Crazy Eights brings the declared-suit badge currently in `GameTable.tsx` lines ~988-1015 into its plugin Overlays. Go Fish has a bespoke ask-for-card flow that becomes its ActionBarExtension.

By the end of Phase 6:
- `apps/socket-service/src/games/` is deleted.
- `apps/socket-service/src/bots/strategies/` only contains `generic.strategy.ts` (used by the trick-takers as a fallback).
- `apps/frontend/src/components/table/` contains **only** core files. Every game-specific component has moved.
- `GameTable.tsx` contains **zero** `gameState.gameId === 'X'` comparisons.
- `ActionBar.tsx` contains **zero** `gameId === 'X'` comparisons.

---

### Phase 7 — Auto-discovery and catalog consolidation

**What.** Kill the hardcoded lists.

**Deliverables.**
- `packages/game-registry/` — tiny package that exports `allPlugins: GamePlugin[]` by statically importing every `@card-platform/game-*` workspace package. Generated by a small codegen (`scripts/generate-game-registry.ts`) that scans `packages/games/*/package.json` and writes `packages/game-registry/src/index.ts`. Codegen runs on `npm install` (postinstall) and in CI to keep the file in sync.
- `apps/socket-service/src/core/loader.ts` — uses `allPlugins` to register engines + strategies. The 16 manual `import`+`register` lines in `apps/socket-service/src/index.ts` go away.
- `apps/api-service/src/services/gameCatalog.service.ts` — new service that upserts `GameCatalog` rows from `allPlugins[*].manifest` at boot. `prisma/seed.ts` deletes its `GAME_CATALOG` constant and the upsert loop, keeping only test users.
- `apps/frontend/src/games/registry.ts` — generated (dynamic imports keyed by manifest.id).
- Add a CI check that fails if `packages/games/*/manifest.ts` and the three generated registries drift.

**Acceptance.**
- Adding a new game = adding `packages/games/<newgame>/`. No other file changes required.
- `npm run build` in a clean checkout produces identical `GameCatalog` rows to before.

---

### Phase 8 — Conformance in CI

**What.** Every plugin passes the SDK's conformance suite in CI; plugins that fail cannot merge.

**Deliverables.**
- A top-level Jest project that iterates `allPlugins` and runs `runPluginConformance` on each.
- A Playwright "smoke" project that for each plugin: creates a room, seats bots to reach minPlayers, starts the game, makes one move, verifies a `game_state_delta` was received, ends the game. This catches plugins whose client module throws on mount.

---

### Phase 9 — Foundation for LLM-generated plugins (*design, not full impl*)

**What.** Lay the rails for the downstream capability. This phase ships a **generator tool + sandbox**, not the actual LLM integration.

**Deliverables.**
- `packages/game-plugin-sdk/src/rulesDescription.ts` — a zod-validated **structured rules JSON schema**: `{ deckSpec, players, phases[], actions[], scoring, winConditions, botHints }`. This is the form humans or an LLM would author in. The schema supports the existing 16 games' rule shapes (validated by round-tripping each plugin's rules into this JSON and back).
- `scripts/generate-plugin.ts` — CLI: `npm run generate-plugin -- --spec <file.json>`. Consumes a validated rules description and scaffolds a plugin package (`packages/games/<id>/`) with:
  - `manifest.ts`
  - a skeleton `engine.ts` whose `applyAction` is a switch statement over the declarative actions + scoring rules. Rule fragments that cannot be handled declaratively are left as `TODO: author engine logic` throws so the plugin fails conformance until a human fills them in.
  - a skeleton bot strategy deferring to `GenericBotStrategy`.
  - a minimal client that uses `TrickTakingActionBar` or `RummyFamilyActionBar` based on layout.
  - `rules.ts` derived from the description.
  - A failing conformance test.
- **Security / sandbox:**
  - Generated plugins run with the same privileges as built-in plugins today; there is no runtime sandbox in this phase.
  - An ADR captures the unresolved questions for a later phase: (a) would LLM-generated plugins run in-process or in a worker, (b) what surface area of Node (fs, net, crypto.randomBytes) do plugins need, (c) do we need a review gate before a user-authored plugin reaches production.
- **Review gate (deferred but noted):** the actual "user authors a game in natural language" UX is explicitly **not in this epic**. Phase 9 only ensures nothing in Phases 0–8 blocks it.

---

## 6. How the Agents Should Collaborate on This

- **orchestrator** — owns the task list, runs phases sequentially, splits each phase into one or more PR-sized units. Never lets Phase N+1 start before Phase N is merged.
- **architect** — delivers Phase 0 ADR + spec updates, plus the Phase 1 contract design. Consulted again before each phase begins to pressure-test the contract against the next game's weirdness (e.g. before Canasta, validate that Overlays can host two stacked modals; before Cribbage, validate that a plugin can declare a new `LayoutFamily`).
- **implementer** — one implementer per plugin migration, test-first. Never touches more than one game's plugin extraction in a single PR.
- **reviewer** — mandatory PASS report before any plugin migration merges. Explicit review items:
  - `grep` confirms zero new references to the plugin's gameId outside its package.
  - Screenshots diff.
  - No new Redis keys.
  - Logger usage, no console.log.
  - i18n integrity (rules bundle moved, not duplicated).
  - Conformance test present.

When a phase hits an unresolved design question, **stop and delegate to architect** — do not let the implementer pick a direction that then ossifies into the next 15 plugins.

---

## 7. What Must Not Regress

These are the regression guards every PR in this epic must clear. Bake them into the reviewer checklist:

1. **Gameplay parity.** Every existing Playwright scenario passes unchanged. Cribbage counting, Canasta frozen-pile takeover, Phase 10 hit-meld-on-drop, Gin Rummy knock+undercut, Crazy Eights declared suit, Spit real-time rush — all verified.
2. **Bot behaviour parity.** Bot-activation timing unchanged; `isBot:true` still stamped on `game_actions`; bots still excluded from leaderboards. Triple-fallback chain in `BotPlayer.ts` untouched.
3. **Socket event shape unchanged.** `game_action`, `game_state_sync`, `game_state_delta`, `bot_activated`, `bot_yielded`, `player_joined`, `player_left` payloads identical. Prev-version delta handling untouched.
4. **Public API unchanged.** `GET /api/v1/games` returns the same shape; `GET /api/v1/games/replay/:roomId` still works; game-catalog rows in prod DB after deploy match today's rows.
5. **Redis key schema unchanged.** No new `game:plugin:*` or similar keys. Anything plugin-specific belongs inside `GameState.publicData`.
6. **Build size budget.** The frontend's main bundle should **shrink** once each plugin is code-split. Track before/after with `source-map-explorer`. A plugin migration that grows the main bundle has to explain why.
7. **TypeScript strict.** `tsc --noEmit` passes across every workspace on every PR.

---

## 8. Open Questions (decide in Phase 0 / Phase 1, document in ADR)

1. **Logger injection.** Pass `logger` into plugin factories, or let plugin packages import the per-service logger? The latter creates a circular dependency if a plugin is imported by both api-service and socket-service. Decision: **plugins accept a logger via factory argument.**
2. **Which card primitives do plugins get?** Plugins need `Card`, `Hand` model, deck builders. Do those live in `packages/cards-engine` or in `game-plugin-sdk`? Decision: stay in `cards-engine`; plugin-sdk re-exports for convenience.
3. **Plugin-provided drop targets.** Current core supports drop targets `'discard-pile'` and `meld:<playerId>:<idx>`. Plugins may need more. Decision: plugins register drop-target id prefixes via manifest; core's DndContext hands unknown ids to the plugin's `useCardInteraction`.
4. **Per-plugin Zustand slices.** Canasta's `canastaPickup` slice currently lives in `gameStore.ts`. Do plugins extend the store, or own their own? Decision: **plugins own their own stores** (isolated state). Cross-cuts (selection, hand ordering) stay in the core store.
5. **Version skew.** What happens when a plugin's `pluginApiVersion` disagrees with the SDK's? Decision: boot-time zod validation rejects the plugin; the room type is hidden from the lobby; an operator alert is logged.
6. **I18n ownership.** Per-plugin rules bundles in the plugin package vs. still in `en.json` scoped by gameId? Decision: **plugin package owns its rules module**; `en.json` keeps only shared strings (section titles, common UI).
7. **Plugin hot-reload.** Not a goal. Plugins load at boot. Adding a plugin requires a service restart. This is acceptable for the foreseeable future; reopen only if Phase 9 needs live authoring.

---

## 9. What Success Looks Like (top-level DoD for the whole epic)

- `git grep -nE "gameState\.gameId === ['\"](canasta|cribbage|phase10|ginrummy|crazyeights|gofish|rummy|hearts|spades|euchre|whist|war|spit|idiot|ohhell)['\"]" apps/` returns **nothing**.
- `apps/socket-service/src/games/` and `apps/socket-service/src/bots/strategies/` contain only core infrastructure (no per-game files other than `generic.strategy.ts`).
- `apps/frontend/src/components/table/` contains only core files; no game-specific components.
- `apps/socket-service/src/index.ts` imports `@card-platform/game-registry`, not individual games.
- `apps/api-service/prisma/seed.ts` contains no `GAME_CATALOG` constant.
- Adding a new game is a single-package change under `packages/games/`, plus an auto-regenerated registry file, plus a Prisma migration run.
- Playwright suite passes with screenshots diff ≤ tolerance.
- Reviewer PASS on every phase's PR set.
- SPEC.md and CLAUDE.md updated in lockstep.
- ADR merged documenting the contract.

---

## 10. First Concrete Steps for the Executing Agent

When work begins, do exactly this, in order:

1. Spawn the **architect** agent with this prompt and instruct it to produce **Phase 0 deliverables only**: the ADR and the SPEC.md update. Do not start on code.
2. After the ADR and SPEC update are merged, spawn the **implementer** agent on Phase 1 — the `game-plugin-sdk` package. Single PR. Include the conformance helper.
3. After Phase 1 merges, pause. The orchestrator reviews the contract with the human and waits for explicit approval to proceed to Phase 2 (the Phase 10 pilot).
4. Phase 2 is a single-game migration. Slow and careful. Every subsequent phase moves faster because the pattern is set.
5. Every phase must end with a fresh `npm run typecheck && npm run lint && npm test && npx playwright test` green locally, and screenshots regenerated for the migrated plugin's checkpoints per SPEC.md §26.

**Stop points (hard):**
- Stop if the conformance suite cannot be made to pass for all migrated plugins.
- Stop if the frontend main bundle grows after a migration.
- Stop if any Playwright scenario regresses.
- Stop if the plugin contract ends up needing a breaking change mid-epic — in that case raise an ADR amendment before proceeding.
