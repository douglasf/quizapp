# Quiz App TODO

## 🔴 BUGS

### Player Avatar Icons Not Displaying
- [ ] **Player avatar icons are broken** — avatars do not render on the player/host screens
  - **Problem**: Players select an avatar during join, but the icon fails to display (missing asset, broken path, or rendering issue)
  - **Why it matters**: Avatars are a core part of the player identity and game feel — without them the experience looks broken
  - **Scope**: Small — likely a broken import path, missing asset, or CSS issue. Investigate the avatar component and trace from selection to render

---

## 🟡 CHORES & CONFIG

### Add `.env` to `.gitignore`
- [ ] **Prevent `.env` from being committed to version control**
  - **Problem**: The root `.env` file is not listed in `.gitignore`. Currently only `.env.production` is ignored. The `.env` file exists locally and contains configuration values (likely API keys or secrets) that should never be committed
  - **Why it matters**: Accidentally committing secrets is a security risk — even in a private repo, credentials in git history are hard to fully remove
  - **Scope**: Trivial — add `.env` to `.gitignore`. Verify it's not already tracked (confirmed: it is not)

---

## 🟠 ENHANCEMENTS

### Reduce Image Compression Aggressiveness
- [ ] **Decrease the heavy compression applied to uploaded images** (both question images and answer option images)
  - **Problem**: The current compression settings were tuned aggressively to keep payload sizes small for P2P transfer, but the resulting image quality is noticeably poor — especially for detailed images like maps, flags, or photos
  - **Why it matters**: Image-based questions (flags, landmarks, etc.) rely on visual clarity. Over-compressed images make questions harder to read and reduce quiz quality
  - **Scope**: Small — adjust quality/resolution parameters in the image compression utility. May want to A/B test a few quality levels to find the right balance between clarity and transfer size

---

## 🔵 FEATURES

### Defer Image Upload to Quiz Creation Time
- [ ] **Upload images to Cloudflare on quiz save/create, not immediately on selection**
  - **Problem**: Currently, images are uploaded to Cloudflare the moment the user selects them in the quiz editor. If the user abandons the quiz or swaps images, orphaned uploads accumulate in Cloudflare storage with no cleanup
  - **Why it matters**: Wastes Cloudflare storage and API calls on images that may never be used. Also makes the editor feel slower since each image selection triggers a network request
  - **Scope**: Medium — requires buffering selected images locally (as base64 or blobs) during editing, then batch-uploading on save. Need to update the create/save flow and handle upload failures gracefully

### Edit Existing Quizzes
- [ ] **Allow users to edit a quiz after it has been created**
  - **Problem**: There is currently no way to modify a quiz once saved. To fix a typo, adjust a timer, or swap a question, the user must recreate the entire quiz from scratch
  - **Why it matters**: This is a major usability gap — quiz creation takes effort, and being unable to iterate on a quiz is frustrating
  - **Scope**: Medium to large — requires loading an existing quiz into the editor, preserving its ID/metadata, handling image re-uploads or diffing, and saving updates rather than creating a new record. The quiz editor UI already exists, so the main work is the data flow (load → edit → update)

---

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
