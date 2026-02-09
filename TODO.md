# Quiz App TODO

## 🟢 COMPLETED

### Architecture & Infrastructure
- [x] PeerManager singleton (peer lifecycle independent of React lifecycle)
- [x] QR code bug fix (StrictMode double-mount race condition eliminated)
- [x] Host screen layout fixes (grid overflow, timer bar symmetry)

### Question Types (All 6 Types Implemented)
- [x] Multiple Choice (4 options, speed-based scoring)
- [x] True/False (2 hardcoded options, speed-based scoring)
- [x] Slider (configurable range, proximity + speed scoring)
- [x] Multi-Choice (2-8 options, multiple correct answers, advanced scoring)
- [x] Question images (base64 upload, compression, host-only display)
- [x] Image-based answer options (visual identification questions — flags, landmarks, etc.)

### Game Mechanics
- [x] Question timer (configurable per-question, 5-120 seconds)
- [x] Speed-based scoring system
- [x] Multi-choice scoring formula (base + penalty - wrong answers + speed bonus + perfect bonus)
- [x] Answer validation and reveal system
- [x] Player scoring and leaderboard

### UI/UX & Polish
- [x] Landscape layout for TV projection (2-column grid)
- [x] Answer summary with multi-column display
- [x] Scoreboard scaling for widescreen
- [x] Dynamic text scaling for long questions/answers
- [x] Example quiz with all 5 question types
- [x] PWA support with manifest.json and iOS standalone mode

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
- PeerJS for P2P connections
- React Router for navigation
- Native CSS (no frameworks)
- StrictMode enabled (React dev checks)

### Key Patterns
- **PeerManager singleton**: Module-level peer instance, survived by React unmounts
- **useSyncExternalStore**: React bridge to external peer state
- **Module-level singletons**: Game code caching (no React state)
- **useCallback with stable refs**: Avoid unnecessary re-renders in game logic

### Known Limitations
- Question options limited to flexible count (multi-choice supports 2-8)
- No built-in error boundaries (would benefit from adding one)
- Player peer not yet a singleton (could eliminate `get_state` protocol)
