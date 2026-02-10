# Quiz App — Comprehensive Codebase Audit Report

**Date:** February 10, 2026
**Scope:** Full-stack audit of the Quiz App monorepo — React SPA + Cloudflare Worker API
**Repository:** `quizapp`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Project Structure](#3-project-structure)
4. [Codebase Metrics](#4-codebase-metrics)
5. [Frontend Audit (React SPA)](#5-frontend-audit-react-spa)
   - 5.1 [Component Architecture](#51-component-architecture)
   - 5.2 [State Management](#52-state-management)
   - 5.3 [Routing](#53-routing)
   - 5.4 [Custom Hooks](#54-custom-hooks)
   - 5.5 [Type System](#55-type-system)
   - 5.6 [Styling](#56-styling)
6. [Backend Audit (Cloudflare Worker)](#6-backend-audit-cloudflare-worker)
   - 6.1 [API Design](#61-api-design)
   - 6.2 [Authentication & Authorization](#62-authentication--authorization)
   - 6.3 [Database Layer (D1)](#63-database-layer-d1)
   - 6.4 [Object Storage (R2)](#64-object-storage-r2)
   - 6.5 [Input Validation](#65-input-validation)
7. [Networking & P2P Layer](#7-networking--p2p-layer)
   - 7.1 [PeerManager Singleton](#71-peermanager-singleton)
   - 7.2 [Message Protocol](#72-message-protocol)
   - 7.3 [Reconnection Logic](#73-reconnection-logic)
8. [Security Audit](#8-security-audit)
   - 8.1 [Authentication Security](#81-authentication-security)
   - 8.2 [CORS & Origin Validation](#82-cors--origin-validation)
   - 8.3 [Input Sanitization](#83-input-sanitization)
   - 8.4 [Secret Management](#84-secret-management)
9. [Performance Analysis](#9-performance-analysis)
10. [CI/CD & Deployment](#10-cicd--deployment)
11. [Known Limitations & Technical Debt](#11-known-limitations--technical-debt)
12. [Recommendations](#12-recommendations)
    - 12.1 [Critical](#121-critical)
    - 12.2 [High Priority](#122-high-priority)
    - 12.3 [Medium Priority](#123-medium-priority)
    - 12.4 [Low Priority](#124-low-priority)
13. [Risk Matrix](#13-risk-matrix)
14. [Conclusion](#14-conclusion)

---

## 1. Executive Summary

Quiz App is a **real-time multiplayer quiz platform** built with a modern serverless stack. The frontend is a React 19 SPA using PeerJS for WebRTC-based peer-to-peer gameplay, while the backend is a Hono-based Cloudflare Worker providing authentication, quiz persistence, image hosting, and short link resolution.

### Strengths

- **Clean architecture** — clear separation between P2P game logic, UI components, and API layer
- **Singleton PeerManager** — robust peer lifecycle management decoupled from React
- **Comprehensive type system** — TypeScript used end-to-end with well-defined message protocols
- **Security-conscious auth** — PBKDF2 password hashing, JWT with rotation, httpOnly cookies, in-memory token storage
- **Graceful degradation** — cloud image upload falls back to inline base64 seamlessly
- **Zero-server gameplay** — the host's browser IS the server; no ongoing backend costs during games

### Areas of Concern

- **No automated tests** — zero unit, integration, or E2E tests
- **No error boundaries** — React error boundary missing; uncaught errors crash the entire app
- **Eager image uploads** — images uploaded to R2 on selection, not on save (orphan accumulation)
- **Player peer not a singleton** — unlike host, player peer is tied to React lifecycle
- **No rate limiting** — API endpoints unprotected against brute-force or abuse

### Overall Assessment: **Good** (7/10)

The codebase is well-organized, type-safe, and follows modern React patterns. The primary gaps are in testing, error resilience, and a few security hardening items.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         QUIZ APP ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    WebRTC (P2P)     ┌──────────────┐              │
│  │ Player's     │ ◄─────────────────► │ Host's       │              │
│  │ Browser      │   Data Channels     │ Browser      │              │
│  │ (React SPA)  │                     │ (React SPA)  │              │
│  └──────┬───────┘                     └──────┬───────┘              │
│         │                                    │                      │
│         │  Initial                           │  Quiz CRUD           │
│         │  Handshake                         │  Auth                │
│         │  (PeerJS Cloud)                    │  Image Upload        │
│         │                                    │                      │
│  ┌──────▼────────────────────────────────────▼───────┐              │
│  │              Cloudflare Worker (Hono)              │              │
│  │    ┌──────────┐  ┌──────────┐  ┌──────────┐       │              │
│  │    │ Auth API │  │ Quiz API │  │ Image API│       │              │
│  │    └────┬─────┘  └────┬─────┘  └────┬─────┘       │              │
│  │         │             │             │              │              │
│  │    ┌────▼─────────────▼────┐  ┌─────▼──────┐      │              │
│  │    │   Cloudflare D1       │  │ Cloudflare │      │              │
│  │    │   (SQLite Database)   │  │ R2 (Object │      │              │
│  │    │   - users             │  │  Storage)  │      │              │
│  │    │   - quizzes           │  │ - images   │      │              │
│  │    │   - refresh_tokens    │  └────────────┘      │              │
│  │    └───────────────────────┘                       │              │
│  └────────────────────────────────────────────────────┘              │
│                                                                     │
│  ┌──────────────────────────────────┐                               │
│  │        GitHub Pages              │                               │
│  │   Static SPA Hosting (dist/)     │                               │
│  └──────────────────────────────────┘                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **P2P via WebRTC** | Zero-cost real-time gameplay; host browser = game server |
| **HashRouter** | GitHub Pages compatible (no server-side URL rewriting) |
| **PeerManager singleton** | Peer lifecycle independent of React mount/unmount cycles |
| **Cloudflare D1 + R2** | Serverless persistence; free tier sufficient for hobby use |
| **JWT with httpOnly cookie** | Access tokens in memory; refresh tokens in secure cookies |
| **PBKDF2 via Web Crypto** | Workers-compatible password hashing (no Node.js crypto) |
| **Hono framework** | Lightweight, TypeScript-native, Workers-optimized |

---

## 3. Project Structure

```
quizapp/
├── .github/
│   └── workflows/
│       ├── deploy.yml              # SPA → GitHub Pages
│       └── deploy-worker.yml       # Worker → Cloudflare Workers
├── src/
│   ├── components/                 # 13 React components
│   │   ├── Avatar.tsx              # Avatar display component
│   │   ├── AvatarPicker.tsx        # Avatar selection UI
│   │   ├── Home.tsx                # Landing page
│   │   ├── HostPage.tsx            # Host game controller
│   │   ├── Login.tsx               # Login form
│   │   ├── MyQuizzes.tsx           # Dashboard for saved quizzes
│   │   ├── PlayerGame.tsx          # Player in-game view
│   │   ├── PlayerJoin.tsx          # Join game form
│   │   ├── QuizCreator.tsx         # Quiz builder/editor
│   │   ├── QuizImport.tsx          # Import/share quiz
│   │   ├── Scoreboard.tsx          # Score display
│   │   ├── Signup.tsx              # Registration form
│   │   └── ThemeSelector.tsx       # Theme picker
│   ├── config/
│   │   └── themes.ts               # Theme definitions
│   ├── constants/
│   │   └── avatars.ts              # Avatar emoji + color definitions
│   ├── contexts/
│   │   └── AuthContext.tsx          # React auth context + provider
│   ├── hooks/
│   │   ├── useAuth.ts              # Auth context consumer
│   │   ├── useFitText.ts           # Dynamic text scaling
│   │   ├── useFullscreen.ts        # Fullscreen API wrapper
│   │   ├── useGameState.ts         # Game phase reducer
│   │   ├── useHost.ts              # Host-side P2P networking
│   │   ├── useHostUrl.ts           # Host URL detection
│   │   └── usePlayer.ts            # Player-side P2P networking
│   ├── types/
│   │   ├── game.ts                 # Game state types
│   │   ├── messages.ts             # P2P message protocol types
│   │   └── quiz.ts                 # Quiz data structures
│   ├── utils/
│   │   ├── apiClient.ts            # API client with token refresh
│   │   ├── fetchQuiz.ts            # Quiz fetching utility
│   │   ├── gameCode.ts             # 4-char game code generator
│   │   ├── getHostUrl.ts           # Host URL builder
│   │   ├── imageCompression.ts     # Client-side image compression
│   │   ├── imageUpload.ts          # R2 upload client
│   │   ├── peer.ts                 # Player-side PeerJS factory
│   │   ├── peerManager.ts          # Host-side PeerJS singleton
│   │   ├── quizLink.ts             # Quiz sharing link builder
│   │   ├── quizValidator.ts        # Quiz JSON validation
│   │   ├── scoring.ts              # Score calculation engine
│   │   ├── theme.ts                # Theme application utility
│   │   └── urlNormalizer.ts        # URL normalization
│   ├── App.tsx                     # Root component + routes
│   ├── main.tsx                    # Entry point (HashRouter)
│   ├── index.css                   # Global styles
│   ├── themes.css                  # Theme CSS variables
│   └── vite-env.d.ts               # Vite type declarations
├── worker/
│   └── src/
│       ├── index.ts                # Worker entry (Hono app)
│       ├── types.ts                # Worker environment types
│       ├── lib/
│       │   ├── jwt.ts              # JWT sign/verify (Web Crypto)
│       │   ├── nanoid.ts           # ID generator
│       │   ├── password.ts         # PBKDF2 password hashing
│       │   └── validator.ts        # Server-side quiz validation
│       ├── middleware/
│       │   ├── auth.ts             # JWT auth middleware
│       │   └── cors.ts             # CORS middleware
│       └── routes/
│           ├── auth.ts             # Auth endpoints
│           ├── quizzes.ts          # Quiz CRUD endpoints
│           └── shortlinks.ts       # Short link redirects
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts (implied)
├── TODO.md
├── README.md
└── TESTING.md
```

---

## 4. Codebase Metrics

| Metric | Value |
|--------|-------|
| **Frontend TypeScript (src/)** | ~9,342 lines |
| **Backend TypeScript (worker/src/)** | ~1,747 lines |
| **CSS (src/)** | ~5,061 lines |
| **Total TypeScript** | ~11,089 lines |
| **Total LOC (TS + CSS)** | ~16,150 lines |
| **React Components** | 13 |
| **Custom Hooks** | 7 |
| **Utility Modules** | 13 |
| **API Routes** | 12 endpoints |
| **Worker Routes Files** | 3 (auth, quizzes, shortlinks) |
| **CI/CD Workflows** | 2 (SPA deploy, Worker deploy) |
| **Test Files** | 0 |
| **Question Types** | 4 (Multiple Choice, True/False, Slider, Multi-Choice) |

### Dependency Profile

#### Frontend (`package.json`)

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `react` | ^19.0.0 | UI framework |
| `react-dom` | ^19.0.0 | DOM renderer |
| `react-router-dom` | ^7.13.0 | Client-side routing |
| `peerjs` | ^1.5.5 | WebRTC abstraction (P2P) |
| `qrcode.react` | ^4.2.0 | QR code generation |

#### Backend (`worker/package.json`)

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `hono` | ^4.7.0 | HTTP framework |
| `@hono/zod-validator` | ^0.4.2 | Request validation |
| `zod` | ^3.24.0 | Schema validation |
| `nanoid` | ^5.1.0 | ID generation |

**Assessment:** Minimal dependency footprint. Only 5 runtime frontend dependencies and 4 backend dependencies. No UI framework (native CSS), no state management library (hooks + context), no ORM. This is commendable for maintainability and bundle size.

---

## 5. Frontend Audit (React SPA)

### 5.1 Component Architecture

The app uses 13 page-level components mapped directly to routes. There are no shared UI component libraries or design system abstractions — components are self-contained with co-located CSS.

```
Route Map:
  /               → Home
  /login          → Login
  /signup         → Signup
  /my-quizzes     → MyQuizzes
  /create         → QuizCreator
  /import         → QuizImport
  /q/:id          → ShortLinkRedirect → /import?quizId=:id
  /host           → HostPage
  /join/:gameCode → PlayerJoin
  /play           → PlayerGame
```

**Findings:**

| Finding | Severity | Detail |
|---------|----------|--------|
| No error boundaries | Medium | An uncaught error in any component crashes the entire app |
| No loading skeletons | Low | Components show raw loading states; no skeleton placeholders |
| Large component files | Low | `HostPage.tsx` and `QuizCreator.tsx` are likely the largest; could benefit from extraction |
| Co-located CSS works well | Positive | Each component has its own `.css` file — good maintainability |

### 5.2 State Management

The app uses a **layered state management** approach:

```
Layer 1: Module-level Singletons
  └── peerManager.ts (PeerJS peer, game code, connection state)

Layer 2: React Context
  └── AuthContext.tsx (user, tokens, login/signup/logout)

Layer 3: Custom Hooks
  ├── useGameState.ts (useReducer — game phase FSM)
  ├── useHost.ts (player map, connections, answers — refs + state)
  └── usePlayer.ts (connection status, messages — refs + state)

Layer 4: Component-level State
  └── useState in individual components
```

**Game Phase State Machine (useGameState):**

```
lobby ──START_QUIZ──► question ──REVEAL_ANSWER──► answer_reveal
                          ▲                           │
                          │                    SHOW_ANSWER_SUMMARY
                          │                           │
                     NEXT_QUESTION              answer_summary
                          │                           │
                          └───────────────────────────┘
                                                      │
                                                 FINISH_GAME
                                                      │
                                                      ▼
                                                  finished
```

**Assessment:** The reducer-based game state machine is clean and predictable. The separation between game phase management (`useGameState`) and player/network management (`useHost`) is well-designed. The use of `useSyncExternalStore` to bridge the PeerManager singleton into React is a modern, correct approach.

### 5.3 Routing

- **HashRouter** used for GitHub Pages compatibility (no server-side URL rewriting needed)
- **ShortLinkRedirect** component handles `/q/:id` → `/import?quizId=:id` client-side
- **No route guards** — protected routes (e.g., `/my-quizzes`) must handle auth checks internally
- **No lazy loading** — all route components are eagerly imported

### 5.4 Custom Hooks

| Hook | Purpose | Complexity | Quality |
|------|---------|------------|---------|
| `useHost` | Host-side P2P networking, player management | High | Well-structured; uses refs for non-rendering state |
| `usePlayer` | Player-side P2P networking, reconnection | High | Good reconnection logic; proper cleanup on unmount |
| `useGameState` | Game phase FSM via `useReducer` | Medium | Clean reducer pattern; predictable transitions |
| `useAuth` | Auth context consumer | Low | Simple context hook with guard |
| `useFitText` | Dynamic text scaling | Low | Utility hook for responsive text |
| `useFullscreen` | Fullscreen API wrapper | Low | Browser API abstraction |
| `useHostUrl` | Host URL detection | Low | URL construction utility |

### 5.5 Type System

The type system is comprehensive and well-structured:

- **`Quiz` / `Question`** — Core quiz data model with support for 4 question types
- **`Player` / `GamePhase` / `PlayerState`** — Game runtime types
- **`PlayerMessage` / `HostMessage`** — Discriminated union types for the P2P message protocol
- **`PlayerAvatar`** — Avatar display data

**Message Protocol Type Safety:**

```typescript
// Player → Host (5 message types)
type PlayerMessage =
  | { type: 'join'; name: string; avatar?: PlayerAvatar }
  | { type: 'rejoin'; name: string; avatar?: PlayerAvatar }
  | { type: 'get_state'; name: string }
  | { type: 'answer'; questionIndex: number; answer: number | number[]; answeredAt?: number }
  | { type: 'ping' };

// Host → Player (12 message types)
type HostMessage =
  | { type: 'welcome'; ... }
  | { type: 'rejoin_success'; ... }
  | { type: 'game_state'; ... }
  | { type: 'player_list'; ... }
  | { type: 'question'; ... }
  | { type: 'answer_ack'; ... }
  | { type: 'answer_reveal'; ... }
  | { type: 'answer_summary'; ... }
  | { type: 'game_over'; ... }
  | { type: 'play_again' }
  | { type: 'theme'; ... }
  | { type: 'error'; ... }
  | { type: 'pong' };
```

**Assessment:** Excellent use of TypeScript discriminated unions for the message protocol. This ensures type safety at compile time for all P2P messages. The `satisfies` keyword is used correctly in `useHost.ts` to validate message shapes.

### 5.6 Styling

- **Native CSS** — no CSS-in-JS, no Tailwind, no UI framework
- **CSS Variables** for theming (`themes.css`)
- **Co-located component CSS** — each component has a matching `.css` file
- **15 CSS files** totaling ~5,061 lines
- **`:has()` selectors** used in 13 instances (noted in TODO.md as optional cleanup)
- **Cross-browser fix applied** — `justify-content: right` → `flex-end`

---

## 6. Backend Audit (Cloudflare Worker)

### 6.1 API Design

The Worker exposes a RESTful JSON API with the following endpoints:

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/health` | Public | Health check |
| `POST` | `/api/upload` | Public | Upload image to R2 |
| `GET` | `/images/:key` | Public | Serve image from R2 |
| `POST` | `/api/auth/signup` | Public | Create account |
| `POST` | `/api/auth/login` | Public | Log in |
| `POST` | `/api/auth/refresh` | Cookie | Rotate refresh token |
| `POST` | `/api/auth/logout` | Cookie | Revoke refresh token |
| `GET` | `/api/auth/me` | Bearer | Get current user |
| `POST` | `/api/quizzes` | Bearer | Create quiz |
| `GET` | `/api/quizzes` | Bearer | List user's quizzes |
| `GET` | `/api/quizzes/:id` | Public | Get quiz by ID |
| `PUT` | `/api/quizzes/:id` | Bearer | Update quiz (owner) |
| `DELETE` | `/api/quizzes/:id` | Bearer | Delete quiz (owner) |
| `GET` | `/q/:id` | Public | Short link redirect |

**Assessment:** Clean REST design. Public/protected endpoints are clearly separated. The short link system (`/q/:id`) provides user-friendly URLs for sharing.

### 6.2 Authentication & Authorization

```
┌──────────────────────────────────────────────────────────────┐
│                    AUTH FLOW                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Signup/Login                                                │
│  ────────────                                                │
│  1. Client sends email + password                            │
│  2. Worker validates via Zod schema                          │
│  3. Password hashed with PBKDF2-SHA256 (100k iterations)     │
│  4. JWT access token signed (HS256, 15-min expiry)           │
│  5. Refresh token generated (nanoid-48, 7-day expiry)        │
│  6. Refresh token hash stored in D1                          │
│  7. Response:                                                │
│     - Body: { user, accessToken }                            │
│     - Set-Cookie: refresh_token (HttpOnly, Secure, Strict)   │
│                                                              │
│  Token Refresh                                               │
│  ─────────────                                               │
│  1. Client sends POST /api/auth/refresh (cookie auto-sent)   │
│  2. Worker looks up token hash in D1                         │
│  3. Old token deleted, new token created (rotation)          │
│  4. New access token + refresh cookie returned               │
│                                                              │
│  API Request                                                 │
│  ───────────                                                 │
│  1. Client attaches Authorization: Bearer <accessToken>      │
│  2. Auth middleware verifies JWT signature + expiry           │
│  3. User looked up in D1 to confirm existence                │
│  4. On 401: client auto-refreshes and retries once           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Security Properties:**

| Property | Implementation | Status |
|----------|---------------|--------|
| Password hashing | PBKDF2-SHA256, 100k iterations, 16-byte salt | Good |
| Timing-safe comparison | Custom `timingSafeEqual()` for password verification | Good |
| Access tokens | JWT HS256, 15-min expiry, in-memory only (no localStorage) | Good |
| Refresh tokens | Random 48-char nanoid, SHA-256 hashed in DB, 7-day expiry | Good |
| Token rotation | Old refresh token deleted on use; new one issued | Good |
| Cookie security | HttpOnly, Secure (prod), SameSite=Strict (prod) | Good |
| Local dev cookies | SameSite=Lax, no Secure flag (for HTTP localhost) | Appropriate |

### 6.3 Database Layer (D1)

The Worker uses Cloudflare D1 (SQLite) with three known tables:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | `id`, `email`, `password_hash`, `display_name` |
| `quizzes` | Quiz storage | `id`, `user_id`, `title`, `question_count`, `quiz_json`, `created_at`, `updated_at` |
| `refresh_tokens` | Token store | `id`, `user_id`, `token_hash`, `expires_at` |

**Observations:**

- Quiz data stored as serialized JSON (`quiz_json` column) — simple but limits server-side querying
- No indexes explicitly visible in the code (may be in migration files)
- `updated_at` uses SQLite's `datetime('now')` for consistency
- Owner-only enforcement on PUT and DELETE via `user_id` check

### 6.4 Object Storage (R2)

Image upload flow:

```
Client                          Worker                       R2
  │                               │                           │
  │  POST /api/upload             │                           │
  │  Content-Type: multipart      │                           │
  │  Body: file                   │                           │
  │ ─────────────────────────────►│                           │
  │                               │  Validate:                │
  │                               │  - Content type           │
  │                               │  - File size (≤ 2 MB)     │
  │                               │                           │
  │                               │  PUT <uuid>.<ext>         │
  │                               │ ─────────────────────────►│
  │                               │                           │
  │                               │  ◄─────────────── OK ─────│
  │                               │                           │
  │  { url: "/images/<key>" }     │                           │
  │ ◄─────────────────────────────│                           │
```

**Security controls:**

- Allowed content types: `image/jpeg`, `image/webp`, `image/png`, `image/gif`
- Max file size: 2 MB (configurable via `MAX_IMAGE_SIZE` env var)
- Image keys: UUID-based (`crypto.randomUUID()`) — unpredictable
- Key sanitization on serve: regex `/^[\w-]+\.\w+$/` prevents path traversal
- Cache headers: `public, max-age=31536000` (1 year, immutable content)

### 6.5 Input Validation

| Layer | Tool | Coverage |
|-------|------|----------|
| **Auth endpoints** | Zod schemas via `@hono/zod-validator` | Email format, password length (8-128), display name (1-100) |
| **Quiz creation** | Custom `validateQuiz()` in Worker | Title, question types, option counts, correctIndex bounds, image validation |
| **Quiz import (client)** | Client-side `quizValidator.ts` | Mirror of server validation + image size warnings |
| **Image upload** | Manual validation in Worker | Content type, file size, key format |
| **P2P messages** | Runtime type checks in `useHost.ts` | Basic `typeof` + `'type' in msg` checks |

**Gap:** P2P messages (`PlayerMessage`) are validated with basic type guards but not with a schema validator. A malicious player could send crafted messages. Since this is browser-to-browser, the risk is limited but worth noting.

---

## 7. Networking & P2P Layer

### 7.1 PeerManager Singleton

The `peerManager.ts` module implements a **module-level singleton** pattern for the host's PeerJS instance:

```typescript
// Module-level state (survives React mount/unmount)
let peer: Peer | null = null;
let gameCode: string | null = null;
const listeners: Set<() => void> = new Set();
const connectionHandlers: Set<(conn: DataConnection) => void> = new Set();
```

**Key behaviors:**

- `initializePeer()` — lazy init; safe to call multiple times
- `useSyncExternalStore` — React bridge to singleton state
- `resetPeer()` — destroy + reinitialize with new game code
- `destroyPeer()` — full cleanup (called on `beforeunload` and HMR)
- Cached snapshot prevents infinite re-render loops

**Assessment:** This is the correct pattern for WebRTC in React. Peer lifecycle tied to React lifecycle causes race conditions (especially in StrictMode). The singleton approach eliminates this class of bugs.

### 7.2 Message Protocol

The protocol uses simple JSON objects over WebRTC data channels:

```
Player → Host:
  join          — Initial join request (name, avatar)
  rejoin        — Reconnection (preserves score)
  get_state     — State sync request (late join/reconnect)
  answer        — Answer submission (index or value)
  ping          — Keep-alive

Host → Player:
  welcome       — Join confirmed
  rejoin_success — Reconnection confirmed (with score)
  game_state    — Full state sync response
  player_list   — Updated player roster
  question      — New question data
  answer_ack    — Answer received confirmation
  answer_reveal — Correct answer + per-player result
  answer_summary — All players' results for a question
  game_over     — Final standings
  play_again    — Game reset signal
  theme         — Theme change notification
  error         — Error message
  pong          — Keep-alive response
```

### 7.3 Reconnection Logic

```
Player disconnects
       │
       ▼
Wait 5 seconds
       │
       ▼
Create fresh PeerJS peer
       │
       ▼
Connect to quiz-<gameCode>
       │
       ├── Success → Send 'rejoin' message
       │                    │
       │                    ▼
       │              Host restores player state
       │              (score, question index preserved)
       │
       └── Failure → Retry (up to 3 attempts)
                         │
                         └── All retries exhausted → Show "failed" UI
```

**Properties:**
- Max 3 reconnection attempts
- 5-second interval between attempts
- Fresh peer created for each attempt (old one destroyed)
- Player score and progress preserved host-side
- Unmount detection prevents zombie reconnection loops

---

## 8. Security Audit

### 8.1 Authentication Security

| Check | Status | Detail |
|-------|--------|--------|
| Password hashing algorithm | PASS | PBKDF2-SHA256 with 100k iterations |
| Salt generation | PASS | 16 bytes from `crypto.getRandomValues()` |
| Timing-safe comparison | PASS | Custom constant-time comparison function |
| Access token storage | PASS | In-memory only (module-level variable, never localStorage) |
| Refresh token storage | PASS | httpOnly cookie; hash stored in D1 |
| Token rotation | PASS | Refresh token rotated on every use |
| JWT expiry | PASS | 15-min access tokens, 7-day refresh tokens |
| Expired token cleanup | PARTIAL | Expired tokens deleted on use, but no background sweep |
| Brute-force protection | FAIL | No rate limiting on login/signup endpoints |
| Account lockout | FAIL | No lockout after failed login attempts |

### 8.2 CORS & Origin Validation

```typescript
// CORS middleware allows:
// 1. Configured CORS_ORIGIN (production SPA domain)
// 2. http://localhost:5173 (Vite dev server)
// 3. http://localhost:3000 (alternative dev port)
```

| Check | Status | Detail |
|-------|--------|--------|
| Origin whitelist | PASS | Only configured + localhost origins allowed |
| Credentials support | PASS | `Access-Control-Allow-Credentials: true` |
| Preflight caching | PASS | `Access-Control-Max-Age: 86400` (24 hours) |
| Methods restricted | PASS | `GET, POST, PUT, DELETE, OPTIONS` only |
| Headers restricted | PASS | Only `Content-Type` and `Authorization` |

### 8.3 Input Sanitization

| Vector | Status | Detail |
|--------|--------|--------|
| Image key path traversal | PASS | Regex `/^[\w-]+\.\w+$/` blocks `../` patterns |
| SQL injection | PASS | All D1 queries use parameterized bindings |
| XSS via player names | PARTIAL | React auto-escapes in JSX, but P2P message content not sanitized |
| Quiz JSON injection | PASS | Validated both client-side and server-side |
| File type validation | PASS | Allowlist of `image/jpeg`, `image/webp`, `image/png`, `image/gif` |

### 8.4 Secret Management

| Secret | Storage | Status |
|--------|---------|--------|
| `JWT_SECRET` | Cloudflare Workers secret (`wrangler secret put`) | Good |
| `.env` files | Added to `.gitignore` | Good |
| API tokens (CI) | GitHub repository secrets | Good |
| Database ID | In `wrangler.toml` (non-secret, but visible) | Acceptable |

---

## 9. Performance Analysis

### Frontend Performance

| Area | Assessment | Detail |
|------|-----------|--------|
| **Bundle size** | Good | Minimal dependencies; no large UI framework |
| **Code splitting** | Missing | All routes eagerly loaded; no `React.lazy()` |
| **Image handling** | Good | Client-side compression (400x400 questions, 200x200 answers) |
| **WebRTC latency** | Excellent | Direct P2P; no server round-trips during gameplay |
| **Re-render efficiency** | Good | `useSyncExternalStore` with cached snapshots; `useCallback` throughout |
| **CSS** | Good | Native CSS, no runtime overhead from CSS-in-JS |

### Backend Performance

| Area | Assessment | Detail |
|------|-----------|--------|
| **Cold start** | Excellent | Cloudflare Workers have <5ms cold starts |
| **Image caching** | Excellent | 1-year `Cache-Control` headers on R2-served images |
| **Database queries** | Good | Simple indexed lookups; parameterized queries |
| **Token refresh** | Good | Deduplication of concurrent refresh requests on client |
| **Password hashing** | Acceptable | PBKDF2 100k iterations adds ~50-100ms per auth request |

### Scoring Algorithm Performance

The `calculateScore()` function handles all 4 question types efficiently:

| Type | Max Score | Algorithm |
|------|-----------|-----------|
| Multiple Choice | 1,000 | Binary correct/incorrect * speed fraction |
| True/False | 1,000 | Same as MC |
| Slider | 1,000 | Average of proximity score + speed bonus |
| Multi-Choice | 1,500 | Base (correct ratio) - wrong penalty + speed bonus + perfect bonus |

All calculations are O(n) where n = number of options. No performance concerns.

---

## 10. CI/CD & Deployment

### Pipeline Overview

```
┌──────────────────────────────────────────────────────┐
│               CI/CD PIPELINE                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Push to main                                        │
│       │                                              │
│       ├──► deploy.yml (SPA)                          │
│       │    1. Checkout                               │
│       │    2. Setup Node 20                          │
│       │    3. npm ci                                 │
│       │    4. npm run build (with env vars)           │
│       │    5. Upload to GitHub Pages artifact         │
│       │    6. Deploy to GitHub Pages                  │
│       │                                              │
│       └──► deploy-worker.yml (API)                   │
│            Trigger: worker/** files changed           │
│            1. Checkout                               │
│            2. Setup Node 20                          │
│            3. npm ci (worker/)                       │
│            4. npm run typecheck                      │
│            5. wrangler deploy                        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Deployment Configuration

| Component | Platform | URL | Trigger |
|-----------|----------|-----|---------|
| SPA | GitHub Pages | `https://douglasf.github.io/quizapp/` | Push to `main` |
| Worker API | Cloudflare Workers | `https://quizapp-api.douglasfrisk.workers.dev` | Push to `main` (worker/ changes) |

### CI/CD Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| No test step | High | Neither workflow runs tests before deploying |
| No lint step (SPA) | Medium | SPA workflow doesn't run `npm run lint` |
| No staging environment | Low | Deploys directly to production |
| No rollback mechanism | Medium | No automated rollback on failure |
| Concurrency control | Good | SPA deploy uses `cancel-in-progress: false` |

---

## 11. Known Limitations & Technical Debt

### Documented in TODO.md

| Item | Status | Impact |
|------|--------|--------|
| Eager image uploads (orphan R2 objects) | Backlog | Storage waste; no cleanup mechanism |
| `:has()` CSS selectors (13 instances) | Low priority | Good browser support; cosmetic only |
| Player peer not singleton | Acknowledged | Could eliminate `get_state` protocol |
| No error boundaries | Acknowledged | App crashes on uncaught errors |

### Discovered in Audit

| Item | Severity | Detail |
|------|----------|--------|
| No automated tests | High | Zero test coverage; manual testing only (TESTING.md exists for R2 integration) |
| No error boundaries | Medium | Single uncaught error crashes the entire app tree |
| No rate limiting | Medium | Auth endpoints vulnerable to brute-force |
| No expired refresh token sweep | Low | Expired tokens accumulate in D1 until used |
| No route-level code splitting | Low | All routes bundled together |
| `answeredAt` timestamp trust | Low | Client-provided timestamp could be manipulated for speed scoring |
| Image upload endpoint is public | Low | No auth on `/api/upload`; anyone can upload images |
| No upload quota per user | Medium | Unlimited image uploads to R2 without authentication |

---

## 12. Recommendations

### 12.1 Critical

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| 1 | **Add automated tests** — Start with unit tests for `scoring.ts`, `quizValidator.ts`, `gameCode.ts`, and the game state reducer. Add integration tests for API endpoints. | Medium | High |
| 2 | **Add React error boundary** — Wrap the app in an error boundary component that catches and displays a recovery UI instead of a blank screen. | Small | High |

### 12.2 High Priority

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| 3 | **Add rate limiting to auth endpoints** — Use Cloudflare's built-in rate limiting or implement a simple D1-backed counter. Target: 5 login attempts per IP per minute. | Small | High |
| 4 | **Add lint + test steps to CI** — Run `npm run lint` and `npm test` before deploy in both workflows. Block deployment on failure. | Small | Medium |
| 5 | **Require auth for image uploads** — Add `authMiddleware` to the `/api/upload` endpoint to prevent anonymous abuse. | Small | Medium |
| 6 | **Implement route-level code splitting** — Use `React.lazy()` and `Suspense` for route components to reduce initial bundle size. | Small | Medium |

### 12.3 Medium Priority

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| 7 | **Defer image uploads to quiz save** — Buffer selected images as blobs during editing; batch-upload on save. This eliminates orphaned R2 objects. (Already documented in TODO.md.) | Medium | Medium |
| 8 | **Add scheduled refresh token cleanup** — Use a Cloudflare Cron Trigger to periodically delete expired `refresh_tokens` rows. | Small | Low |
| 9 | **Validate P2P messages with schemas** — Add Zod or lightweight validation for incoming `PlayerMessage` objects in `useHost.ts`. | Small | Low |
| 10 | **Make player peer a singleton** — Mirror the PeerManager pattern for the player side. This would eliminate the `get_state` message type and simplify reconnection. | Medium | Medium |

### 12.4 Low Priority

| # | Recommendation | Effort | Impact |
|---|----------------|--------|--------|
| 11 | **Replace `:has()` selectors** — Convert 13 instances to explicit CSS classes. (Already documented in TODO.md.) | Small | Low |
| 12 | **Add server-side timestamp for answers** — Use `Date.now()` on the host when receiving answers instead of trusting the client's `answeredAt`. | Small | Low |
| 13 | **Add loading skeletons** — Replace raw loading states with skeleton placeholders for better perceived performance. | Small | Low |
| 14 | **Add staging environment** — Deploy a preview environment for PRs before merging to main. | Medium | Low |

---

## 13. Risk Matrix

```
                    IMPACT
                Low    Medium    High
           ┌────────┬─────────┬──────────┐
    High   │        │ Rate    │ No Tests │
           │        │ Limiting│          │
LIKELIHOOD ├────────┼─────────┼──────────┤
    Medium │ Token  │ Public  │ No Error │
           │ Sweep  │ Upload  │ Boundary │
           ├────────┼─────────┼──────────┤
    Low    │ :has() │ Orphan  │          │
           │ CSS    │ Images  │          │
           └────────┴─────────┴──────────┘
```

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| App crash on uncaught error | Medium | High | Add React error boundary (Recommendation #2) |
| Regression deployed without detection | High | High | Add automated tests + CI gates (Recommendations #1, #4) |
| Brute-force attack on auth | Medium | Medium | Add rate limiting (Recommendation #3) |
| R2 storage abuse via anonymous upload | Medium | Medium | Require auth for uploads (Recommendation #5) |
| Orphaned R2 images accumulate | Low | Medium | Defer uploads to save time (Recommendation #7) |
| Expired refresh tokens accumulate | Medium | Low | Add cron cleanup (Recommendation #8) |
| Speed scoring manipulation | Low | Low | Server-side timestamps (Recommendation #12) |

---

## 14. Conclusion

Quiz App is a **well-architected hobby project** that demonstrates strong engineering patterns:

- The PeerManager singleton pattern is an excellent solution for WebRTC in React
- The JWT auth flow with token rotation and httpOnly cookies is production-grade
- The type system provides good compile-time safety across the P2P protocol
- The serverless architecture (GitHub Pages + Cloudflare Workers) keeps operational costs at zero
- The dependency footprint is impressively minimal

The primary investment needed is in **testing and error resilience**. Adding automated tests, an error boundary, and rate limiting would bring this codebase from "good hobby project" to "production-ready application" with relatively modest effort.

The codebase is clean, consistent, and well-documented. No major refactoring is needed — the recommendations above are incremental improvements that build on an already solid foundation.

---

*Report generated from full codebase analysis of 42 source files (~16,150 lines of TypeScript + CSS) across the React SPA and Cloudflare Worker API.*
