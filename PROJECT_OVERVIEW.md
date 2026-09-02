# Wisdom Local — Full Project Overview

> **Biblical Trivia Quest (FaithIQ / BTQ-Project)**  
> A full-stack Bible trivia game with single-player, real-time multiplayer, async challenges, and team battles.

**Generated:** July 1, 2026  
**Repository:** `wisdomLocal`  
**Default dev URL:** `http://localhost:5001`

> **Non-technical guide:** For a plain-English walkthrough of how players use the app, see [USER_FLOW.md](./USER_FLOW.md).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Database Schema](#5-database-schema)
6. [Game Modes & Features](#6-game-modes--features)
7. [Team Battle System](#7-team-battle-system)
8. [Authentication & Sessions](#8-authentication--sessions)
9. [REST API Reference](#9-rest-api-reference)
10. [WebSocket Events](#10-websocket-events)
11. [Frontend Application](#11-frontend-application)
12. [Backend Services](#12-backend-services)
13. [External Integrations](#13-external-integrations)
14. [Environment Variables](#14-environment-variables)
15. [Scripts & Commands](#15-scripts--commands)
16. [Deployment](#16-deployment)
17. [Development Conventions](#17-development-conventions)
18. [Related Documentation](#18-related-documentation)

---

## 1. Executive Summary

Wisdom Local is a production-grade Bible trivia web application branded as **FaithIQ / Biblical Trivia Quest**. Players answer multiple-choice questions across Bible categories and difficulty levels, compete on leaderboards, challenge friends asynchronously, and participate in real-time **Team Battle** matches.

The application is a **monorepo** with:

- A **React + TypeScript** SPA (Vite) in `client/`
- An **Express + TypeScript** API server in `server/`
- **Shared types and Drizzle schema** in `shared/`
- **PostgreSQL** as the primary datastore
- **WebSockets** (`ws`) for real-time multiplayer and team battle sync
- **Passport.js** session-based authentication stored in PostgreSQL

The server runs on **port 5001** and serves both the API and the client (Vite HMR in dev, static files in production).

---

## 2. Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite 5, Wouter (routing), TanStack React Query, Tailwind CSS 3/4, Radix UI, shadcn/ui, Framer Motion, Howler (audio), Lucide icons |
| **Backend** | Node.js, Express 4, TypeScript, tsx (dev), esbuild (prod bundle) |
| **Database** | PostgreSQL, Drizzle ORM, drizzle-kit, postgres.js driver |
| **Real-time** | WebSocket (`ws`) — attached to the HTTP server |
| **Auth** | Passport Local Strategy, express-session, connect-pg-simple |
| **AI / Voice** | OpenAI (question generation), ElevenLabs (TTS / voice cloning) |
| **Email** | SendGrid |
| **Validation** | Zod, drizzle-zod |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                        │
│  React SPA ── REST (fetch) ──► Express API (/api/*)             │
│           └── WebSocket ────► ws:// server (game events)        │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Server (port 5001)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ auth.ts  │  │routes.ts │  │socket.ts │  │ database.ts      │ │
│  │ Passport │  │ REST API │  │ WebSocket│  │ Drizzle + PG     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                           PostgreSQL Database
                    (Neon serverless or local PG)
```

### Request Flow

1. **Static/UI requests** — Served by Vite dev middleware (dev) or `dist/public` (prod).
2. **REST API** — `/api/*` routes in `server/routes.ts` with auth middleware.
3. **WebSocket** — Initialized in `registerRoutes()`; all game events flow through `server/socket.ts`.
4. **Team Battle state** — Database is the **source of truth**; WebSocket events are notifications that trigger client refetches (`useBattleState` hook).

### Build Pipeline

```bash
npm run build
# 1. vite build  → client/dist (frontend)
# 2. esbuild     → dist/index.js (bundled server)
# Production serves from dist/public
```

---

## 4. Directory Structure

```
wisdomLocal/
├── client/                    # React frontend (Vite root)
│   ├── index.html
│   ├── public/                # Static assets (logos, etc.)
│   └── src/
│       ├── App.tsx            # Router, providers, voice cleanup
│       ├── index.css          # Global Tailwind styles
│       ├── pages/             # Route-level page components
│       ├── components/        # Feature + UI components
│       │   └── ui/            # shadcn/Radix UI primitives (~48 components)
│       ├── hooks/             # React hooks (auth, battle state, toast)
│       └── lib/               # Utilities (socket, sounds, voice, API)
├── server/                    # Express backend
│   ├── index.ts               # Entry point, CORS, DB init, stale battle cleanup
│   ├── routes.ts              # REST API (~3850 lines)
│   ├── socket.ts              # WebSocket handlers (~8600 lines)
│   ├── database.ts            # Drizzle DB layer (~3500 lines)
│   ├── auth.ts                # Passport + session setup
│   ├── openai.ts              # AI question generation
│   ├── question-validation.ts # Question validation service
│   ├── email.ts               # SendGrid email invitations
│   ├── logger.ts              # Request logging
│   ├── vite.ts                # Vite dev middleware integration
│   └── init-db.ts, db-setup.ts, create-db.ts, setup-database.ts
├── shared/
│   └── schema.ts              # Drizzle tables, Zod schemas, TypeScript types
├── migrations/                # SQL migration files
├── scripts/                   # Migration and seed scripts
├── attached_assets/           # Runtime image assets (e.g. HP HOLMES.jpg)
├── .cursor/rules/             # Cursor AI rules (e.g. toss phase isolation)
├── drizzle.config.ts
├── vite.config.ts
├── tsconfig.json
├── vercel.json                # Static frontend deploy config
└── package.json
```

---

## 5. Database Schema

All tables are defined in `shared/schema.ts` using Drizzle ORM.

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts, admin flag, online status, team battle availability, stats (wins/losses/draws) |
| `questions` | Trivia questions with JSON `answers` array (4 choices, 1 correct) |
| `sessions` | PostgreSQL session store for express-session |
| `game_sessions` | Multiplayer session metadata (players, status, category) |
| `game_results` | Legacy multiplayer result records |
| `single_player_scores` | Single-player game scores |
| `multiplayer_scores` | Real-time multiplayer scores |

### Social & Challenge Tables

| Table | Purpose |
|-------|---------|
| `challenges` | Async 1v1 challenges (pending → accepted → completed) |
| `challenge_results` | Per-player answers and scores for challenges |
| `notifications` | In-app notifications (challenge events) |

### Team Battle Tables

| Table | Purpose |
|-------|---------|
| `team_battles` | Two-team battle records (Team A vs Team B, scores, ready timestamps) |
| `teams` | Legacy/in-session team objects with members JSON |
| `team_invitations` | Opponent and teammate invitations |
| `team_join_request` | Join requests for open teams |

### Analytics & Voice Tables

| Table | Purpose |
|-------|---------|
| `user_question_history` | Prevents question repetition per user |
| `question_analytics` | ML-oriented stats (correct rate, popularity, difficulty rating) |
| `voice_settings` | Active ElevenLabs voice clone config |
| `voice_usage` | ElevenLabs credit usage tracking |

### Key User Fields

- `isOnline` — Real-time presence
- `isInTeamBattle` — Whether user is in team battle module (availability filtering)
- `currentTeamBattleMode` — `'team_battle'` | `'rapid_fire'` | `null` for mode isolation

### Question Categories

- Old Testament
- New Testament
- Bible Stories
- Famous People
- Theme-Based

### Difficulty Levels

- Beginner
- Intermediate
- Advanced

---

## 6. Game Modes & Features

### 6.1 Single Player

- **Question-based** — Fixed number of questions, score by correctness
- **Time-based** — Answer as many questions as possible within a time limit
- Configurable category and difficulty from Home → Game Setup
- Scores saved to `single_player_scores`
- Voice narration via ElevenLabs (optional)
- Sound effects via Howler

### 6.2 Real-Time Multiplayer

- Multiple players join a shared WebSocket game session
- Synchronized question flow
- Live leaderboard updates
- Scores saved to `multiplayer_scores`

### 6.3 Async Challenges

- Send a challenge to another registered user
- Both players play independently on the same question set
- Results compared when both complete (winner, draw)
- 24-hour expiration
- In-app notifications via WebSocket + `notifications` table

### 6.4 Team Battle (Primary Multiplayer Feature)

Two sub-modes:

| Mode | Description |
|------|-------------|
| **Team Battle** | Classic 2-team format with toss phase, alternating turns, captain finalization |
| **Rapid Fire** | Faster-paced variant with separate question pipeline |

Flow: Setup → Invite teammates/opponent → Both teams ready → Countdown → Toss → 10 questions → Results

### 6.5 Admin Panel (`/admin`)

- CRUD for trivia questions
- AI question generation (OpenAI)
- Bulk upload/validate/store questions
- Question analytics dashboard
- ElevenLabs voice management (list, set active, usage stats)
- Admin-only debug endpoints

### 6.6 Other Features

- **Leaderboard** — Aggregated scores by game type/category
- **Game History** — Past game records for logged-in users
- **Welcome Tutorial & FAQ** — Onboarding on Home page
- **Navigation Guard** — Prevents accidental leave during active games
- **Reward Modal** — Achievement celebrations

---

## 7. Team Battle System

Team Battle is the most complex subsystem. It spans `server/socket.ts`, `server/routes.ts`, `client/src/pages/TeamBattleSetup.tsx`, `TeamBattleGame.tsx`, and `useBattleState.ts`.

### 7.1 Battle Phases (Database-Authoritative)

| DB `status` | API `phase` | Description |
|-------------|-------------|-------------|
| `forming` | `LOBBY` / `forming` | Teams being assembled, invitations pending |
| `ready` | `COUNTDOWN` / `countdown` | Both teams marked ready, countdown active |
| `playing` | `IN_GAME` / `started` | Active gameplay |
| `finished` | `FINISHED` / `finished` | Battle complete |

Key endpoints:

- `GET /api/team-battle/state?gameSessionId=` — Full battle state (source of truth)
- `GET /api/team-battle/phase?gameSessionId=` — Phase + participant authorization
- `POST /api/team-battle/start` — Start battle when both teams ready

### 7.2 Toss Phase (Critical Isolation Rule)

Before main questions, a **toss question** determines which team goes first (Team A vs Team B sides).

**Cursor rule (`.cursor/rules/toss-guidelines.mdc`):**

When `phase === "toss"` the server MUST:

- Route all `submit_team_answer` events to `handleTossSubmission`
- Prevent normal question pipeline code from executing
- Never emit `team_answer_finalized` or `team_battle_question_results`
- Store toss answers in `tossMemberAnswers` (per-team temporary map)
- Only call `finalizeTossWinner` when a correct submission is received

After toss: `phase` becomes `"in_game"`, winning team assigned side `"A"`, loser side `"B"`.

### 7.3 Question Flow (Standard Team Battle)

- **10 total questions** — Team A: odd (1,3,5,7,9), Team B: even (2,4,6,8,10)
- **History-aware selection** — Excludes questions seen by any team member in last 48 hours
- **Team member suggestions** → Captain **finalizes** team answer
- **Turn-based** — Only the answering team's members participate per question

### 7.4 Setup & Invitations

- Captain creates team, invites teammates and opponent captain
- Invitation types: `opponent` | `teammate`
- Team sides: `A` | `B`
- Join requests for open teams via `team_join_request`
- Email invitations via SendGrid (optional)
- Online/availability filtering via `isInTeamBattle` and `currentTeamBattleMode`

### 7.5 State Management Architecture

```
┌──────────────┐     refetch      ┌─────────────────────┐
│  WebSocket   │ ───────────────► │ useBattleState hook │
│  (notify)    │                  │ React Query         │
└──────────────┘                  └──────────┬──────────┘
                                           │ fetch
                                           ▼
                                GET /api/team-battle/state
                                           │
                                           ▼
                                    PostgreSQL (team_battles)
```

WebSocket events like `team_ready_status`, `teams_updated`, `team_state_restored` trigger debounced refetches — they do **not** directly drive UI state.

### 7.6 Battle Cleanup

On server startup (`server/index.ts`):

- Stuck `playing` battles older than 15 minutes → `finished`
- Abandoned `forming` battles older than 30 minutes → `finished`

Centralized reset function `resetBattleState()` in `socket.ts` handles captain leave, battle end, abandonment, and cleanup endpoints.

---

## 8. Authentication & Sessions

**File:** `server/auth.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/register` | POST | Create account (scrypt password hash), auto-login |
| `/api/login` | POST | Passport local login |
| `/api/logout` | POST | Destroy session, mark user offline |
| `/api/user` | GET | Current authenticated user |

- Passwords hashed with **scrypt** (64-byte key, random salt)
- Sessions stored in PostgreSQL via `connect-pg-simple`
- Session cookie max age: 24 hours
- `ProtectedRoute` component guards frontend routes (`adminOnly` flag for `/admin`)
- WebSocket authenticates via `authenticate` event with `userId`

---

## 9. REST API Reference

All routes registered in `server/routes.ts`. Middleware: `ensureAuthenticated`, `ensureAdmin`.

### Questions & Game

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/questions` | Admin | List/filter questions |
| `POST /api/questions` | Admin | Create question |
| `PUT /api/questions/:id` | Admin | Update question |
| `DELETE /api/questions/:id` | Admin | Delete question |
| `POST /api/questions/generate` | Admin | AI-generate questions (OpenAI) |
| `POST /api/questions/upload` | Admin | Bulk upload |
| `POST /api/questions/validate` | Admin | Validate question JSON |
| `POST /api/questions/store` | Admin | Store validated questions |
| `POST /api/questions/edit` | Admin | Edit with validation |
| `GET /api/game/questions` | Public | Fetch questions for gameplay |
| `POST /api/game/results` | Public | Save game result |
| `POST /api/multiplayer/scores` | Public | Save multiplayer score |
| `GET /api/leaderboard` | Public | Leaderboard data |
| `POST /api/question-analytics/track` | Public | Track question performance |
| `GET /api/admin/question-stats` | Admin | Question analytics dashboard |

### Challenges & Notifications

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/challenges` | User | User's challenges |
| `GET /api/challenges/:id` | User | Challenge detail |
| `GET /api/notifications` | User | User notifications |
| `PATCH /api/notifications/:id` | User | Mark notification read |
| `DELETE /api/notifications/:id` | User | Delete notification |

### Users & Presence

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/users` | User | List users |
| `GET /api/users/online` | User | Online users |
| `GET /api/users/available` | User | Available for multiplayer |
| `GET /api/users/team-battle-available` | User | Available for team battle |
| `PATCH /api/users/:id/online` | User | Update online status |
| `PATCH /api/users/:id/team-battle-status` | User | Set team battle availability |
| `GET /api/users/:id/pending-team-invitations` | User | Pending invitations |

### Teams & Team Battle

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/teams` | User | Create team |
| `GET /api/teams` | User | List teams |
| `GET /api/teams/available` | User | Joinable teams |
| `PATCH /api/teams/:id` | User | Update team |
| `DELETE /api/teams/:id/leave` | User | Leave team |
| `PATCH /api/teams/:id/remove-member` | User | Captain removes member |
| `POST /api/team-invitations` | User | Send invitation |
| `GET /api/team-invitations` | User | List invitations |
| `PATCH /api/team-invitations/:id` | User | Accept/decline invitation |
| `GET /api/team-join-requests` | User | List join requests |
| `POST /api/team-join-requests` | User | Request to join team |
| `PATCH /api/team-join-requests/:id` | User | Accept/reject join request |
| `POST /api/team-battle/start` | User | Start battle |
| `GET /api/team-battle/phase` | User | Battle phase |
| `GET /api/team-battle/state` | User | Full battle state |
| `POST /api/team-battle/cleanup` | User | Cleanup stale battle |

### Voice (ElevenLabs)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/voice/status` | Public | Active voice clone status |
| `POST /api/voice/speak` | Public | Text-to-speech |
| `GET /api/voice/list` | Admin | List available voices |
| `GET /api/voice/usage` | Admin | Usage/credit stats |
| `POST /api/voice/set-active` | Admin | Set active voice |
| `DELETE /api/voice/delete` | Admin | Delete voice config |

### Debug (Admin / Dev)

| Endpoint | Description |
|----------|-------------|
| `POST /api/debug/clear-game-state` | Clear in-memory game state |
| `GET /api/debug/test-db` | DB connectivity test |
| `POST /api/debug/cleanup-battles` | Manual battle cleanup |
| `POST /api/debug/cleanup-questions` | Question cleanup |
| `GET /api/debug/active-game-sessions` | List active sessions |

---

## 10. WebSocket Events

**Server file:** `server/socket.ts`  
**Client file:** `client/src/lib/socket.ts`

### Client → Server (Incoming)

| Event | Purpose |
|-------|---------|
| `ping` | Keep-alive |
| `authenticate` | Bind socket to userId |
| `join_game` / `create_game` / `start_game` | Real-time multiplayer lifecycle |
| `submit_answer` / `leave_game` | Player actions |
| `create_challenge` / `accept_challenge` / `decline_challenge` | Async challenges |
| `submit_challenge_answer` / `complete_challenge` | Challenge gameplay |
| `create_team` / `join_team` / `invite_to_team` | Team management |
| `accept_team_invitation` / `decline_team_invitation` | Invitation handling |
| `submit_team_answer` / `finalize_team_answer` | Team battle answers |
| `team_ready` / `team_battle_ready` | Ready state |
| `start_team_battle` | Begin battle |
| `get_game_state` / `rejoin_team` | State sync / reconnection |
| `team_battle_setup_session` | Setup phase sync |
| `player_leaving_team_battle` / `player_leaving_team_setup` | Graceful leave |
| `recruit_player` / `send_email_invitation` | Recruitment |
| `team_option_selected` | Member answer suggestion |

### Server → Client (Outgoing)

| Event | Purpose |
|-------|---------|
| `connection_established` / `authenticated` / `pong` | Connection lifecycle |
| `player_joined` / `player_left` / `game_started` / `game_ended` | Multiplayer |
| `answer_submitted` | Answer feedback |
| `challenge_*` / `notification` | Challenge system |
| `teams_updated` / `team_ready_status` / `team_state_restored` | Team battle sync |
| `team_battle_started` / `team_battle_question` | Battle gameplay |
| `team_battle_toss` / `team_battle_toss_feedback` / `team_battle_toss_result` | Toss phase |
| `captain_left_team` / `opponent_disconnected` / `teammate_disconnected` | Disconnect handling |
| `join_request_created` / `join_request_updated` | Join requests |
| `online_users_updated` | Presence |
| `error` | Error messages |

---

## 11. Frontend Application

### 11.1 Routes (`client/src/App.tsx`)

| Path | Component | Access |
|------|-----------|--------|
| `/` | `Home` | Authenticated |
| `/play`, `/game` | `Game` | Authenticated |
| `/team-battle` | `TeamBattleSetup` | Authenticated |
| `/team-battle-game` | `TeamBattleGame` | Authenticated |
| `/leaderboard` | `Leaderboard` | Authenticated |
| `/game-history` | `GameHistory` | Authenticated |
| `/challenges` | `ChallengesPage` | Authenticated |
| `/challenge/:id` | `ChallengePage` | Authenticated |
| `/auth` | `AuthPage` | Public |
| `/admin` | `AdminPanel` | Admin only |

### 11.2 Key Pages

| Page | Responsibility |
|------|----------------|
| `Home.tsx` | Landing, game mode selection, team battle entry, notifications badge, tutorial/FAQ |
| `Game.tsx` | Single/multiplayer gameplay, URL params for config (`gameMode`, `gameType`, `category`, etc.) |
| `TeamBattleSetup.tsx` | Team creation, invitations, ready state, opponent matching |
| `TeamBattleGame.tsx` | Active team battle UI, toss, questions, captain controls, disconnect dialogs |
| `AdminPanel.tsx` | Question CRUD, AI generation, voice settings, analytics |
| `AuthPage.tsx` | Login / register forms |
| `Leaderboard.tsx` | Score rankings |
| `ChallengesPage.tsx` / `ChallengePage.tsx` | Async challenge list and gameplay |

### 11.3 Key Components

| Component | Purpose |
|-----------|---------|
| `GameBoard.tsx` | Question display and answer selection |
| `GameSetup.tsx` | Single-player configuration modal |
| `TeamBattleSetup.tsx` | Team battle lobby UI (also used on Home) |
| `TeamBattleQuestionBoard.tsx` | Team battle question UI with member suggestions |
| `TeamDisplay.tsx` | Team roster display |
| `TeamMultiplayer.tsx` | Real-time multiplayer team UI |
| `GameHeader.tsx` / `GameSidebar.tsx` | Game layout chrome |
| `LeaderboardModal.tsx` / `RewardModal.tsx` | Overlays |
| `FeedbackModal.tsx` | Post-answer feedback |
| `NotificationPanel.tsx` | In-app notifications |
| `ChallengePanel.tsx` | Challenge creation UI |
| `ProtectedRoute.tsx` | Auth + admin route guard |
| `NavigationGuardProvider.tsx` | Prevents navigation during active games |

### 11.4 Hooks & Libraries

| File | Purpose |
|------|---------|
| `use-auth.tsx` | Auth context, login/logout/register mutations, socket sync |
| `useBattleState.ts` | DB-authoritative team battle state via React Query |
| `useTeamBattleSetup.ts` | Team battle setup logic |
| `socket.ts` | WebSocket client, reconnect, event listeners |
| `voice-service.ts` | ElevenLabs TTS singleton with session management |
| `sounds.ts` / `basic-sound.ts` | Howler sound effects and browser TTS fallback |
| `trivia-api.ts` | Admin question API helpers |
| `queryClient.ts` | TanStack Query client + `apiRequest` helper |
| `navigationGuard.ts` | `beforeunload` / route leave protection |

### 11.5 UI System

Built on **shadcn/ui** pattern with Radix UI primitives in `client/src/components/ui/` (~48 components): Button, Dialog, Card, Select, Toast, Sidebar, Chart, etc.

Path aliases (Vite):

- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

---

## 12. Backend Services

| Service | File | Description |
|---------|------|-------------|
| **Database layer** | `database.ts` | Full CRUD for all entities; history-aware question selection; team battle operations |
| **OpenAI** | `openai.ts` | Generate Bible trivia questions with structured JSON output |
| **Question validation** | `question-validation.ts` | Validates structure, categories, difficulty, duplicate answers |
| **Email** | `email.ts` | SendGrid team invitation emails |
| **Logger** | `logger.ts` | API request logging with truncation |
| **Vite integration** | `vite.ts` | Dev-only HMR middleware |

### Database Initialization Scripts

| Script | Purpose |
|--------|---------|
| `create-db.ts` | Create PostgreSQL database |
| `setup-database.ts` | User/permission setup |
| `db-setup.ts` | Schema push |
| `init-db.ts` | Seed initial data |

---

## 13. External Integrations

| Service | Env Variable | Usage |
|---------|-------------|-------|
| **PostgreSQL** | `DATABASE_URL` | Primary database (Neon serverless supported) |
| **OpenAI** | `OPENAI_API_KEY` | Admin AI question generation |
| **ElevenLabs** | `ELEVENLABS_API_KEY`, `ELEVENLABS_BASE_URL` | Voice cloning & TTS narration |
| **SendGrid** | `SENDGRID_API_KEY` | Email team invitations |
| **Session** | `SESSION_SECRET` | Express session signing |
| **Client URL** | `CLIENT_URL` | Links in invitation emails |

---

## 14. Environment Variables

Create a `.env` file at the project root:

```env
DATABASE_URL=postgresql://user:password@host:5432/bible_trivia_db
SESSION_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
ELEVENLABS_BASE_URL=https://api.elevenlabs.io/v1
SENDGRID_API_KEY=SG....
CLIENT_URL=http://localhost:5001
NODE_ENV=development
```

---

## 15. Scripts & Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (tsx + Vite HMR) on port 5001 |
| `npm run build` | Build client + bundle server |
| `npm run start` | Run production server (`node dist/index.js`) |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Push Drizzle schema to DB |
| `npm run db:create` | Create database |
| `npm run db:setup` | Create + setup schema |
| `npm run db:init` | Alias for db:setup |
| `npm run db:init-full` | Full DB initialization pipeline |
| `npm run db:migrate-ready` | Migrate team ready timestamps |
| `npm run migrate:team-battles-game-type` | Team battles game type migration |
| `npm run migrate:add-current-team-battle-mode` | Add currentTeamBattleMode column |
| `npm run preview` | Vite preview on port 4173 |

### Utility Scripts (`scripts/`)

- `migrate-team-battles-game-type.ts`
- `migrate-add-current-team-battle-mode.ts`
- `seed-default-commentator.ts`
- `add-current-team-battle-mode.sql`

### Root Maintenance Scripts

- `cleanup-old-battles.js` — Remove stale battles
- `reset-team-battle-status.cjs` — Reset user team battle flags
- `run-migration.cjs` / `production-migration.cjs` — Team battle availability column migration helpers

---

## 16. Deployment

### Production Build

```bash
npm run build
NODE_ENV=production npm run start
```

Server listens on `localhost:5001`, serves static files from `dist/public`.

### Vercel (Frontend Only)

`vercel.json` configures static build from `client/dist`. Note: WebSocket/API requires the Express server deployed separately (not covered by Vercel static config alone).

---

## 17. Development Conventions

### Team Battle Toss Isolation

See `.cursor/rules/toss-guidelines.mdc` — enforced rule for AI assistants working on toss phase logic.

### State Authority

- **Team battle lobby/ready:** PostgreSQL (`team_battles.teamAReadyAt`, `teamBReadyAt`)
- **In-game realtime:** In-memory `gameSessions` Map in `socket.ts`, synced via WebSocket
- **Client:** Always refetch from `/api/team-battle/state` on WS notifications

### Code Organization Patterns

- Shared types live in `shared/schema.ts` — import as `@shared/schema`
- API calls use `apiRequest()` from `queryClient.ts`
- React Query keys mirror API paths (e.g., `["/api/challenges"]`)
- Voice/audio stopped on route changes (except game routes)

---

## 18. Related Documentation

| File | Topic |
|------|-------|
| `README.md` | Project summary and getting started |
| `USER_FLOW.md` | Plain-English walkthrough of how players use the app |

---

## Quick Start (New Developer)

```bash
# 1. Clone and install
git clone <repo-url>
cd wisdomLocal
npm install

# 2. Configure environment
cp .env.example .env   # or create .env manually
# Set DATABASE_URL and other keys

# 3. Initialize database
npm run db:init-full

# 4. Start development
npm run dev

# 5. Open browser
# http://localhost:5001
# Register a user, then promote to admin via DB if needed (is_admin = true)
```

---

*This document provides a comprehensive map of the Wisdom Local / FaithIQ Bible Trivia codebase. For implementation details on specific subsystems, refer to the source files and the related documentation listed in Section 18.*
