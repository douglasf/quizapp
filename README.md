# Quiz App

A free, real-time multiplayer quiz app that runs entirely in the browser. No server, no accounts, no installation — just create a quiz, share a code, and play with friends.

**[Play Now](https://douglasnilsfrisk.github.io/quizapp/)**

## Table of Contents

- [How It Works](#how-it-works)
- [Creating a Quiz](#creating-a-quiz)
- [Hosting a Quiz](#hosting-a-quiz)
- [Joining a Quiz](#joining-a-quiz)
- [Playing a Game](#playing-a-game)
- [Sharing Quizzes](#sharing-quizzes)
- [Troubleshooting](#troubleshooting)
- [Image Hosting (Cloud Upload)](#image-hosting-cloud-upload)
- [Technical Details](#technical-details)
- [Development](#development)

---

## How It Works

Quiz App uses **peer-to-peer (P2P) connections** powered by WebRTC. This means:

- **No server needed** — the host's browser IS the server
- **No accounts** — just open the app and play
- **Free forever** — no hosting costs since there's no backend
- **Real-time** — answers and scores update instantly
- **Private** — quiz data stays between the players' browsers

The host creates a game room, and players connect directly to the host's browser using a simple 4-character game code or QR code.

## Creating a Quiz

1. Open the app and click **"Host a Quiz"**
2. Enter a **quiz title** (e.g., "Movie Trivia Night")
3. For each question:
   - Type the question text
   - Fill in 4 answer options (A, B, C, D)
   - Select the correct answer by clicking the radio button next to it
4. Use the **+ Add Question** button to add more questions
5. Use the arrow buttons to reorder questions, or the **X** button to remove one
6. Click **"Save Quiz"** when you're done

Your quiz will be saved as JSON data that you can export and share.

## Hosting a Quiz

After creating (or importing) a quiz:

1. You'll see the **Host Lobby** with:
   - A **4-character game code** (e.g., `A3KW`) — tell players this code
   - A **QR code** — players can scan this with their phone camera to join instantly
   - A **join link** you can copy and share via chat/message
2. Wait for players to join — you'll see them appear in the player list
3. Once everyone's in, click **"Start Quiz"**

**Important:** Keep the host's browser tab open! Closing it ends the game for everyone.

### During the Game (Host View)

- You'll see each question displayed on screen (great for projecting on a TV or sharing your screen)
- The answer counter shows how many players have answered
- Click **"Reveal Answer"** to show the correct answer and score distribution
- Click **"Show Scoreboard"** to see the rankings
- Click **"Next Question"** to advance, or **"Finish Quiz"** on the last question

## Joining a Quiz

There are three ways to join:

### Option 1: QR Code (easiest on mobile)
1. Point your phone camera at the QR code shown on the host's screen
2. Tap the link that appears
3. Enter your name and tap **"Join Quiz"**

### Option 2: Game Code
1. Open the app on your device
2. Click **"Join a Quiz"**
3. Enter the 4-character game code the host gave you
4. Enter your name and tap **"Join Quiz"**

### Option 3: Direct Link
1. The host can share a join link (via text, chat, etc.)
2. Open the link on your device
3. Enter your name and tap **"Join Quiz"**

## Playing a Game

### For Players

1. After joining, you'll see a "Waiting for quiz to start..." screen
2. When the host starts, you'll see each question with 4 colored answer buttons
3. Tap your answer — you can only answer once per question
4. After the host reveals the answer, you'll see if you were correct
5. The scoreboard shows between questions so you can track the standings
6. At the end, final results are displayed

### Scoring

- **100 points** for each correct answer
- **0 points** for incorrect or no answer

## Sharing Quizzes

Quizzes are stored as simple JSON data. You can share them in several ways:

### Exporting
After creating a quiz, you'll see the export screen with options to:
- **Copy to Clipboard** — paste the JSON into a chat message, email, or doc
- **Download as JSON** — save it as a `.json` file

### Importing
To use someone else's quiz:
1. Click **"Host a Quiz"** on the home page, then go to the Import screen
2. Either **paste the JSON** into the text area, or **upload a .json file**
3. Click **"Import Quiz"** — if valid, you'll go straight to the host lobby

### Quiz JSON Format

```json
{
  "title": "Example Quiz",
  "questions": [
    {
      "text": "What is the capital of France?",
      "options": ["London", "Paris", "Berlin", "Madrid"],
      "correctIndex": 1
    }
  ],
  "createdAt": "2026-02-07T12:00:00.000Z"
}
```

## Troubleshooting

### "Game not found" when joining
- Double-check the game code (it's 4 characters, case-insensitive)
- Make sure the host's browser tab is still open
- The host may have started a new game with a different code

### Players getting disconnected
- The app has **automatic reconnection** — it will try to reconnect up to 3 times
- If reconnection fails, the player can refresh the page and rejoin with the same name
- Their score and progress are preserved on the host side

### QR code not working
- Make sure your phone camera app supports QR codes (most modern phones do)
- Try moving closer to the screen or adjusting the brightness
- You can always use the game code instead

### Connection issues
- Both the host and players need an **internet connection** (for the initial handshake)
- Make sure you're on a network that allows WebRTC connections (some corporate networks block them)
- Try a different network or use a mobile data connection
- If nothing works, the PeerJS Cloud signalling server might be temporarily down — try again in a few minutes

### "Host disconnected" message
- The host closed their browser tab or lost connection
- The host needs to start a new game and players will need to rejoin

### Quiz won't import
- Make sure the JSON is valid (no trailing commas, proper quotes)
- Each question needs exactly 4 options
- `correctIndex` must be 0, 1, 2, or 3
- The quiz needs at least 1 question and a title

## Image Hosting (Cloud Upload)

Quiz App supports two modes for handling images in quizzes:

### Inline Mode (Default, No Setup)

Images are embedded directly in the quiz data as base64 strings. This works out of the box with no configuration — but it makes quiz files larger and shared links longer.

### Cloud Mode (Recommended for Image-Heavy Quizzes)

Images are uploaded to a **Cloudflare R2** bucket via a lightweight Worker. The quiz stores short HTTPS URLs instead of base64 data, resulting in:

- Much smaller quiz JSON files
- Much shorter shareable links
- Faster quiz loading (images served from CDN with caching)
- Better performance for quizzes with many images

#### Quick Setup

1. **Deploy the image Worker** (requires a free [Cloudflare account](https://dash.cloudflare.com/sign-up)):

   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler r2 bucket create quiz-images
   npx wrangler deploy
   ```

2. **Configure the client** — set the Worker URL in `.env.local` (for development) or `.env.production` (for builds):

   ```env
   VITE_IMAGE_WORKER_URL=https://quiz-image-worker.your-account.workers.dev
   ```

3. **Rebuild the app** — `npm run build`

That's it! The quiz creator will show a **Cloud Image Upload** toggle when the Worker is available.

#### How It Works

When cloud mode is enabled:
1. User selects an image in the quiz creator
2. The image is compressed client-side (JPEG/WebP, 400x400 for questions, 200x200 for answers)
3. The compressed image is uploaded to the Cloudflare Worker
4. The Worker stores it in R2 and returns an HTTPS URL
5. The quiz stores the URL instead of base64 data

If the Worker is unavailable or an upload fails, the app **automatically falls back** to inline base64 with a notification — no data is lost.

#### Backward Compatibility

- Old quizzes with base64 images continue to work perfectly
- Quizzes can mix cloud URLs and inline base64 images
- Importing/exporting preserves both URL and base64 formats
- The cloud toggle can be turned off at any time

For detailed Worker documentation, see [`worker/README.md`](worker/README.md). For integration testing, see [`TESTING.md`](TESTING.md).

## Technical Details

### Tech Stack
- **React 19** with TypeScript
- **Vite** for development and building
- **React Router** (hash routing for static hosting compatibility)
- **PeerJS** for WebRTC peer-to-peer connections
- **Cloudflare Workers + R2** for image hosting (optional)
- **qrcode.react** for QR code generation
- **GitHub Pages** for hosting

### Architecture

```
Player's Browser  ──WebRTC──>  Host's Browser
Player's Browser  ──WebRTC──>  (quiz data, game state,
Player's Browser  ──WebRTC──>   scores all live here)
```

- The **host's browser** acts as the game server — it holds all quiz data, tracks answers, calculates scores
- **Players connect directly** to the host via WebRTC data channels
- **PeerJS Cloud** is used only for the initial connection handshake (signalling) — no game data passes through any server
- **Hash routing** (`/#/path`) is used so the app works on GitHub Pages without server-side routing

### Message Protocol

The app uses a simple JSON message protocol over WebRTC data channels:

- **Player → Host**: `join`, `rejoin`, `answer`, `ping`
- **Host → Player**: `welcome`, `rejoin_success`, `question`, `answer_ack`, `answer_reveal`, `scoreboard`, `game_over`, `player_list`, `error`, `pong`

### Limitations

- **Max 20 players** per game (PeerJS connection limit)
- **Host must stay online** — if the host's browser closes, the game ends
- **Same network recommended** — WebRTC works best when players are on the same network, but it can work across networks too
- **Modern browser required** — WebRTC is supported in all modern browsers (Chrome, Firefox, Safari, Edge)

## Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/douglasnilsfrisk/quizapp.git
cd quizapp

# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server at `http://localhost:5173` |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

### Deployment

The project has two independently deployed parts:

| Component | Platform | Trigger | Workflow |
|-----------|----------|---------|----------|
| **SPA (frontend)** | GitHub Pages | Push to `main` | `.github/workflows/deploy.yml` |
| **Worker (API)** | Cloudflare Workers | Push to `main` (worker/ changes) | `.github/workflows/deploy-worker.yml` |

#### SPA Deployment (GitHub Pages)

Automatic — push to `main` and the GitHub Actions workflow builds the Vite app and deploys to GitHub Pages.

```bash
# Manual build (for testing)
npm run build
```

#### Worker Deployment (Cloudflare)

**First-time setup:**

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and install Wrangler:

   ```bash
   cd worker && npm install
   npx wrangler login
   ```

2. Create the D1 database and R2 bucket:

   ```bash
   npx wrangler d1 create quizapp
   npx wrangler r2 bucket create quiz-images
   ```

3. Copy the `database_id` from the output into `worker/wrangler.toml`:

   ```toml
   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

4. Apply database migrations:

   ```bash
   npx wrangler d1 migrations apply quizapp --remote
   ```

5. Set the JWT secret (you'll be prompted to enter a value):

   ```bash
   npx wrangler secret put JWT_SECRET
   ```

6. Deploy:

   ```bash
   npm run deploy:worker
   ```

**CI/CD setup (GitHub Actions):**

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with **Workers** write permissions ([create one here](https://dash.cloudflare.com/profile/api-tokens)) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (visible on the Workers dashboard) |

Once set, the Worker auto-deploys whenever files in `worker/` change on the `main` branch.

#### Deploy Commands

```bash
# Deploy SPA (via GitHub Actions — just push to main)
git push origin main

# Deploy Worker manually
npm run deploy:worker

# Or from the worker directory
cd worker && npx wrangler deploy
```

### Project Structure

```
src/
  components/      # React components (Home, QuizCreator, HostPage, PlayerJoin, etc.)
  hooks/           # Custom hooks (useHost, usePlayer, useGameState)
  types/           # TypeScript type definitions (quiz, game, messages)
  utils/           # Utility functions (peer config, game code, validation, image upload)
  App.tsx           # Root component with routes
  main.tsx          # Entry point with HashRouter
  index.css         # Global styles
worker/
  src/index.ts      # Cloudflare Worker for R2 image upload/serving
  wrangler.toml     # Worker configuration (R2 bucket, CORS origins)
  package.json      # Worker dependencies
```

---

Made with React, PeerJS, and WebRTC. No servers were harmed in the making of this app.
