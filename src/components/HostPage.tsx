import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import { useGameState } from '../hooks/useGameState';
import { useHostUrl } from '../hooks/useHostUrl';
import { useFullscreen } from '../hooks/useFullscreen';
import { useFitText } from '../hooks/useFitText';
import * as peerManager from '../utils/peerManager';
import { calculateScore, isAnswerCorrect } from '../utils/scoring';
import Avatar from './Avatar';
import Scoreboard from './Scoreboard';
import type { Quiz, QuestionType } from '../types/quiz';
import { DEFAULT_TIME_LIMIT_SECONDS } from '../types/quiz';
import type { AnswerSummaryResult } from '../types/game';
import './HostPage.css';

const IMPORTED_QUIZ_KEY = 'quizapp_imported_quiz';
const OPTION_COLORS = ['host-option--red', 'host-option--blue', 'host-option--yellow', 'host-option--green'] as const;
const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

// ─── Sub-component for the Question / Answer Reveal phase ───
// Extracted so that useFitText hooks are only called when this phase
// is actually rendering (hooks must be at the top level of a component,
// but this component is only mounted during question/answer_reveal).

interface QuestionPhaseProps {
  currentQuestion: Quiz['questions'][number];
  questionIndex: number;
  totalQuestions: number;
  phase: 'question' | 'answer_reveal';
  correctIndex: number;
  correctIndices: number[];
  answerDistribution: number[];
  answeredCount: number;
  totalPlayers: number;
  timeLimitSeconds: number;
  questionStartedAt: number;
  fullscreenButton: React.ReactNode;
  onRevealAnswer: () => void;
  onShowAnswerSummary: () => void;
}

function QuestionPhase({
  currentQuestion,
  questionIndex,
  totalQuestions,
  phase,
  correctIndex,
  correctIndices,
  answerDistribution,
  answeredCount,
  totalPlayers,
  timeLimitSeconds,
  questionStartedAt,
  fullscreenButton,
  onRevealAnswer,
  onShowAnswerSummary,
}: QuestionPhaseProps) {
  const questionType = currentQuestion.type ?? 'multiple_choice';
  const isSlider = questionType === 'slider';
  const isTrueFalse = questionType === 'true_false';
  const isMultiChoice = questionType === 'multi_choice';

  // How many option boxes to render
  const optionCount = isSlider ? 0 : isMultiChoice ? 0 : isTrueFalse ? 2 : 4;
  const activeLabels = OPTION_LABELS.slice(0, optionCount);
  const activeColors = OPTION_COLORS.slice(0, optionCount);

  // Check if this question has image options (parallel array to options[])
  const hasImageOptions = Array.isArray(currentQuestion.imageOptions) && currentQuestion.imageOptions.length > 0;

  const questionFitText = useFitText({ maxFontSize: 36, minFontSize: 18, content: currentQuestion.text });
  // Independent font sizing for each answer option box (always call 4 hooks — rules of hooks)
  const answerFitText0 = useFitText({ maxFontSize: 24, minFontSize: 12, content: currentQuestion.options[0] });
  const answerFitText1 = useFitText({ maxFontSize: 24, minFontSize: 12, content: currentQuestion.options[1] });
  const answerFitText2 = useFitText({ maxFontSize: 24, minFontSize: 12, content: currentQuestion.options[2] ?? '' });
  const answerFitText3 = useFitText({ maxFontSize: 24, minFontSize: 12, content: currentQuestion.options[3] ?? '' });
  const answerFitTexts = [answerFitText0, answerFitText1, answerFitText2, answerFitText3];

  // Timer state — countdown updates every 100ms during question phase
  const [timeRemaining, setTimeRemaining] = useState(timeLimitSeconds);

  useEffect(() => {
    // Reset timer immediately when entering question phase or when question changes
    setTimeRemaining(timeLimitSeconds);

    if (phase !== 'question') return;

    const update = () => {
      const elapsed = (Date.now() - questionStartedAt) / 1000;
      const remaining = Math.max(0, timeLimitSeconds - elapsed);
      setTimeRemaining(remaining);
    };

    update(); // immediate
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [phase, questionStartedAt, timeLimitSeconds]);

  const timerProgress = phase === 'question'
    ? Math.max(0, Math.min(1, timeRemaining / timeLimitSeconds))
    : 0;

  const timerIsLow = timeRemaining <= 5 && phase === 'question';

  // Slider-specific: correctValue and range for reveal
  const sliderCorrectValue = currentQuestion.correctValue ?? 50;
  const sliderMin = currentQuestion.sliderMin ?? 0;
  const sliderMax = currentQuestion.sliderMax ?? 100;
  const sliderRange = sliderMax - sliderMin;
  const sliderPercentage = sliderRange > 0 ? ((sliderCorrectValue - sliderMin) / sliderRange) * 100 : 0;

  // Compute 5 evenly-spaced scale labels
  const sliderLabels: number[] = [];
  for (let i = 0; i <= 4; i++) {
    sliderLabels.push(Math.round(sliderMin + (i / 4) * sliderRange));
  }

  return (
    <div className="page host-game">
      <div className="host-game-container">
        {fullscreenButton}

        {/* Timer bar — visible during question phase */}
        {phase === 'question' && (
          <div className={`host-timer-bar${timerIsLow ? ' host-timer-bar--low' : ''}`}>
            <div className="host-timer-track">
              <div
                className="host-timer-fill"
                style={{ width: `${timerProgress * 100}%` }}
              />
            </div>
            <div className="host-timer-text">{Math.ceil(timeRemaining)}s</div>
          </div>
        )}

        <div 
          ref={questionFitText.ref as React.RefObject<HTMLDivElement | null>}
          style={{ fontSize: `${questionFitText.fontSize}px` }}
          className="question-header-bar"
        >
          {currentQuestion.image && (
            <img
              src={currentQuestion.image}
              alt="Question"
              className="question-image"
            />
          )}
          <div className="question-counter">
            Question {questionIndex + 1} of {totalQuestions}
          </div>
          <h1 
            className="question-text"
          >
            {currentQuestion.text}
          </h1>
        </div>

        {/* ── Slider display ── */}
        {isSlider && (
          <div className="host-slider-display">
            {phase === 'question' ? (
              <div className="host-slider-waiting">
                <div className="host-slider-track-visual">
                  <div className="host-slider-track-bg" />
                  <div className="host-slider-scale">
                    {sliderLabels.map((label, idx) => (
                      <span key={`q-${idx}-${label}`} className="host-slider-label">{label}</span>
                    ))}
                  </div>
                </div>
                <div className="host-slider-hint">Players are choosing a value...</div>
              </div>
            ) : (
              <div className="host-slider-reveal">
                <div className="host-slider-track-visual">
                  <div className="host-slider-track-bg" />
                  <div
                    className="host-slider-marker"
                    style={{ left: `${sliderPercentage}%` }}
                  >
                    <div className="host-slider-marker-dot" />
                    <div className="host-slider-marker-label">{sliderCorrectValue}</div>
                  </div>
                  <div className="host-slider-scale">
                    {sliderLabels.map((label, idx) => (
                      <span key={`r-${idx}-${label}`} className="host-slider-label">{label}</span>
                    ))}
                  </div>
                </div>
                <div className="host-slider-value">Correct answer: {sliderCorrectValue}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Multi-choice options (vertical list / image grid) ── */}
        {isMultiChoice && (
          <div className={`host-options-list${hasImageOptions ? ' host-options-list--images' : ''}`}>
            {currentQuestion.options.map((option, idx) => {
              const isRevealed = phase === 'answer_reveal';
              const isCorrect = correctIndices.includes(idx);
              let itemClass = 'host-option-item host-option-item--multi-choice';
              if (isRevealed && isCorrect) itemClass += ' host-option-item--correct';
              if (isRevealed && !isCorrect) itemClass += ' host-option-item--incorrect';
              if (hasImageOptions) itemClass += ' host-option-item--has-image';

              const imageUrl = hasImageOptions ? (currentQuestion.imageOptions ?? [])[idx] : undefined;

              return (
                <div
                  key={`mc-option-${idx}`}
                  className={itemClass}
                  style={imageUrl ? {
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center center',
                    backgroundRepeat: 'no-repeat',
                  } : undefined}
                >
                  <span className={`option-label${imageUrl ? ' option-label--badge' : ''}`}>{String.fromCharCode(65 + idx)}</span>
                  {!imageUrl && (
                    <span className="option-text">{option}</span>
                  )}
                  {isRevealed && isCorrect && <span className="option-check">{'\u2713'}</span>}
                  {isRevealed && (
                    <span className="answer-distribution">
                      <span className="distribution-count">{answerDistribution[idx] ?? 0}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Option boxes (MC: 4, TF: 2, Slider: none) ── */}
        {optionCount > 0 && (
          <div className={`host-options-grid${isTrueFalse ? ' host-options-grid--two' : ''}${hasImageOptions && !isTrueFalse ? ' host-options-grid--images' : ''}`}>
            {activeLabels.map((label, idx) => {
              const option = currentQuestion.options[idx];
              // Defensive: hardcode True/False labels for backward compat with old quiz JSON
              const displayText = isTrueFalse
                ? (idx === 0 ? 'False' : 'True')
                : option;
              const isRevealed = phase === 'answer_reveal';
              const isCorrect = idx === correctIndex;
              let optionClass = `host-option ${activeColors[idx]}`;
              if (isRevealed && isCorrect) optionClass += ' host-option--correct';
              if (isRevealed && !isCorrect) optionClass += ' host-option--incorrect';
              if (hasImageOptions && !isTrueFalse) optionClass += ' host-option--has-image';

              const imageUrl = !isTrueFalse && hasImageOptions
                ? (currentQuestion.imageOptions ?? [])[idx]
                : undefined;

              return (
                <div 
                  key={`option-${label}`} 
                  ref={answerFitTexts[idx].ref as React.RefObject<HTMLDivElement | null>}
                  style={imageUrl
                    ? {
                        backgroundImage: `url(${imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center center',
                        backgroundRepeat: 'no-repeat',
                      }
                    : { fontSize: `${answerFitTexts[idx].fontSize}px` }
                  }
                  className={optionClass}
                >
                  <span className={`host-option-label${imageUrl ? ' host-option-label--badge' : ''}`}>{label}</span>
                  {!imageUrl && (
                    <span>{displayText}</span>
                  )}
                  {isRevealed && (
                    <span className="answer-distribution">
                      <span className="distribution-count">{answerDistribution[idx]}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer: answer counter + actions */}
        <div className="host-game-footer">
          <div className="answer-counter">
            <span className="answer-counter-number">{answeredCount}</span> of{' '}
            <span className="answer-counter-number">{totalPlayers}</span> players have answered
          </div>

          <div className="host-game-actions">
            {phase === 'question' && (
              <button type="button" className="btn btn-reveal" onClick={onRevealAnswer} aria-label="Reveal Answer">
                {'\u2192'}
              </button>
            )}
            {phase === 'answer_reveal' && (
              <button type="button" className="btn btn-primary" onClick={onShowAnswerSummary} aria-label="Who Got It Right?">
                {'\u2192'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * HostPage — single component managing the entire host flow:
 *   lobby → question → answer_reveal → answer_summary → finished
 *
 * This prevents PeerJS connection loss that would occur if we navigated
 * between separate route components (each would create a new peer).
 */
function HostPage() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  // Initialize PeerManager singleton (lazy — safe to call multiple times)
  const [_initialized] = useState(() => {
    peerManager.initializePeer();
    return true;
  });
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [showAnonymousStandingsModal, setShowAnonymousStandingsModal] = useState(false);
  const { isFullscreen, toggleFullscreen, isSupported: fullscreenSupported } = useFullscreen();

  const {
    state,
    initGame,
    startQuiz,
    revealAnswer,
    showAnswerSummary,
    nextQuestion,
    finishGame,
    getCorrectAnswerIndex,
  } = useGameState();

  const currentQuestionIndexRef = useRef(state.currentQuestionIndex);
  const phaseRef = useRef(state.phase);
  const lastRevealResultsRef = useRef<AnswerSummaryResult[]>([]);
  const questionStartedAtRef = useRef<number>(0);

  // Keep refs in sync with state
  currentQuestionIndexRef.current = state.currentQuestionIndex;
  phaseRef.current = state.phase;

  // Callback ref for when a player rejoins — sends them the current question.
  // Declared before useHost() so it can be passed in; the .current value is
  // assigned afterwards via useEffect once sendToPlayer is available.
  const onPlayerRejoinRef = useRef<((playerName: string) => void) | null>(null);

  // Callback ref for when a player sends get_state — sends them the current question
  // so they can sync to the correct game phase after reconnection.
  const onPlayerGetStateRef = useRef<((playerName: string) => void) | null>(null);

  const { gameCode, players, broadcast, sendToPlayer, error: hostError, getAnswers, getAnswerTimestamps, updatePlayerScore, resetScores } = useHost(
    currentQuestionIndexRef,
    phaseRef,
    onPlayerRejoinRef,
    onPlayerGetStateRef,
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
        const timeLimitSeconds = question.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS;
        const questionType = question.type ?? 'multiple_choice';
        // Small delay to let the connection stabilize
        setTimeout(() => {
          sendToPlayer(playerName, {
            type: 'question',
            index: qIndex,
            total: quiz.questions.length,
            text: question.text,
            options: question.options,
            timeLimitSeconds,
            questionType,
            sliderMin: question.sliderMin ?? 0,
            sliderMax: question.sliderMax ?? 100,
          });
        }, 200);
      }
    };
  }, [quiz, sendToPlayer]);

  // Assign the get_state callback — sends current question data when a player requests state sync
  useEffect(() => {
    onPlayerGetStateRef.current = (playerName: string) => {
      if (!quiz) return;
      const phase = phaseRef.current;
      const qIndex = currentQuestionIndexRef.current;
      const question = quiz.questions[qIndex];

      // If we're in question or answer_reveal phase, send the current question
      if ((phase === 'question' || phase === 'answer_reveal') && question) {
        const timeLimitSeconds = question.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS;
        const questionType = question.type ?? 'multiple_choice';
        // Small delay to let the connection stabilize after get_state response
        setTimeout(() => {
          sendToPlayer(playerName, {
            type: 'question',
            index: qIndex,
            total: quiz.questions.length,
            text: question.text,
            options: question.options,
            timeLimitSeconds,
            questionType,
            sliderMin: question.sliderMin ?? 0,
            sliderMax: question.sliderMax ?? 100,
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

  const { joinBaseUrl, detecting: detectingIp, localIp, detectedIp, manualIp, setManualIp } = useHostUrl();
  const [ipInputValue, setIpInputValue] = useState('');

  const connectedCount = Array.from(players.values()).filter((p) => p.connected).length;
  const playerCount = players.size;
  const joinUrl = `${joinBaseUrl}#/join/${gameCode}`;

  // True when we're on localhost but failed to detect a LAN IP — the QR code
  // will contain "localhost" which won't work on other devices.
  const isLocalhostFallback =
    !detectingIp &&
    !localIp &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Show the IP override banner when on localhost and the detected IP
  // doesn't look like a typical local network address (or detection failed).
  const isOnLocalhost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const detectedIpLooksWrong =
    isOnLocalhost &&
    !detectingIp &&
    !manualIp &&
    (!detectedIp || (!detectedIp.startsWith('192.168.') && !detectedIp.startsWith('10.')));

  const handleManualIpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ipInputValue.trim();
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
      setManualIp(trimmed);
    }
  };

  const handleClearOverride = () => {
    setManualIp(null);
    setIpInputValue('');
  };

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
      const timeLimitSeconds = question.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS;
      const questionType = question.type ?? 'multiple_choice';
      questionStartedAtRef.current = Date.now();
      broadcast({
        type: 'question',
        index: 0,
        total: quiz.questions.length,
        text: question.text,
        options: question.options,
        timeLimitSeconds,
        questionType,
        sliderMin: question.sliderMin ?? 0,
        sliderMax: question.sliderMax ?? 100,
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
        avatar: player.avatar,
      }));
  }, [players]);

  // Computed inline — no useMemo needed. The component re-renders whenever `players`
  // changes (via syncPlayersState on each answer), which gives us a fresh read of the
  // mutable answers Map. Iterating up to 20 entries is trivially cheap.
  const answerDistribution = (() => {
    const optionsLen = currentQuestion?.options.length ?? 4;
    const dist = new Array<number>(optionsLen).fill(0);
    const qType = currentQuestion?.type ?? 'multiple_choice';
    // For slider questions, distribution doesn't map to option indices
    if (qType === 'slider') return dist;
    for (const answer of hostAnswersForCurrent.values()) {
      if (qType === 'multi_choice' && Array.isArray(answer)) {
        // Multi-choice: each selected index gets a count
        for (const idx of answer) {
          if (idx >= 0 && idx < optionsLen) {
            dist[idx]++;
          }
        }
      } else if (typeof answer === 'number' && answer >= 0 && answer < optionsLen) {
        dist[answer]++;
      }
    }
    return dist;
  })();

  const handleRevealAnswer = useCallback(() => {
    if (!quiz || !currentQuestion) return;

    revealAnswer();

    const questionStartedAt = questionStartedAtRef.current;
    const timeLimitSeconds = currentQuestion.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS;
    const questionType: QuestionType = currentQuestion.type ?? 'multiple_choice';
    const isMultiChoiceQ = questionType === 'multi_choice';
    const correctAnswer: number | number[] = isMultiChoiceQ
      ? (currentQuestion.correctIndices ?? [])
      : questionType === 'slider'
        ? (currentQuestion.correctValue ?? 50)
        : currentQuestion.correctIndex;

    // Compute and apply scores using useHost's answer data (for ALL players who answered)
    const answers = getAnswers(state.currentQuestionIndex);
    const timestamps = getAnswerTimestamps(state.currentQuestionIndex);
    const revealResults: AnswerSummaryResult[] = [];

    for (const player of players.values()) {
      const playerKey = player.name.trim().toLowerCase();
      const playerAnswer = answers.get(playerKey);

      let scoreGained = 0;
      let correct = false;

      if (playerAnswer !== undefined) {
        // Compute elapsed time
        const answeredAt = timestamps.get(playerKey);
        let elapsedMs: number;
        if (answeredAt !== undefined && questionStartedAt > 0) {
          elapsedMs = Math.max(0, answeredAt - questionStartedAt);
        } else {
          // Fallback: use current time (penalizes players without timestamp)
          elapsedMs = Math.max(0, Date.now() - questionStartedAt);
        }

        scoreGained = calculateScore(
          questionType,
          playerAnswer,
          correctAnswer,
          elapsedMs,
          timeLimitSeconds,
          questionType === 'slider' ? {
            min: currentQuestion.sliderMin ?? 0,
            max: currentQuestion.sliderMax ?? 100,
          } : undefined,
        );
        correct = isAnswerCorrect(questionType, playerAnswer, correctAnswer);

        if (scoreGained > 0) {
          updatePlayerScore(player.name, scoreGained);
        }
      }

      // Track results for answer summary
      revealResults.push({
        name: player.name,
        avatar: player.avatar,
        correct,
        scoreGained,
        ...(isMultiChoiceQ && {
          yourAnswers: Array.isArray(playerAnswer) ? playerAnswer : [],
          correctAnswers: Array.isArray(correctAnswer) ? correctAnswer : [],
        }),
        ...(questionType === 'slider' && playerAnswer !== undefined && typeof playerAnswer === 'number'
          ? { playerAnswer, closeness: Math.abs(playerAnswer - (typeof correctAnswer === 'number' ? correctAnswer : 0)) }
          : {}),
      });
    }

    // Store results for later use by handleShowAnswerSummary
    lastRevealResultsRef.current = revealResults;

    // Send personalized answer_reveal to each connected player
    for (const player of players.values()) {
      if (!player.connected) continue;

      const playerKey = player.name.trim().toLowerCase();
      const playerAnswer = answers.get(playerKey);

      // Find this player's scoreGained from revealResults
      const playerResult = revealResults.find(r => r.name === player.name);
      const scoreGained = playerResult?.scoreGained ?? 0;

      if (isMultiChoiceQ) {
        // Multi-choice: send correctAnswers[] and yourAnswers[]
        const playerAnswerIndices = Array.isArray(playerAnswer) ? playerAnswer : [];
        const correctIndicesArr = Array.isArray(correctAnswer) ? correctAnswer : [];
        const correct = playerAnswerIndices.length === correctIndicesArr.length &&
                        correctIndicesArr.every(idx => playerAnswerIndices.includes(idx));

        sendToPlayer(player.name, {
          type: 'answer_reveal',
          questionIndex: state.currentQuestionIndex,
          questionType,
          correctAnswers: correctIndicesArr,
          yourAnswers: playerAnswerIndices,
          correct: playerAnswer !== undefined ? correct : false,
          scoreGained,
        });
      } else {
        // MC/TF/Slider: send single correctAnswer and yourAnswer
        const correct = isAnswerCorrect(questionType, playerAnswer ?? -1, correctAnswer);
        const singlePlayerAnswer = typeof playerAnswer === 'number' ? playerAnswer : null;
        const singleCorrectAnswer = typeof correctAnswer === 'number' ? correctAnswer : 0;

        sendToPlayer(player.name, {
          type: 'answer_reveal',
          questionIndex: state.currentQuestionIndex,
          questionType,
          correctAnswer: singleCorrectAnswer,
          yourAnswer: singlePlayerAnswer,
          correct: playerAnswer !== undefined ? correct : false,
          scoreGained,
          ...(questionType === 'slider' && typeof playerAnswer === 'number'
            ? { closeness: Math.abs(playerAnswer - singleCorrectAnswer) }
            : {}),
        });
      }
    }
  }, [quiz, currentQuestion, revealAnswer, players, getAnswers, getAnswerTimestamps, state.currentQuestionIndex, sendToPlayer, updatePlayerScore]);

  const handleShowAnswerSummary = useCallback(() => {
    showAnswerSummary();
  }, [showAnswerSummary]);

  const handleNextQuestion = useCallback(() => {
    nextQuestion();
    setShowAnonymousStandingsModal(false);

    const nextIndex = state.currentQuestionIndex + 1;
    const nextQ = quiz?.questions[nextIndex];
    if (nextQ) {
      const timeLimitSeconds = nextQ.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS;
      const questionType = nextQ.type ?? 'multiple_choice';
      questionStartedAtRef.current = Date.now();
      broadcast({
        type: 'question',
        index: nextIndex,
        total: totalQuestions,
        text: nextQ.text,
        options: nextQ.options,
        timeLimitSeconds,
        questionType,
        sliderMin: nextQ.sliderMin ?? 0,
        sliderMax: nextQ.sliderMax ?? 100,
      });
    }
  }, [nextQuestion, state.currentQuestionIndex, quiz, broadcast, totalQuestions]);

  const handleFinishGame = useCallback(() => {
    finishGame();
    setShowAnonymousStandingsModal(false);

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

  // ─── Fullscreen toggle button (shown in all phases) ───

  const fullscreenButton = fullscreenSupported ? (
    <button
      type="button"
      className="btn-fullscreen"
      onClick={toggleFullscreen}
      title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
      aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
    >
      {isFullscreen ? (
        /* Exit-fullscreen icon (shrink arrows) */
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      ) : (
        /* Enter-fullscreen icon (expand arrows) */
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      )}
    </button>
  ) : null;

  // ─── Render: Lobby ───

  if (state.phase === 'lobby') {
    return (
      <div className="page host-lobby">
        <div className="lobby-container">
          {fullscreenButton}
          <div className="lobby-warning">
            Keep this tab open! Closing it ends the quiz for everyone.
          </div>

          <h1>{quiz?.title || 'Quiz Lobby'}</h1>

          {hostError && (
            <div className="lobby-error" role="alert">
              {hostError}
              <button type="button" className="btn btn-secondary retry-btn" onClick={() => window.location.reload()}>
                Refresh Page
              </button>
            </div>
          )}

          {/* Game code card */}
          <div className="game-code-card">
            <div className="game-code-label">Game Code</div>
            <div className="game-code-value">{gameCode}</div>

            <div className="qr-wrapper">
              {detectingIp ? (
                <div className="qr-detecting">
                  <div className="spinner" />
                  <span>Detecting network address...</span>
                </div>
              ) : (
                <QRCodeSVG value={joinUrl} size={160} level="M" />
              )}
            </div>

            <div className="join-url-hint">{detectingIp ? 'Detecting...' : joinUrl}</div>

            {isLocalhostFallback && (
              <div className="localhost-warning">
                Could not detect your network IP. The link above uses <code>localhost</code> and
                will only work on this device. Players on other devices should visit your
                IP address manually (e.g. <code>http://192.168.x.x:{window.location.port}/quizapp/</code>)
                and enter the game code.
              </div>
            )}

            {/* IP override banner — shown when detected IP looks wrong (public IP or missing) */}
            {detectedIpLooksWrong && (
              <div className="ip-override-banner">
                <div className="ip-override-banner__text">
                  ⚠️ Wrong IP detected{detectedIp ? ` (${detectedIp})` : ''}. Enter your local network IP:
                </div>
                <form className="ip-override-form" onSubmit={handleManualIpSubmit}>
                  <input
                    type="text"
                    className="ip-override-input"
                    placeholder="e.g. 192.168.1.47"
                    value={ipInputValue}
                    onChange={(e) => setIpInputValue(e.target.value)}
                    pattern="\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                  <button type="submit" className="btn btn-secondary ip-override-btn">
                    Use this IP
                  </button>
                </form>
              </div>
            )}

            {/* Indicator when manual override is active */}
            {manualIp && (
              <div className="ip-override-active">
                Using manual IP: <strong>{manualIp}</strong>
                <button type="button" className="ip-override-clear" onClick={handleClearOverride}>
                  Clear override
                </button>
              </div>
            )}

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
                    {player.avatar && <Avatar emoji={player.avatar.emoji} color={player.avatar.color} size="sm" />}
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
      <QuestionPhase
        currentQuestion={currentQuestion}
        questionIndex={state.currentQuestionIndex}
        totalQuestions={totalQuestions}
        phase={state.phase}
        correctIndex={correctIndex ?? -1}
        correctIndices={currentQuestion.correctIndices ?? []}
        answerDistribution={answerDistribution}
        answeredCount={answeredCount}
        totalPlayers={totalPlayers}
        timeLimitSeconds={currentQuestion.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS}
        questionStartedAt={questionStartedAtRef.current}
        fullscreenButton={fullscreenButton}
        onRevealAnswer={handleRevealAnswer}
        onShowAnswerSummary={handleShowAnswerSummary}
      />
    );
  }

  // ─── Render: Answer Summary ───

  if (state.phase === 'answer_summary') {
    const currentQType: QuestionType = currentQuestion?.type ?? 'multiple_choice';
    const isSliderSummary = currentQType === 'slider';
    const isMultiChoiceSummary = currentQType === 'multi_choice';

    // Sort results: for slider, by score descending; for MC/TF, correct first then alphabetical
    const sortedResults = [...lastRevealResultsRef.current].sort((a, b) => {
      if (isSliderSummary) {
        return b.scoreGained - a.scoreGained || a.name.localeCompare(b.name);
      }
      if (a.correct !== b.correct) return a.correct ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div className="page host-game">
        <div className="host-game-container">
          {fullscreenButton}
          <div className="answer-summary-section">
            <h2 className="answer-summary-title">
              {isSliderSummary ? 'How Close Were They?' : 'Who Got It Right?'}
            </h2>
            <div className="answer-summary-list">
              {sortedResults.map((result) => {
                // For slider: color by score tier instead of binary correct/wrong
                const isSliderGood = isSliderSummary && result.scoreGained >= 500;
                const itemClass = isSliderSummary
                  ? `answer-summary-item ${isSliderGood ? 'answer-summary-item--correct' : 'answer-summary-item--wrong'}`
                  : `answer-summary-item ${result.correct ? 'answer-summary-item--correct' : 'answer-summary-item--wrong'}`;

                return (
                  <div key={result.name} className={itemClass}>
                    {isSliderSummary ? (
                      <span className="answer-summary-result answer-summary-result--slider">
                        {result.playerAnswer !== undefined ? result.playerAnswer : '—'}
                      </span>
                    ) : (
                      <span className="answer-summary-result">{result.correct ? '\u2713' : '\u2717'}</span>
                    )}
                    {result.avatar && <Avatar emoji={result.avatar.emoji} color={result.avatar.color} size="sm" />}
                    <span className="answer-summary-name">{result.name}</span>
                    {isMultiChoiceSummary && (
                      <span className="answer-summary-mc-details">
                        <span className="answer-summary-mc-row">
                          <span className="answer-summary-label">Selected:</span>
                          <span className="answer-summary-values">
                            {(result.yourAnswers ?? []).length === 0
                              ? '(none)'
                              : (result.yourAnswers ?? []).map(idx => String.fromCharCode(65 + idx)).join(', ')}
                          </span>
                        </span>
                        <span className="answer-summary-mc-row">
                          <span className="answer-summary-label">Correct:</span>
                          <span className="answer-summary-values">
                            {(result.correctAnswers ?? []).map(idx => String.fromCharCode(65 + idx)).join(', ')}
                          </span>
                        </span>
                      </span>
                    )}
                    {isSliderSummary && result.closeness !== undefined && (
                      <span className="answer-summary-closeness">
                        {result.closeness === 0 ? 'Perfect!' : `off by ${result.closeness}`}
                      </span>
                    )}
                    <span className="answer-summary-points">+{result.scoreGained} pts</span>
                  </div>
                );
              })}
            </div>
          </div>

          {showAnonymousStandingsModal && (
            <div className="host-anonymous-standings">
              <Scoreboard
                standings={standings.map(s => ({ name: '', score: s.score, rank: s.rank }))}
                anonymous
              />
            </div>
          )}

          <div className="host-game-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAnonymousStandingsModal(!showAnonymousStandingsModal)}
            >
              {showAnonymousStandingsModal ? 'Hide' : 'Show'} Anonymous Standings
            </button>
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
          {fullscreenButton}
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
