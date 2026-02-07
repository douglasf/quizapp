import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import { useGameState } from '../hooks/useGameState';
import { generateGameCode } from '../utils/gameCode';
import Scoreboard from './Scoreboard';
import type { Quiz } from '../types/quiz';
import './HostPage.css';

const IMPORTED_QUIZ_KEY = 'quizapp_imported_quiz';
const OPTION_COLORS = ['host-option--red', 'host-option--blue', 'host-option--yellow', 'host-option--green'] as const;
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

/**
 * HostPage — single component managing the entire host flow:
 *   lobby → question → answer_reveal → scoreboard → finished
 *
 * This prevents PeerJS connection loss that would occur if we navigated
 * between separate route components (each would create a new peer).
 */
function HostPage() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [gameCode] = useState(() => generateGameCode());
  const [quiz, setQuiz] = useState<Quiz | null>(null);

  const {
    state,
    initGame,
    startQuiz,
    revealAnswer,
    showScoreboard,
    nextQuestion,
    finishGame,
    getCorrectAnswerIndex,
  } = useGameState();

  const currentQuestionIndexRef = useRef(state.currentQuestionIndex);
  const phaseRef = useRef(state.phase);

  // Keep refs in sync with state
  currentQuestionIndexRef.current = state.currentQuestionIndex;
  phaseRef.current = state.phase;

  // Callback ref for when a player rejoins — sends them the current question.
  // Declared before useHost() so it can be passed in; the .current value is
  // assigned afterwards via useEffect once sendToPlayer is available.
  const onPlayerRejoinRef = useRef<((playerName: string) => void) | null>(null);

  const { players, broadcast, sendToPlayer, error: hostError, getAnswers, updatePlayerScore, resetScores } = useHost(
    gameCode,
    currentQuestionIndexRef,
    phaseRef,
    onPlayerRejoinRef,
  );

  // Assign the rejoin callback after useHost() so sendToPlayer is in scope
  useEffect(() => {
    onPlayerRejoinRef.current = (playerName: string) => {
      if (!quiz) return;
      const phase = phaseRef.current;
      const qIndex = currentQuestionIndexRef.current;
      const question = quiz.questions[qIndex];

      // If we're in question or answer_reveal phase, send the current question
      if ((phase === 'question' || phase === 'answer_reveal') && question) {
        // Small delay to let the connection stabilize
        setTimeout(() => {
          sendToPlayer(playerName, {
            type: 'question',
            index: qIndex,
            total: quiz.questions.length,
            text: question.text,
            options: question.options,
          });
        }, 200);
      }
    };
  }, [quiz, sendToPlayer]);

  // Load quiz from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(IMPORTED_QUIZ_KEY);
    if (!stored) {
      navigate('/');
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Quiz;
      setQuiz(parsed);
      initGame(parsed, gameCode);
    } catch {
      navigate('/');
    }
  }, [navigate, gameCode, initGame]);

  const connectedCount = Array.from(players.values()).filter((p) => p.connected).length;
  const playerCount = players.size;
  const joinUrl = `${window.location.origin}${window.location.pathname}#/join/${gameCode}`;

  // ─── Lobby actions ───

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [joinUrl]);

  const handleStartQuiz = useCallback(() => {
    if (connectedCount === 0 || !quiz) return;
    startQuiz();

    const question = quiz.questions[0];
    if (question) {
      broadcast({
        type: 'question',
        index: 0,
        total: quiz.questions.length,
        text: question.text,
        options: question.options,
      });
    }
  }, [connectedCount, quiz, startQuiz, broadcast]);

  const handleCancel = useCallback(() => {
    localStorage.removeItem(IMPORTED_QUIZ_KEY);
    navigate('/');
  }, [navigate]);

  // ─── Game actions ───

  const currentQuestion = quiz?.questions[state.currentQuestionIndex];
  const totalQuestions = quiz?.questions.length ?? 0;
  const hostAnswersForCurrent = getAnswers(state.currentQuestionIndex);
  const answeredCount = hostAnswersForCurrent.size;
  const totalPlayers = players.size;
  const isLastQuestion = state.currentQuestionIndex >= totalQuestions - 1;
  const correctIndex = getCorrectAnswerIndex();

  // Compute standings from useHost's players (which track scores)
  const standings = useMemo(() => {
    return Array.from(players.values())
      .sort((a, b) => b.score - a.score)
      .map((player, i) => ({
        name: player.name,
        score: player.score,
        rank: i + 1,
      }));
  }, [players]);

  // Computed inline — no useMemo needed. The component re-renders whenever `players`
  // changes (via syncPlayersState on each answer), which gives us a fresh read of the
  // mutable answers Map. Iterating up to 20 entries is trivially cheap.
  const answerDistribution = (() => {
    const dist = [0, 0, 0, 0];
    for (const optionIndex of hostAnswersForCurrent.values()) {
      if (optionIndex >= 0 && optionIndex < 4) {
        dist[optionIndex]++;
      }
    }
    return dist;
  })();

  const handleRevealAnswer = useCallback(() => {
    if (!quiz || !currentQuestion) return;

    revealAnswer();

    // Compute and apply scores using useHost's answer data (for ALL players who answered)
    const answers = getAnswers(state.currentQuestionIndex);
    for (const player of players.values()) {
      const playerAnswer = answers.get(player.name.trim().toLowerCase());
      const isCorrect = playerAnswer !== undefined && playerAnswer === currentQuestion.correctIndex;

      // Award points for correct answers (even if disconnected)
      if (isCorrect) {
        updatePlayerScore(player.name, 100);
      }

      // Only send reveal message to connected players
      if (!player.connected) continue;
      sendToPlayer(player.name, {
        type: 'answer_reveal',
        questionIndex: state.currentQuestionIndex,
        correctIndex: currentQuestion.correctIndex,
        yourAnswer: playerAnswer ?? null,
        correct: isCorrect,
        scoreGained: isCorrect ? 100 : 0,
      });
    }
  }, [quiz, currentQuestion, revealAnswer, players, getAnswers, state.currentQuestionIndex, sendToPlayer, updatePlayerScore]);

  const handleShowScoreboard = useCallback(() => {
    showScoreboard();

    // Use `standings` (already computed from players via useMemo above)
    broadcast({
      type: 'scoreboard',
      standings,
    });
  }, [showScoreboard, standings, broadcast]);

  const handleNextQuestion = useCallback(() => {
    nextQuestion();

    const nextIndex = state.currentQuestionIndex + 1;
    const nextQ = quiz?.questions[nextIndex];
    if (nextQ) {
      broadcast({
        type: 'question',
        index: nextIndex,
        total: totalQuestions,
        text: nextQ.text,
        options: nextQ.options,
      });
    }
  }, [nextQuestion, state.currentQuestionIndex, quiz, broadcast, totalQuestions]);

  const handleFinishGame = useCallback(() => {
    finishGame();

    broadcast({
      type: 'game_over',
      standings,
    });
  }, [finishGame, standings, broadcast]);

  const handlePlayAgain = useCallback(() => {
    // Re-init the game with the same quiz
    if (quiz) {
      initGame(quiz, gameCode);
      resetScores();
      // Notify all players to return to waiting state
      broadcast({ type: 'play_again' });
    }
  }, [quiz, gameCode, initGame, resetScores, broadcast]);

  const handleNewQuiz = useCallback(() => {
    localStorage.removeItem(IMPORTED_QUIZ_KEY);
    navigate('/');
  }, [navigate]);

  // ─── Render: Lobby ───

  if (state.phase === 'lobby') {
    return (
      <div className="page host-lobby">
        <div className="lobby-container">
          <div className="lobby-warning">
            Keep this tab open! Closing it ends the quiz for everyone.
          </div>

          <h1>{quiz?.title || 'Quiz Lobby'}</h1>

          {hostError && (
            <div className="lobby-error" role="alert">
              {hostError}
              <p className="error-suggestion">Try refreshing the page to generate a new game code.</p>
            </div>
          )}

          {/* Game code card */}
          <div className="game-code-card">
            <div className="game-code-label">Game Code</div>
            <div className="game-code-value">{gameCode}</div>

            <div className="qr-wrapper">
              <QRCodeSVG value={joinUrl} size={160} level="M" />
            </div>

            <div className="join-url-hint">{joinUrl}</div>

            <button type="button" className="btn btn-secondary copy-link-btn" onClick={handleCopyLink}>
              {copied ? <span className="copied-toast">Copied!</span> : 'Copy Join Link'}
            </button>
          </div>

          {/* Player list */}
          <div className="player-list-section">
            <div className="player-count">
              Players: {playerCount}/20 ({connectedCount} connected)
            </div>

            {playerCount > 0 ? (
              <ul className="player-list">
                {Array.from(players.values()).map((player) => (
                  <li
                    key={player.name}
                    className={`player-chip${player.connected ? '' : ' player-chip--disconnected'}`}
                  >
                    <span
                      className={`player-status-dot ${
                        player.connected ? 'player-status-dot--connected' : 'player-status-dot--disconnected'
                      }`}
                    />
                    {player.name}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="player-list-empty">Waiting for players to join...</div>
            )}
          </div>

          {/* Actions */}
          <div className="lobby-actions">
            <button
              type="button"
              className="btn btn-start"
              disabled={connectedCount === 0}
              onClick={handleStartQuiz}
            >
              {connectedCount === 0 ? 'Waiting for Players...' : 'Start Quiz'}
            </button>
            <button type="button" className="btn btn-danger" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Question + Answer Reveal ───

  if ((state.phase === 'question' || state.phase === 'answer_reveal') && currentQuestion) {
    return (
      <div className="page host-game">
        <div className="host-game-container">
          <div className="question-header-bar">
            <div className="question-counter">
              Question {state.currentQuestionIndex + 1} of {totalQuestions}
            </div>
            <h1 className="question-text">{currentQuestion.text}</h1>
          </div>

          {/* Answer options */}
          <div className="host-options-grid">
            {currentQuestion.options.map((option, idx) => {
              const isRevealed = state.phase === 'answer_reveal';
              const isCorrect = idx === correctIndex;
              let optionClass = `host-option ${OPTION_COLORS[idx]}`;
              if (isRevealed && isCorrect) optionClass += ' host-option--correct';
              if (isRevealed && !isCorrect) optionClass += ' host-option--incorrect';

              return (
                <div key={`option-${OPTION_LABELS[idx]}`} className={optionClass}>
                  <span className="host-option-label">{OPTION_LABELS[idx]}</span>
                  <span>{option}</span>
                  {isRevealed && (
                    <span className="answer-distribution">
                      <span className="distribution-count">{answerDistribution[idx]}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Answer counter */}
          <div className="answer-counter">
            <span className="answer-counter-number">{answeredCount}</span> of{' '}
            <span className="answer-counter-number">{totalPlayers}</span> players have answered
          </div>

          {/* Actions */}
          <div className="host-game-actions">
            {state.phase === 'question' && (
              <button type="button" className="btn btn-reveal" onClick={handleRevealAnswer}>
                Reveal Answer
              </button>
            )}
            {state.phase === 'answer_reveal' && (
              <button type="button" className="btn btn-primary" onClick={handleShowScoreboard}>
                Show Scoreboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Scoreboard ───

  if (state.phase === 'scoreboard') {
    return (
      <div className="page host-game">
        <div className="host-game-container">
          <div className="host-scoreboard-section">
            <Scoreboard standings={standings} showPodium title="Standings" />
          </div>

          <div className="host-game-actions">
            {!isLastQuestion ? (
              <button type="button" className="btn btn-next" onClick={handleNextQuestion}>
                Next Question
              </button>
            ) : (
              <button type="button" className="btn btn-finish" onClick={handleFinishGame}>
                Finish Quiz
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Finished ───

  if (state.phase === 'finished') {
    return (
      <div className="page host-results">
        <div className="host-results-container">
          <h1 className="results-title">Final Results</h1>
          <p className="results-subtitle">Great game, everyone!</p>

          <Scoreboard standings={standings} showPodium />

          <div className="results-actions">
            <button type="button" className="btn btn-primary" onClick={handlePlayAgain}>
              Play Again
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleNewQuiz}>
              New Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback loading state
  return (
    <div className="page host-game">
      <div className="host-game-container" style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '2rem auto' }} />
        <p>Loading quiz...</p>
      </div>
    </div>
  );
}

export default HostPage;
