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

## Technical Details

### Tech Stack
- **React 19** with TypeScript
- **Vite** for development and building
- **React Router** (hash routing for static hosting compatibility)
- **PeerJS** for WebRTC peer-to-peer connections
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

The app automatically deploys to GitHub Pages when you push to the `main` branch. The GitHub Actions workflow handles building and deploying.

To deploy manually:
1. Push your changes to the `main` branch
2. GitHub Actions will automatically build and deploy
3. The app will be available at `https://douglasnilsfrisk.github.io/quizapp/`

### Project Structure

```
src/
  components/      # React components (Home, QuizCreator, HostPage, PlayerJoin, etc.)
  hooks/           # Custom hooks (useHost, usePlayer, useGameState)
  types/           # TypeScript type definitions (quiz, game, messages)
  utils/           # Utility functions (peer config, game code generation, validation)
  App.tsx           # Root component with routes
  main.tsx          # Entry point with HashRouter
  index.css         # Global styles
```

---

Made with React, PeerJS, and WebRTC. No servers were harmed in the making of this app.
