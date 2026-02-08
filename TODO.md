# Quiz App TODO

## 🔴 HIGH PRIORITY

- [ ] **Swedish Translation Support** — add Swedish lang at `/quizapp/sv/`, English at `/quizapp/en/`, with flag toggle on start screen

---

## 🟢 COMPLETED

### Architecture & Infrastructure
- [x] PeerManager singleton (peer lifecycle independent of React lifecycle)
- [x] QR code bug fix (StrictMode double-mount race condition eliminated)
- [x] Host screen layout fixes (grid overflow, timer bar symmetry)

### Question Types (All 5 Types Implemented)
- [x] Multiple Choice (4 options, speed-based scoring)
- [x] True/False (2 hardcoded options, speed-based scoring)
- [x] Slider (configurable range, proximity + speed scoring)
- [x] Multi-Choice (2-8 options, multiple correct answers, advanced scoring)
- [x] Question images (base64 upload, compression, host-only display)

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

### Code Cleanup
- [x] Remove 8 dead component files
- [x] Remove 27 debug console.logs
- [x] CSS cross-browser fixes (justify-content: right → flex-end)

---

## 📋 PENDING (Medium Priority)

### Image Features
- [ ] **Image-based answer options** — allow visual identification questions (flags, landmarks, etc.)
  - Add `imageOptions?: string[]` field to Question interface
  - Toggle between text and image answers in QuizCreator
  - Render image buttons on host and player screens
  - Reuse existing compression logic
  - **Scope**: Medium complexity

### CSS Cleanup
- [ ] **Replace `:has()` selectors with explicit CSS classes** — 13 instances
  - **Status**: Optional (browser support is good for `:has()`)
  - **Reason**: Better readability, explicit is better than implicit
  - **Scope**: Low complexity, cosmetic improvement

---

## 🔍 FUTURE FEATURES (Low Priority Investigations)

### Alternative Answer Types
- [ ] **Free-text answers** with fuzzy matching
  - Word tokenization + Levenshtein distance matching
  - Spelling tolerance configuration
  - Partial credit support
  - **Complexity**: Medium-High
  - **Dependencies**: New npm package (fuse.js or string-similarity)

### Question Format Variations
- [ ] **Flexible option counts** for multiple choice questions
  - Allow 3-12 options instead of fixed 4
  - Dynamic grid layout scaling
  - **Complexity**: Medium
  - **Risks**: Type system changes, UI complexity

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
