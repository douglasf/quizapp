# Quiz App TODO

## 🔴 BUGS

_No known bugs._

---

## 🟡 CHORES & CONFIG

_No pending chores._

---

## 🟠 ENHANCEMENTS

_No pending enhancements._

---

## 🔵 FEATURES

### Defer Image Upload to Quiz Creation Time
- [ ] **Upload images to Cloudflare on quiz save/create, not immediately on selection**
  - **Problem**: Currently, images are uploaded to Cloudflare the moment the user selects them in the quiz editor. If the user abandons the quiz or swaps images, orphaned uploads accumulate in Cloudflare storage with no cleanup
  - **Why it matters**: Wastes Cloudflare storage and API calls on images that may never be used. Also makes the editor feel slower since each image selection triggers a network request
  - **Scope**: Medium — requires buffering selected images locally (as base64 or blobs) during editing, then batch-uploading on save. Need to update the create/save flow and handle upload failures gracefully

---

## 🟢 COMPLETED

### Authentication & Cloud
- [x] Login and signup with JWT authentication
- [x] "My Quizzes" dashboard — view, manage, and launch saved quizzes
- [x] Cloud save — quizzes persisted to Cloudflare D1 database
- [x] Quiz sharing via unique share codes

### Images & Media
- [x] Cloudflare R2 integration for image storage
- [x] Image compression for uploaded question/answer images
- [x] **Reduce image compression aggressiveness** — improved quality for maps, flags, and photos _(Fixed in commit 971938f: adjusted compression parameters to balance clarity and transfer size)_
- [x] Question images (base64 upload, compression, host-only display)
- [x] Image-based answer options (visual identification questions — flags, landmarks, etc.)

### Architecture & Infrastructure
- [x] PeerManager singleton (peer lifecycle independent of React lifecycle)
- [x] QR code bug fix (StrictMode double-mount race condition eliminated)
- [x] Host screen layout fixes (grid overflow, timer bar symmetry)
- [x] **Add `.env` to `.gitignore`** — prevent secrets from being committed _(Fixed in commit 47cf0e7: added `.env` to gitignore to prevent secret leaks)_

### Question Types (All 6 Types Implemented)
- [x] Multiple Choice (4 options, speed-based scoring)
- [x] True/False (2 hardcoded options, speed-based scoring)
- [x] Slider (configurable range, proximity + speed scoring)
- [x] Multi-Choice (2-8 options, multiple correct answers, advanced scoring)

### Quiz Management
- [x] **Edit existing quizzes** — full edit support with PUT endpoint _(Fixed in commit 73130df: load quiz into editor, preserve ID/metadata, save updates via PUT)_

### Game Mechanics
- [x] Question timer (configurable per-question, 5-120 seconds)
- [x] Speed-based scoring system
- [x] Multi-choice scoring formula (base + penalty - wrong answers + speed bonus + perfect bonus)
- [x] Answer validation and reveal system
- [x] Player scoring and leaderboard

### Streamline "Host This Quiz" Screen UX
- [x] **Simplify and declutter the "host this quiz" screen layout**
  - **Problem**: The screen shown after creating a quiz is cluttered and unfocused. The raw quiz JSON is displayed prominently, the "Host This Quiz" button is buried among other controls, and the screen includes elements (like import-related options) that aren't relevant when the user just finished creating a quiz
  - **Why it matters**: After creating a quiz, the user's primary intent is to host it immediately — the current layout adds friction by forcing them to scan past irrelevant information. A cleaner post-creation flow improves the transition from "build" to "play" and makes the app feel more polished
  - **Specific improvements**:
    - [x] Collapse the quiz JSON into an accordion (closed by default) — useful for debugging but shouldn't dominate the screen
    - [x] Make the "Host This Quiz" button large and prominent at the top of the screen — this is the primary action
    - [x] Move controls that only make sense for importing (e.g., loading a different quiz) to the import screen instead
    - [x] Remove or de-emphasize any other low-priority UI elements to reduce visual noise
  - **Scope**: Small to medium — primarily layout and component reorganization. May involve splitting shared state between the host-quiz and import-quiz screens
  - **Completed in**: Commit `d165198`

### UI/UX & Polish
- [x] Landscape layout for TV projection (2-column grid)
- [x] Answer summary with multi-column display
- [x] Scoreboard scaling for widescreen
- [x] Dynamic text scaling for long questions/answers
- [x] Example quiz with all 5 question types
- [x] PWA support with manifest.json and iOS standalone mode
- [x] **Player avatar icons** — replaced text avatar names with actual emoji characters _(Fixed in commit d83765b: avatars now render correctly on player/host screens)_

### Code Cleanup
- [x] Remove 8 dead component files
- [x] Remove 27 debug console.logs
- [x] CSS cross-browser fixes (justify-content: right → flex-end)

---

## 📋 PENDING (Low Priority)

### CSS Cleanup
- [ ] **Replace `:has()` selectors with explicit CSS classes** — 13 instances
  - **Status**: Optional (browser support is good for `:has()`)
  - **Reason**: Better readability, explicit is better than implicit
  - **Scope**: Low complexity, cosmetic improvement

---

## 🚫 WON'T IMPLEMENT (Intentionally Deprioritized)

> These features were considered but intentionally deprioritized. The current
> question types and setup sufficiently cover the app's use cases.

- ~~**Swedish Translation Support**~~ — Demoted: daughter prefers English UI
- ~~**Free-text answers with fuzzy matching**~~ — Demoted: current question types cover all needs
- ~~**Flexible option counts for multiple choice**~~ — Demoted: multi-choice (2-8 options) already provides sufficient flexibility

---

## 📝 ARCHITECTURE NOTES

### Current Stack
- React 19 + TypeScript
- Vite (build tool and dev server)
- PeerJS for P2P connections (WebRTC)
- React Router with HashRouter (for GitHub Pages compatibility)
- Cloudflare Workers (API backend)
- Cloudflare D1 (SQLite database for quiz storage)
- Cloudflare R2 (object storage for images)
- JWT authentication (login/signup)
- Native CSS (no frameworks)
- StrictMode enabled (React dev checks)

### Key Patterns
- **PeerManager singleton**: Module-level peer instance, survived by React unmounts
- **useSyncExternalStore**: React bridge to external peer state
- **Module-level singletons**: Game code caching (no React state)
- **useCallback with stable refs**: Avoid unnecessary re-renders in game logic
- **HashRouter**: Ensures client-side routing works on GitHub Pages (no server-side rewrites)
- **JWT auth flow**: Token stored in localStorage, attached to API requests for authenticated endpoints

### Known Limitations
- Question options limited to flexible count (multi-choice supports 2-8)
- No built-in error boundaries (would benefit from adding one)
- Player peer not yet a singleton (could eliminate `get_state` protocol)
- Image uploads happen eagerly on selection (orphaned uploads possible — see FEATURES backlog)
