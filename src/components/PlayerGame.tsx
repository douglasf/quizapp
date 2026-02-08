import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../hooks/usePlayer';
import Scoreboard from './Scoreboard';
import type { PlayerQuestion, PlayerStanding } from '../types/game';
import type { HostMessage } from '../types/messages';
import type { QuestionType } from '../types/quiz';
import './PlayerGame.css';

const ANSWER_COLORS = ['answer-btn--red', 'answer-btn--blue', 'answer-btn--yellow', 'answer-btn--green'] as const;
const ANSWER_LABELS = ['A', 'B', 'C', 'D'] as const;

type PlayerPhase = 'waiting' | 'answering' | 'submitted' | 'reveal' | 'finished';

interface RevealData {
  questionType: QuestionType;
  correctAnswer: number; // correctIndex for MC/TF, correctValue for slider
  correctAnswers?: number[]; // multi_choice: array of correct indices
  yourAnswer: number | null;
  yourAnswers?: number[]; // multi_choice: array of player's selected indices
  correct: boolean;
  scoreGained: number;
  closeness?: number; // slider only: distance from correct answer
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
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const questionStartedAtRef = useRef<number>(0);
  const timerExpiredRef = useRef(false);

  const [sliderValue, setSliderValue] = useState(50);
  const [selectedAnswers, setSelectedAnswers] = useState<Set<number>>(new Set());

  // Derived question type for the current question
  const questionType: QuestionType = (currentQuestion?.questionType as QuestionType) ?? 'multiple_choice';
  const isSlider = questionType === 'slider';
  const isTrueFalse = questionType === 'true_false';
  const isMultiChoice = questionType === 'multi_choice';

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
          scoreboard: 'waiting',
          answer_summary: 'waiting',
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
        const qSliderMin = msg.sliderMin ?? 0;
        const qSliderMax = msg.sliderMax ?? 100;
        setCurrentQuestion({
          index: msg.index,
          total: msg.total,
          text: msg.text,
          options: msg.options,
          timeLimitSeconds: msg.timeLimitSeconds,
          questionType: msg.questionType,
          sliderMin: qSliderMin,
          sliderMax: qSliderMax,
        });
        setSelectedAnswer(null);
        setSelectedAnswers(new Set());
        setRevealData(null);
        setSliderValue(Math.round((qSliderMin + qSliderMax) / 2));
        setPhase('answering');
        questionStartedAtRef.current = Date.now();
        timerExpiredRef.current = false;
        setTimeRemaining(msg.timeLimitSeconds);
        break;
      }
      case 'answer_ack': {
        setPhase('submitted');
        break;
      }
      case 'answer_reveal': {
        setRevealData({
          questionType: msg.questionType,
          correctAnswer: msg.correctAnswer ?? 0,
          correctAnswers: msg.correctAnswers,
          yourAnswer: msg.yourAnswer ?? null,
          yourAnswers: msg.yourAnswers,
          correct: msg.correct,
          scoreGained: msg.scoreGained,
          closeness: msg.closeness,
        });
        setPhase('reveal');
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
        setSelectedAnswers(new Set());
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

  // Timer countdown during answering phase
  useEffect(() => {
    if (phase !== 'answering' || !currentQuestion) return;

    const timeLimitMs = currentQuestion.timeLimitSeconds * 1000;

    const update = () => {
      const elapsed = Date.now() - questionStartedAtRef.current;
      const remaining = Math.max(0, (timeLimitMs - elapsed) / 1000);
      setTimeRemaining(remaining);

      if (remaining <= 0 && !timerExpiredRef.current) {
        timerExpiredRef.current = true;
      }
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [phase, currentQuestion]);

  const handleAnswerClick = useCallback((optionIndex: number) => {
    if (phase !== 'answering' || selectedAnswer !== null || timerExpiredRef.current) return;
    setSelectedAnswer(optionIndex);
    handleSubmitAnswer(optionIndex);
  }, [phase, selectedAnswer, handleSubmitAnswer]);

  const handleSliderSubmit = useCallback(() => {
    if (phase !== 'answering' || selectedAnswer !== null || timerExpiredRef.current) return;
    setSelectedAnswer(sliderValue);
    handleSubmitAnswer(sliderValue);
  }, [phase, selectedAnswer, sliderValue, handleSubmitAnswer]);

  const handleMultiChoiceToggle = useCallback((optionIndex: number) => {
    if (phase !== 'answering' || selectedAnswer !== null || timerExpiredRef.current) return;
    setSelectedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(optionIndex)) {
        next.delete(optionIndex);
      } else {
        next.add(optionIndex);
      }
      return next;
    });
  }, [phase, selectedAnswer]);

  const handleMultiChoiceSubmit = useCallback(() => {
    if (phase !== 'answering' || selectedAnswer !== null || timerExpiredRef.current) return;
    if (selectedAnswers.size === 0) return;
    const sorted = Array.from(selectedAnswers).sort((a, b) => a - b);
    setSelectedAnswer(0); // mark as submitted (non-null)
    handleSubmitAnswer(sorted);
  }, [phase, selectedAnswer, selectedAnswers, handleSubmitAnswer]);

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

            {/* Timer display */}
            {timeRemaining !== null && (
              <div className={`player-timer${(timeRemaining <= 5) ? ' player-timer--low' : ''}${timerExpiredRef.current ? ' player-timer--expired' : ''}`}>
                <div className="player-timer-track">
                  <div
                    className="player-timer-fill"
                    style={{ width: `${Math.max(0, Math.min(100, (timeRemaining / currentQuestion.timeLimitSeconds) * 100))}%` }}
                  />
                </div>
                <div className="player-timer-text">
                  {timerExpiredRef.current ? "Time's up!" : `${Math.ceil(timeRemaining)}s`}
                </div>
              </div>
            )}

            {/* ── Slider input ── */}
            {isSlider && (() => {
              const pSliderMin = currentQuestion.sliderMin ?? 0;
              const pSliderMax = currentQuestion.sliderMax ?? 100;
              const pRange = pSliderMax - pSliderMin;
              const pLabels: number[] = [];
              for (let i = 0; i <= 4; i++) {
                pLabels.push(Math.round(pSliderMin + (i / 4) * pRange));
              }
              return (
              <div className="player-slider-section">
                {selectedAnswer === null && !timerExpiredRef.current ? (
                  <>
                    <div className="player-slider-value-display">{sliderValue}</div>
                    <input
                      type="range"
                      className="player-slider-input"
                      min={pSliderMin}
                      max={pSliderMax}
                      step={1}
                      value={sliderValue}
                      onChange={(e) => setSliderValue(Number(e.target.value))}
                    />
                    <div className="player-slider-scale">
                      {pLabels.map((label, idx) => (
                        <span key={`ps-${idx}-${label}`}>{label}</span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary player-slider-submit"
                      onClick={handleSliderSubmit}
                    >
                      Submit: {sliderValue}
                    </button>
                  </>
                ) : (
                  <div className="player-slider-submitted">
                    <div className="player-slider-value-display player-slider-value-display--submitted">
                      {selectedAnswer ?? '—'}
                    </div>
                    <div className="player-slider-submitted-label">
                      {timerExpiredRef.current && selectedAnswer === null ? "Time's up!" : 'Answer locked in!'}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* ── Multi-choice checkbox options ── */}
            {isMultiChoice && (
              <div className="answer-grid answer-grid--multi-choice">
                {selectedAnswer === null && !timerExpiredRef.current ? (
                  <>
                    {currentQuestion.options.map((option, idx) => {
                      const isChecked = selectedAnswers.has(idx);
                      return (
                        <label
                          key={`mc-${ANSWER_LABELS[idx] ?? idx}`}
                          className={`multi-choice-label${isChecked ? ' multi-choice-label--checked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="multi-choice-checkbox"
                            checked={isChecked}
                            onChange={() => handleMultiChoiceToggle(idx)}
                          />
                          <span className="multi-choice-letter">{ANSWER_LABELS[idx] ?? String.fromCharCode(65 + idx)}</span>
                          <span className="multi-choice-text">{option}</span>
                        </label>
                      );
                    })}
                    <button
                      type="button"
                      className="btn btn-primary multi-choice-submit"
                      onClick={handleMultiChoiceSubmit}
                      disabled={selectedAnswers.size === 0}
                    >
                      Submit ({selectedAnswers.size} selected)
                    </button>
                  </>
                ) : (
                  <div className="multi-choice-submitted">
                    <div className="submitted-check">{'\u2705'}</div>
                    <div className="multi-choice-submitted-label">
                      {timerExpiredRef.current && selectedAnswer === null ? "Time's up!" : 'Answer locked in!'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MC / TF option buttons ── */}
            {!isSlider && !isMultiChoice && (
              <div className={`answer-grid${isTrueFalse ? ' answer-grid--two' : ''}`}>
                {currentQuestion.options.slice(0, isTrueFalse ? 2 : 4).map((option, idx) => {
                  // Defensive: hardcode True/False labels for backward compat with old quiz JSON
                  const displayText = isTrueFalse
                    ? (idx === 0 ? 'False' : 'True')
                    : option;
                  const isExpired = timerExpiredRef.current;
                  let btnClass = `answer-btn ${ANSWER_COLORS[idx]}`;
                  if (selectedAnswer === idx) btnClass += ' answer-btn--selected';
                  if (selectedAnswer !== null && selectedAnswer !== idx) btnClass += ' answer-btn--disabled-other';
                  if (isExpired && selectedAnswer === null) btnClass += ' answer-btn--disabled-other';

                  return (
                    <button
                      key={`answer-${ANSWER_LABELS[idx]}`}
                      type="button"
                      className={btnClass}
                      onClick={() => handleAnswerClick(idx)}
                      disabled={selectedAnswer !== null || isExpired}
                    >
                      <span className="answer-btn-label">{ANSWER_LABELS[idx]}</span>
                      {displayText}
                    </button>
                  );
                })}
              </div>
            )}
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

            {/* MC / TF reveal: show option grid with correct/incorrect highlighting */}
            {(revealData.questionType === 'multiple_choice' || revealData.questionType === 'true_false') && (() => {
              const revealCount = revealData.questionType === 'true_false' ? 2 : 4;
              return (
                <div className={`answer-grid answer-grid--reveal${revealData.questionType === 'true_false' ? ' answer-grid--two' : ''}`}>
                  {currentQuestion.options.slice(0, revealCount).map((option, idx) => {
                    // Defensive: hardcode True/False labels for backward compat with old quiz JSON
                    const displayText = revealData.questionType === 'true_false'
                      ? (idx === 0 ? 'False' : 'True')
                      : option;
                    let btnClass = `answer-btn ${ANSWER_COLORS[idx]}`;
                    const isCorrectAnswer = idx === revealData.correctAnswer;
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
                        {displayText}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Multi-choice reveal: show vertical list with correct/wrong/player-selected highlighting */}
            {revealData.questionType === 'multi_choice' && (() => {
              const correctSet = new Set(revealData.correctAnswers ?? []);
              const playerSet = new Set(revealData.yourAnswers ?? []);
              return (
                <div className="answer-grid answer-grid--reveal answer-grid--multi-choice">
                  {currentQuestion.options.map((option, idx) => {
                    const isCorrect = correctSet.has(idx);
                    const isSelected = playerSet.has(idx);
                    let optionClass = 'reveal-option';
                    if (isCorrect && isSelected) {
                      optionClass += ' reveal-option--correct-selected';
                    } else if (isCorrect && !isSelected) {
                      optionClass += ' reveal-option--correct-missed';
                    } else if (!isCorrect && isSelected) {
                      optionClass += ' reveal-option--wrong-selected';
                    } else {
                      optionClass += ' reveal-option--neutral';
                    }

                    return (
                      <div key={`mc-reveal-${ANSWER_LABELS[idx] ?? idx}`} className={optionClass}>
                        <span className="reveal-option-letter">{ANSWER_LABELS[idx] ?? String.fromCharCode(65 + idx)}</span>
                        <span className="reveal-option-text">{option}</span>
                        {isCorrect && <span className="reveal-badge">{'\u2713'}</span>}
                        {!isCorrect && isSelected && <span className="reveal-badge reveal-badge--wrong">{'\u2717'}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Slider reveal: show numeric answer comparison */}
            {revealData.questionType === 'slider' && (
              <div className="slider-reveal">
                <div className="slider-reveal-values">
                  <div className="slider-reveal-item">
                    <span className="slider-reveal-label">Your answer</span>
                    <span className="slider-reveal-value">{revealData.yourAnswer ?? '—'}</span>
                  </div>
                  <div className="slider-reveal-item">
                    <span className="slider-reveal-label">Correct answer</span>
                    <span className="slider-reveal-value slider-reveal-value--correct">{revealData.correctAnswer}</span>
                  </div>
                </div>
                {revealData.closeness !== undefined && revealData.closeness > 0 && (
                  <div className="slider-reveal-closeness">
                    Off by {revealData.closeness} point{revealData.closeness !== 1 ? 's' : ''}
                  </div>
                )}
                {revealData.closeness === 0 && (
                  <div className="slider-reveal-closeness slider-reveal-closeness--perfect">
                    Perfect answer!
                  </div>
                )}
              </div>
            )}

            <div className={`points-display ${revealData.scoreGained > 0 ? 'points-display--positive' : 'points-display--zero'}`}>
              {revealData.scoreGained > 0 ? `+${revealData.scoreGained} points!` : '0 points'}
            </div>
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
