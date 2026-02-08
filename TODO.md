# Quiz App TODO

## HIGH PRIORITY

- [ ] BUG: QR Code Screen Shows "Game Code Taken" Error on Initial Load — every load shows error then fetches new code that works
- [ ] FEATURE: Swedish Translation Support — add Swedish lang at `/quizapp/sv/`, English at `/quizapp/en/`, with flag toggle on start screen

### Completed (TV-Ready Polish)
- [x] Remove 6 debug console.logs from useFitText.ts (lines 43, 55, 59, 69, 83, 92)
- [x] Fix `justify-content: right` → `flex-end` in HostPage.css line 842 (potential cross-browser bug)
- [x] Add landscape layout for answer summary phase — multi-column grid to prevent long scrolling with many players
- [x] Scale Scoreboard component for landscape — widen max-width and expand podium for TV widescreen displays

## COMPLETED (Game Mechanics)

- [x] Multi-Choice Scoring Formula (Completed)
  - Base score for correct answers
  - Wrong answers subtract points directly
  - Speed bonus: 150 points
  - Perfect bonus: +200 only for 100% correct answers
- [x] Add question timer (configurable default) and award points based on answer speed — faster answer = more points
  - ✅ Implemented: `timeLimitSeconds` per question (5-120s, default 30s)
  - ✅ Speed-based scoring: 1000 pts max, scales down to 0 at timeout
  - ✅ Timer display on host + player screens
  - ✅ Answer lockout when timer expires
  - ✅ QuizCreator UI for per-question timer input
- [x] Add question type system with three question types
  - ✅ Phase 1: Type definition + UI selector + validator
  - ✅ Phase 2: Conditional UI rendering (MC: 4 options, TF: 2 hardcoded, Slider: numeric range)
  - ✅ Phase 3: Answer protocol + scoring for all types
  - ✅ Configurable slider ranges (min/max, not hardcoded 0-100)
  - ✅ Fixed numeric input UX (draft state, proper sentinel, edited flag)
  - ✅ True/False questions with hardcoded "False"/"True" options
  - ✅ Backward compatibility (missing type defaults to 'multiple_choice')

## LOW PRIORITY (Investigations + Cleanup)

### Completed Cleanup
- [x] Clean up 4 dead .tsx files + 4 empty .css files (HostLobby, HostGame, HostResults, PlayerResults)
- [x] Remove 27 debug console.logs across codebase (especially 19 in getHostUrl.ts for ICE candidates)
- [ ] Replace 13 `:has()` selectors with explicit CSS classes for cleaner, more readable CSS (optional — browser support is good, skipped for now)

### Investigations
- [ ] INVESTIGATE: Free-text answer type with word matching + spelling tolerance. Explore using Levenshtein distance or similar for fuzzy matching.
  - **Status**: Medium-High complexity. Requires new npm dependency (fuse.js/string-similarity).
  - **Prerequisite**: Question type system ✅ (complete)
- [ ] INVESTIGATE: Multi-choice questions (more than 4 options, configurable count).
  - **Status**: Medium complexity. Requires flexible answer grid layout and dynamic option handling.
  - See details in Notes & Ideas section.
- [ ] ADD IMAGES TO QUESTIONS (Base64 embedding, host-only display)
  - **Status**: Low complexity, high feasibility
  - **Key findings**:
    - Images are host-only (TV screen) — no PeerJS/WebRTC involved
    - Add optional `image?: string` field to Question interface (base64 data URL)
    - Simple validator check for data URL format
    - Render in HostPage.tsx (QuestionPhase) above/below question text
    - QuizCreator needs file-to-base64 conversion + preview
    - Size gates: localStorage (5-10 MB quota), JSON parsing (negligible)
    - Images under 100 KB each should be safe; test with sample quiz of 5-10 medium images
  - **No protocol changes needed** — images are static quiz data, not real-time messages
  - **Prerequisite**: Can be implemented independently or after question type system ✅

---

## Notes & Ideas

### Question Types (✅ DONE)

#### Multiple Choice — 4 Options
- 4 editable answer options (A, B, C, D)
- Speed-based scoring (1000 pts max, faster = more points)
- Implemented ✅

#### True/False
- 2 hardcoded answer options ("False", "True" — not editable)
- Speed-based scoring (same as MC)
- Radio button to select which is correct
- Implemented ✅

#### Slider (Numeric Range)
- Configurable min/max range (not hardcoded 0-100)
- Proximity + Speed scoring:
  - Proximity: 50% — points based on distance from correct answer (perfect = 1000, off by full range = 0)
  - Speed: 50% — points based on response time (instant = 1000, at timeout = 0)
  - Combined: average of proximity and speed scores
- Dynamic scale labels based on range (5 evenly-spaced tick marks)
- Fixed numeric input UX (draft state, proper sentinel, edited flag)
- Backward compatible (old quizzes default to 0-100)
- Implemented ✅

### Multi-Choice Questions (Feasibility: MEDIUM, Complexity: MEDIUM)

Allow quizzes to have questions with any number of options (5, 6, 7, 8, etc.) instead of being limited to exactly 4 (MC) or 2 (TF).

**Current limitations**:
- The `options` field is hardcoded as a 4-tuple: `options: [string, string, string, string]`
- TypeScript enforces this strict shape across quiz.ts, game.ts, and messages.ts
- Host and player layouts assume a fixed 2x2 grid (or 2x1 for TF)
- Answer protocol sends `optionIndex: number` (0-3) — flexible enough for any count, but UI isn't

**Architecture changes needed**:
1. Change `options` from `[string, string, string, string]` to `string[]` (flexible array)
2. Add `optionCount?: number` field to Question interface (or derive from `options.length`)
3. Update validator to accept any number of options (reasonable bounds: 2-12?)
4. Update HostPage/PlayerGame layout to dynamically scale:
   - 4 options: 2x2 grid (current)
   - 3 options: 3x1 row or 2x2 with one empty
   - 5-8 options: 2x3, 2x4, 2x5 or wrap to 3 columns as needed
   - Custom layout logic or CSS grid with `auto-fit` / `auto-fill`
5. Update QuizCreator to allow adding/removing individual option rows dynamically
6. CSS: flexible button sizing for varying grid layouts (ensure text still fits)

**Backward compatibility**:
- Old quizzes with exactly 4 options still work
- Missing `optionCount` can be inferred from `options.length`

**Risks**:
- The 4-tuple type is deeply embedded (satisfies checks, type safety). Changing to `string[]` loosens type safety.
- UI layout becomes more complex — need careful CSS grid logic to avoid ugly layouts
- Host/Player button sizing and text scaling may need adjustment for 8+ options on mobile

**Next steps if implementing**:
1. Investigate current type strictness and cost of moving to `string[]`
2. Design a reasonable layout strategy (e.g., wrap to 3 columns at 6+ options)
3. Update validator to set reasonable bounds on option count
4. Update QuizCreator UI to allow dynamic +/- buttons for adding/removing options

### Free-Text Answers (Feasibility: MEDIUM-HIGH, Prerequisite: Question Types ✅)
- Need word tokenization + fuzzy matching
- Libraries: fuse.js, string-similarity, Levenshtein distance implementations
- Challenges:
  - Spelling tolerance (how lenient?)
  - Word order (does order matter?)
  - Partial credit (1 word correct vs all words correct?)
  - Performance (matching against potentially long answers)
  - Edge cases (synonyms, abbreviations, etc.)
- Start with simple word-set matching, add fuzzy if feasible
- **Architectural impact**: Requires new npm dependency + answer validation refactor

### Base64 Images (Feasibility: HIGH, Complexity: LOW, Independent)
- Host-only display (no WebRTC impact)
- Add `image?: string` field to Question (base64 data URL)
- localStorage limits: ~5-10 MB quota per origin, typical quiz with 10 medium images (~400 KB) fits easily
- Rendering: base64 in `<img src="data:image/...;base64,...">` is native HTML standard
- JSON parsing: negligible performance impact
- File size: compress aggressively, use WebP, cap per-image size in validator (~100 KB per image)
- QuizCreator UX: file upload → base64 conversion → preview
- Test with sample quiz containing 5-10 medium-sized images (~30-50 KB each)

---

## Recent Work (Committed)

✅ Multi-Choice scoring formula rebalanced (wrong answers subtract points directly, speed bonus 150, perfect bonus only for perfect answers)
✅ Fullscreen mode for TV projection (landscape 2-column layout)
✅ Per-answer-box font sizing (`useFitText` hook with independent measurement)
✅ Dynamic text shrinking for long questions and answers
✅ Question timer with speed-based scoring (1000 pts max, configurable per-question)
✅ Complete question type system:
  - Multiple Choice (4 options, speed-based scoring)
  - True/False (2 hardcoded options, speed-based scoring)
  - Slider (configurable min/max range, proximity + speed scoring)
  - Configurable slider ranges with fixed numeric input UX
  - Auto-population of True/False options ("False"/"True")
  - Phase 1-3 implementation (types, UI, answer protocol, scoring)
✅ Code cleanup: removed 8 dead files, 27 debug console.logs
✅ TV-ready polish: landscape layouts for answer summary & scoreboard, CSS fixes
