import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../hooks/usePlayer';
import Scoreboard from './Scoreboard';
import type { PlayerQuestion, PlayerStanding } from '../types/game';
import type { HostMessage } from '../types/messages';
import './PlayerGame.css';

const ANSWER_COLORS = ['answer-btn--red', 'answer-btn--blue', 'answer-btn--yellow', 'answer-btn--green'] as const;
const ANSWER_LABELS = ['A', 'B', 'C', 'D'] as const;

type PlayerPhase = 'waiting' | 'answering' | 'submitted' | 'reveal' | 'scoreboard' | 'finished';

interface RevealData {
  correctIndex: number;
  yourAnswer: number | null;
  correct: boolean;
  scoreGained: number;
}

function PlayerGame() {
  const navigate = useNavigate();

  // Load player data from session
  const playerData = useMemo(() => {
    const stored = sessionStorage.getItem('quizapp_player_data');
    if (!stored) return null;
    try {
      return JSON.parse(stored) as { gameCode: string; playerName: string };
    } catch {
      return null;
    }
  }, []);

  const {
    connectionStatus,
    reconnectAttempts,
    handleGetState,
    handleSubmitAnswer,
    onMessage,
  } = usePlayer(playerData?.gameCode ?? '');

  const [phase, setPhase] = useState<PlayerPhase>('waiting');
  const [currentQuestion, setCurrentQuestion] = useState<PlayerQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [standings, setStandings] = useState<PlayerStanding[]>([]);
  const [showReconnectedToast, setShowReconnectedToast] = useState(false);
  const [prevConnectionStatus, setPrevConnectionStatus] = useState(connectionStatus);
  const [hasGotStateRef] = useState(() => ({ current: false }));

  // Send get_state message when connection opens so the host sends us the current game state
  useEffect(() => {
    if (
      connectionStatus === 'connected' &&
      playerData?.playerName &&
      !hasGotStateRef.current
    ) {
      handleGetState(playerData.playerName);
      hasGotStateRef.current = true;
    }
  }, [connectionStatus, playerData?.playerName, handleGetState, hasGotStateRef]);

  // Detect reconnection success and show toast
  useEffect(() => {
    if (prevConnectionStatus === 'reconnecting' && connectionStatus === 'connected') {
      setShowReconnectedToast(true);
      setTimeout(() => setShowReconnectedToast(false), 2000);
    }
    setPrevConnectionStatus(connectionStatus);
  }, [connectionStatus, prevConnectionStatus]);

  // Handle incoming messages from host
  const handleMessage = useCallback((msg: HostMessage) => {
    switch (msg.type) {
      case 'game_state': {
        // Map host GamePhase to PlayerPhase
        const phaseMap: Record<string, PlayerPhase> = {
          lobby: 'waiting',
          question: 'waiting', // will be overridden when question message arrives
          answer_reveal: 'waiting',
          scoreboard: 'scoreboard',
          finished: 'finished',
        };
        const mappedPhase = phaseMap[msg.phase] ?? 'waiting';
        setPhase(mappedPhase);
        if (msg.standings) {
          setStandings(msg.standings);
        }
        break;
      }
      case 'question': {
        setCurrentQuestion({
          index: msg.index,
          total: msg.total,
          text: msg.text,
          options: msg.options,
        });
        setSelectedAnswer(null);
        setRevealData(null);
        setPhase('answering');
        break;
      }
      case 'answer_ack': {
        setPhase('submitted');
        break;
      }
      case 'answer_reveal': {
        setRevealData({
          correctIndex: msg.correctIndex,
          yourAnswer: msg.yourAnswer,
          correct: msg.correct,
          scoreGained: msg.scoreGained,
        });
        setPhase('reveal');
        break;
      }
      case 'scoreboard': {
        setStandings(msg.standings);
        setPhase('scoreboard');
        break;
      }
      case 'game_over': {
        setStandings(msg.standings);
        setPhase('finished');
        break;
      }
      case 'play_again': {
        // Host started a new round — reset to waiting state
        setPhase('waiting');
        setCurrentQuestion(null);
        setSelectedAnswer(null);
        setRevealData(null);
        setStandings([]);
        break;
      }
      default:
        break;
    }
  }, []);

  useEffect(() => {
    onMessage(handleMessage);
  }, [onMessage, handleMessage]);

  const handleAnswerClick = useCallback((optionIndex: number) => {
    if (phase !== 'answering' || selectedAnswer !== null) return;
    setSelectedAnswer(optionIndex);
    handleSubmitAnswer(optionIndex);
  }, [phase, selectedAnswer, handleSubmitAnswer]);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  if (!playerData) {
    return (
      <div className="page player-game">
        <div className="player-game-container">
          <div className="waiting-screen">
            <h2>Not Connected</h2>
            <p>You need to join a game first.</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/join')}>
              Join a Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page player-game">
      <div className="player-game-container">
        {/* Reconnection overlay */}
        {connectionStatus === 'reconnecting' && (
          <div className="reconnect-overlay">
            <div className="reconnect-card">
              <div className="reconnect-spinner" />
              <h2>Connection Lost</h2>
              <p>Reconnecting...</p>
              <div className="reconnect-attempts">
                Attempt {reconnectAttempts} of 3
              </div>
            </div>
          </div>
        )}

        {connectionStatus === 'failed' && (
          <div className="reconnect-overlay">
            <div className="reconnect-card reconnect-failed">
              <h2>Unable to Reconnect</h2>
              <p>The host may have ended the game, or there was a network issue.</p>
              <div className="reconnect-failed-actions">
                <button type="button" className="btn btn-primary" onClick={handleRefresh}>
                  Try Again
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
                  Leave Game
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reconnected toast */}
        {showReconnectedToast && (
          <div className="reconnected-toast">Reconnected!</div>
        )}

        {/* Waiting phase */}
        {phase === 'waiting' && (
          <div className="waiting-screen">
            <h2>Waiting for the host to start...</h2>
            <div className="waiting-dots">
              <span />
              <span />
              <span />
            </div>
            <p>You&apos;re in! Sit tight.</p>
          </div>
        )}

        {/* Answering phase */}
        {phase === 'answering' && currentQuestion && (
          <div className="player-question-section">
            <div className="player-question-header">
              <div className="player-question-counter">
                Question {currentQuestion.index + 1} of {currentQuestion.total}
              </div>
              <h1 className="player-question-text">{currentQuestion.text}</h1>
            </div>

            <div className="answer-grid">
              {currentQuestion.options.map((option, idx) => {
                let btnClass = `answer-btn ${ANSWER_COLORS[idx]}`;
                if (selectedAnswer === idx) btnClass += ' answer-btn--selected';
                if (selectedAnswer !== null && selectedAnswer !== idx) btnClass += ' answer-btn--disabled-other';

                return (
                  <button
                    key={`answer-${ANSWER_LABELS[idx]}`}
                    type="button"
                    className={btnClass}
                    onClick={() => handleAnswerClick(idx)}
                    disabled={selectedAnswer !== null}
                  >
                    <span className="answer-btn-label">{ANSWER_LABELS[idx]}</span>
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Submitted phase */}
        {phase === 'submitted' && (
          <div className="submitted-screen">
            <div className="submitted-check">{'\u2705'}</div>
            <h2>Answer Submitted!</h2>
            <p>Waiting for results...</p>
          </div>
        )}

        {/* Reveal phase */}
        {phase === 'reveal' && currentQuestion && revealData && (
          <div className="player-question-section">
            <div className="player-question-header">
              <div className="player-question-counter">
                Question {currentQuestion.index + 1} of {currentQuestion.total}
              </div>
              <h1 className="player-question-text">{currentQuestion.text}</h1>
            </div>

            <div className="answer-grid">
              {currentQuestion.options.map((option, idx) => {
                let btnClass = `answer-btn ${ANSWER_COLORS[idx]}`;
                const isCorrectAnswer = idx === revealData.correctIndex;
                const isPlayerAnswer = idx === revealData.yourAnswer;

                if (isCorrectAnswer) {
                  btnClass += ' answer-btn--correct-answer';
                } else if (isPlayerAnswer) {
                  btnClass += ' answer-btn--wrong-answer';
                } else {
                  btnClass += ' answer-btn--disabled-other';
                }

                return (
                  <button
                    key={`reveal-${ANSWER_LABELS[idx]}`}
                    type="button"
                    className={btnClass}
                    disabled
                  >
                    <span className="answer-btn-label">{ANSWER_LABELS[idx]}</span>
                    {option}
                  </button>
                );
              })}
            </div>

            <div className={`points-display ${revealData.scoreGained > 0 ? 'points-display--positive' : 'points-display--zero'}`}>
              {revealData.scoreGained > 0 ? `+${revealData.scoreGained} points!` : '0 points'}
            </div>
          </div>
        )}

        {/* Scoreboard phase */}
        {phase === 'scoreboard' && (
          <div className="player-scoreboard-section">
            <Scoreboard
              standings={standings}
              currentPlayerName={playerData.playerName}
              showPodium
              title="Current Standings"
            />
          </div>
        )}

        {/* Finished phase — game over, show final results inline */}
        {phase === 'finished' && (
          <div className="player-scoreboard-section">
            <h2 className="game-over-title">Game Over!</h2>
            {(() => {
              const playerStanding = standings.find(
                (s) => s.name.toLowerCase() === playerData.playerName.toLowerCase(),
              );
              return playerStanding ? (
                <div className="player-rank-card">
                  <div className="player-rank-label">Your Final Rank</div>
                  <div className="player-rank-value">#{playerStanding.rank}</div>
                  <div className="player-score-value">{playerStanding.score} points</div>
                </div>
              ) : null;
            })()}
            <Scoreboard
              standings={standings}
              currentPlayerName={playerData.playerName}
              showPodium
              title="Final Leaderboard"
            />
            <p className="waiting-hint">Waiting for host...</p>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
              Leave Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlayerGame;
