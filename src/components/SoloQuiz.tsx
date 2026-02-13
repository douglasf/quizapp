import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getQuiz, ApiError } from '../utils/apiClient';
import { calculateScore, isAnswerCorrect } from '../utils/scoring';
import type { Quiz, Question, QuestionType } from '../types/quiz';
import { DEFAULT_TIME_LIMIT_SECONDS } from '../types/quiz';
import './SoloQuiz.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANSWER_COLORS = [
  'solo-answer-btn--red',
  'solo-answer-btn--blue',
  'solo-answer-btn--yellow',
  'solo-answer-btn--green',
] as const;

const ANSWER_LABELS = ['A', 'B', 'C', 'D'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SoloPhase = 'loading' | 'error' | 'ready' | 'question' | 'reveal' | 'finished';

interface QuestionResult {
  questionIndex: number;
  questionText: string;
  questionType: QuestionType;
  playerAnswer: number | number[] | null; // null if timer expired
  correctAnswer: number | number[];
  correct: boolean;
  scoreGained: number;
  elapsedMs: number;
}

interface RevealData {
  questionType: QuestionType;
  correctAnswer: number | number[];
  playerAnswer: number | number[] | null;
  correct: boolean;
  scoreGained: number;
  closeness?: number; // slider only
}

interface PendingReveal {
  revealData: RevealData;
  questionResult: QuestionResult;
}

interface SoloQuizState {
  phase: SoloPhase;
  quiz: Quiz | null;
  quizTitle: string;
  currentQuestionIndex: number;
  questionStartedAt: number;
  totalScore: number;
  questionResults: QuestionResult[];
  currentReveal: RevealData | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estimate total quiz time in minutes based on per-question time limits. */
function estimateQuizTime(quiz: Quiz): number {
  const totalSeconds = quiz.questions.reduce(
    (sum, q) => sum + (q.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS),
    0,
  );
  return Math.max(1, Math.ceil(totalSeconds / 60));
}

/** Get the correct answer value(s) for a question. */
function getCorrectAnswer(question: Question): number | number[] {
  const qType = question.type ?? 'multiple_choice';
  if (qType === 'multi_choice') return question.correctIndices ?? [];
  if (qType === 'slider') return question.correctValue ?? 0;
  return question.correctIndex;
}

/** Build reveal data and question result for a given answer. */
function buildRevealAndResult(
  question: Question,
  questionIndex: number,
  playerAnswer: number | number[] | null,
  elapsedMs: number,
): PendingReveal {
  const qType = question.type ?? 'multiple_choice';
  const correctAns = getCorrectAnswer(question);
  const timeLimitSeconds = question.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS;

  let scoreGained = 0;
  let correct = false;
  let closeness: number | undefined;

  if (playerAnswer !== null) {
    scoreGained = calculateScore(
      qType, playerAnswer, correctAns, elapsedMs, timeLimitSeconds,
      qType === 'slider' ? { min: question.sliderMin ?? 0, max: question.sliderMax ?? 100 } : undefined,
    );
    correct = isAnswerCorrect(qType, playerAnswer, correctAns);
  }

  if (qType === 'slider') {
    closeness = playerAnswer !== null
      ? Math.abs((playerAnswer as number) - (correctAns as number))
      : undefined;
  }

  return {
    revealData: { questionType: qType, correctAnswer: correctAns, playerAnswer, correct, scoreGained, closeness },
    questionResult: {
      questionIndex, questionText: question.text, questionType: qType,
      playerAnswer, correctAnswer: correctAns, correct, scoreGained, elapsedMs,
    },
  };
}

function buildShareText(
  quizTitle: string,
  totalScore: number,
  questionResults: QuestionResult[],
  quizId: string,
): string {
  const correctCount = questionResults.filter(r => r.correct).length;
  const totalQuestions = questionResults.length;

  const totalMs = questionResults.reduce((sum, r) => sum + r.elapsedMs, 0);
  const totalSeconds = Math.round(totalMs / 1000);
  const timeStr = totalSeconds >= 60
    ? `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
    : `${totalSeconds}s`;

  const quizLink = `${window.location.origin}/quizapp/#/solo/${quizId}`;

  return [
    `🧠 Quiz: ${quizTitle}`,
    `🏆 Score: ${totalScore.toLocaleString()} points`,
    `⏱️ Time: ${timeStr}`,
    `✅ ${correctCount}/${totalQuestions} correct`,
    '',
    quizLink,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SoloQuiz() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  // ── Refs for focus management ────────────────────────────────────────
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const questionSectionRef = useRef<HTMLDivElement>(null);

  // ── High-level quiz state ────────────────────────────────────────────
  const [state, setState] = useState<SoloQuizState>({
    phase: 'loading',
    quiz: null,
    quizTitle: '',
    currentQuestionIndex: 0,
    questionStartedAt: 0,
    totalScore: 0,
    questionResults: [],
    currentReveal: null,
    error: null,
  });

  // ── Per-question interaction state ───────────────────────────────────
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Set<number>>(new Set());
  const [sliderValue, setSliderValue] = useState(50);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const timerExpiredRef = useRef(false);
  const answerSubmittedRef = useRef(false);
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(null);
  const [shareResultCopied, setShareResultCopied] = useState(false);

  // ── Derived values ───────────────────────────────────────────────────
  const { phase, quiz, quizTitle, currentQuestionIndex, error } = state;

  const currentQuestion =
    (phase === 'question' || phase === 'reveal') && quiz
      ? (quiz.questions[currentQuestionIndex] ?? null)
      : null;

  const questionType: QuestionType = currentQuestion?.type ?? 'multiple_choice';
  const isSlider = questionType === 'slider';
  const isTrueFalse = questionType === 'true_false';
  const isMultiChoice = questionType === 'multi_choice';
  const hasImageOptions = !!(
    currentQuestion &&
    Array.isArray(currentQuestion.imageOptions) &&
    currentQuestion.imageOptions.length > 0
  );
  const timeLimitSec = currentQuestion?.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS;

  // Urgency effects: vignette + heartbeat when timer is critically low
  const shouldShowUrgentEffects =
    timeRemaining !== null &&
    timeRemaining <= 5 &&
    timeRemaining > 0 &&
    timeLimitSec > 5 &&
    phase === 'question' &&
    !answerSubmitted;

  // ── Fetch quiz on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!quizId) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: 'No quiz ID provided.',
      }));
      return;
    }

    let cancelled = false;

    async function fetchQuiz() {
      try {
        const response = await getQuiz(quizId as string);
        if (cancelled) return;

        const quizData = response.quiz.data;
        const title = response.quiz.title || quizData.title || 'Untitled Quiz';

        if (!quizData.questions || quizData.questions.length === 0) {
          setState((prev) => ({
            ...prev,
            phase: 'error',
            error: 'This quiz has no questions.',
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          phase: 'ready',
          quiz: quizData,
          quizTitle: title,
          error: null,
        }));
      } catch (err) {
        if (cancelled) return;

        let errorMessage = 'Something went wrong loading this quiz.';
        if (err instanceof ApiError) {
          if (err.status === 404) {
            errorMessage = 'Quiz not found. It may have been deleted.';
          } else {
            errorMessage = `Failed to load quiz (${err.status}).`;
          }
        } else if (err instanceof Error && err.message.includes('fetch')) {
          errorMessage =
            'Network error — please check your connection and try again.';
        }

        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: errorMessage,
        }));
      }
    }

    fetchQuiz();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  // ── Start quiz ───────────────────────────────────────────────────────
  const handleStartQuiz = useCallback(() => {
    if (!quiz) return;
    const firstQ = quiz.questions[0];
    const slMin = firstQ?.sliderMin ?? 0;
    const slMax = firstQ?.sliderMax ?? 100;

    setState((prev) => ({
      ...prev,
      phase: 'question',
      currentQuestionIndex: 0,
      questionStartedAt: Date.now(),
      totalScore: 0,
      questionResults: [],
      currentReveal: null,
    }));

    // Reset per-question state for the first question
    setSelectedAnswer(null);
    setSelectedAnswers(new Set());
    setSliderValue(Math.round((slMin + slMax) / 2));
    setTimeRemaining(firstQ?.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS);
    setAnswerSubmitted(false);
    setTimerExpired(false);
    timerExpiredRef.current = false;
    answerSubmittedRef.current = false;
    setPendingReveal(null);
  }, [quiz]);

  // ── Timer countdown (100ms tick for smooth UI) ───────────────────────
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return;

    const timeLimitMs = timeLimitSec * 1000;

    const update = () => {
      const elapsed = Date.now() - state.questionStartedAt;
      const remaining = Math.max(0, (timeLimitMs - elapsed) / 1000);
      setTimeRemaining(remaining);

      if (remaining <= 0 && !timerExpiredRef.current) {
        timerExpiredRef.current = true;
        setTimerExpired(true);

        // If no answer was submitted, set pending reveal with score=0
        if (!answerSubmittedRef.current) {
          setPendingReveal(
            buildRevealAndResult(currentQuestion, currentQuestionIndex, null, timeLimitMs),
          );
        }
      }
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [phase, currentQuestion, currentQuestionIndex, state.questionStartedAt, timeLimitSec]);

  // ── Answer handlers ──────────────────────────────────────────────────

  /** MC/TF: single click immediately submits */
  const handleAnswerClick = useCallback(
    (optionIndex: number) => {
      if (
        phase !== 'question' ||
        selectedAnswer !== null ||
        answerSubmitted ||
        timerExpiredRef.current ||
        !currentQuestion
      )
        return;
      const elapsedMs = Date.now() - state.questionStartedAt;
      setSelectedAnswer(optionIndex);
      setAnswerSubmitted(true);
      answerSubmittedRef.current = true;
      setPendingReveal(
        buildRevealAndResult(currentQuestion, currentQuestionIndex, optionIndex, elapsedMs),
      );
    },
    [phase, selectedAnswer, answerSubmitted, currentQuestion, currentQuestionIndex, state.questionStartedAt],
  );

  /** Slider: explicit submit button */
  const handleSliderSubmit = useCallback(() => {
    if (phase !== 'question' || answerSubmitted || timerExpiredRef.current || !currentQuestion)
      return;
    const elapsedMs = Date.now() - state.questionStartedAt;
    setSelectedAnswer(sliderValue);
    setAnswerSubmitted(true);
    answerSubmittedRef.current = true;
    setPendingReveal(
      buildRevealAndResult(currentQuestion, currentQuestionIndex, sliderValue, elapsedMs),
    );
  }, [phase, answerSubmitted, sliderValue, currentQuestion, currentQuestionIndex, state.questionStartedAt]);

  /** Multi-choice: toggle individual checkbox */
  const handleMultiChoiceToggle = useCallback(
    (optionIndex: number) => {
      if (phase !== 'question' || answerSubmitted || timerExpiredRef.current)
        return;
      setSelectedAnswers((prev) => {
        const next = new Set(prev);
        if (next.has(optionIndex)) next.delete(optionIndex);
        else next.add(optionIndex);
        return next;
      });
    },
    [phase, answerSubmitted],
  );

  /** Multi-choice: submit selected options */
  const handleMultiChoiceSubmit = useCallback(() => {
    if (phase !== 'question' || answerSubmitted || timerExpiredRef.current || !currentQuestion)
      return;
    if (selectedAnswers.size === 0) return;
    const elapsedMs = Date.now() - state.questionStartedAt;
    const playerAns = Array.from(selectedAnswers);
    setSelectedAnswer(0); // sentinel: non-null marks submission
    setAnswerSubmitted(true);
    answerSubmittedRef.current = true;
    setPendingReveal(
      buildRevealAndResult(currentQuestion, currentQuestionIndex, playerAns, elapsedMs),
    );
  }, [phase, answerSubmitted, selectedAnswers, currentQuestion, currentQuestionIndex, state.questionStartedAt]);

  /** Keyboard: Enter submits slider / multi-choice */
  const handleQuestionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' || answerSubmitted || timerExpiredRef.current)
        return;
      if (isSlider) {
        handleSliderSubmit();
      } else if (isMultiChoice && selectedAnswers.size > 0) {
        handleMultiChoiceSubmit();
      }
    },
    [
      answerSubmitted,
      isSlider,
      isMultiChoice,
      selectedAnswers,
      handleSliderSubmit,
      handleMultiChoiceSubmit,
    ],
  );

  /** Share result: copy formatted text to clipboard */
  const handleShareResult = useCallback(() => {
    if (!quizId) return;
    const text = buildShareText(
      state.quizTitle,
      state.totalScore,
      state.questionResults,
      quizId,
    );
    navigator.clipboard.writeText(text).then(() => {
      setShareResultCopied(true);
      setTimeout(() => setShareResultCopied(false), 2000);
    });
  }, [quizId, state.quizTitle, state.totalScore, state.questionResults]);

  // ── Auto-transition: question → reveal after 1.5s delay ─────────────
  useEffect(() => {
    if (!pendingReveal || phase !== 'question') return;

    const timeout = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        phase: 'reveal',
        currentReveal: pendingReveal.revealData,
        totalScore: prev.totalScore + pendingReveal.revealData.scoreGained,
        questionResults: [...prev.questionResults, pendingReveal.questionResult],
      }));
    }, 1500);

    return () => clearTimeout(timeout);
  }, [pendingReveal, phase]);

  // ── Focus management: move focus to Next button on reveal ───────────
  useEffect(() => {
    if (phase === 'reveal') {
      // Small delay to let the DOM render before focusing
      requestAnimationFrame(() => {
        nextBtnRef.current?.focus();
      });
    }
  }, [phase]);

  // ── Focus management: focus question section on new question ────────
  useEffect(() => {
    if (phase === 'question') {
      requestAnimationFrame(() => {
        questionSectionRef.current?.focus();
      });
    }
  }, [phase]);

  // ── Play again (reset to ready phase) ─────────────────────────────────
  const handlePlayAgain = useCallback(() => {
    setShareResultCopied(false);
    setState((prev) => ({
      ...prev,
      phase: 'ready',
      currentQuestionIndex: 0,
      questionStartedAt: 0,
      totalScore: 0,
      questionResults: [],
      currentReveal: null,
    }));

    // Reset all per-question state
    setSelectedAnswer(null);
    setSelectedAnswers(new Set());
    setSliderValue(50);
    setTimeRemaining(null);
    setAnswerSubmitted(false);
    setTimerExpired(false);
    timerExpiredRef.current = false;
    answerSubmittedRef.current = false;
    setPendingReveal(null);
  }, []);

  // ── Next question / See results ─────────────────────────────────────
  const handleNextQuestion = useCallback(() => {
    if (phase !== 'reveal' || !quiz) return;

    const nextIndex = currentQuestionIndex + 1;

    if (nextIndex >= quiz.questions.length) {
      // Last question — transition to finished
      setState((prev) => ({ ...prev, phase: 'finished', currentReveal: null }));
      return;
    }

    // Advance to next question
    const nextQ = quiz.questions[nextIndex];
    const slMin = nextQ?.sliderMin ?? 0;
    const slMax = nextQ?.sliderMax ?? 100;

    setState((prev) => ({
      ...prev,
      phase: 'question',
      currentQuestionIndex: nextIndex,
      questionStartedAt: Date.now(),
      currentReveal: null,
    }));

    // Reset per-question state
    setSelectedAnswer(null);
    setSelectedAnswers(new Set());
    setSliderValue(Math.round((slMin + slMax) / 2));
    setTimeRemaining(nextQ?.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS);
    setAnswerSubmitted(false);
    setTimerExpired(false);
    timerExpiredRef.current = false;
    answerSubmittedRef.current = false;
    setPendingReveal(null);
  }, [phase, quiz, currentQuestionIndex]);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className={`page solo-quiz${shouldShowUrgentEffects ? ' solo-quiz--countdown-urgent' : ''}`}
    >
      <div className="solo-quiz-container">
        {/* ── Loading phase ── */}
        {phase === 'loading' && (
          <div className="solo-loading">
            <div className="solo-spinner" />
            <p>Loading quiz...</p>
          </div>
        )}

        {/* ── Error phase ── */}
        {phase === 'error' && (
          <div className="solo-error" role="alert">
            <div className="solo-error-icon" aria-hidden="true">!</div>
            <h2>Oops</h2>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/')}
            >
              Back to Home
            </button>
          </div>
        )}

        {/* ── Ready phase ── */}
        {phase === 'ready' && quiz && (
          <div className="solo-ready">
            <h1 className="solo-ready-title">{quizTitle}</h1>
            <div className="solo-ready-meta">
              <span className="solo-ready-meta-item">
                {quiz.questions.length} question
                {quiz.questions.length !== 1 ? 's' : ''}
              </span>
              <span className="solo-ready-meta-separator">&middot;</span>
              <span className="solo-ready-meta-item">
                ~{estimateQuizTime(quiz)} min
              </span>
            </div>
            <p className="solo-ready-description">
              Answer at your own pace. Your score is based on speed and accuracy.
            </p>
            <button
              type="button"
              className="btn btn-primary solo-start-btn"
              onClick={handleStartQuiz}
            >
              Start Quiz
            </button>
          </div>
        )}

        {/* ── Question phase ── */}
        {phase === 'question' && currentQuestion && (
          <div
            className="solo-question-section"
            onKeyDown={handleQuestionKeyDown}
            ref={questionSectionRef}
            tabIndex={-1}
            aria-label={`Question ${currentQuestionIndex + 1} of ${quiz?.questions.length ?? 0}`}
          >
            {/* Question header: image, counter, text */}
            <div className="solo-question-header">
              {currentQuestion.image && (
                <div className="solo-question-image">
                  <img src={currentQuestion.image} alt="Question" />
                </div>
              )}
              <div className="solo-question-counter">
                Question {currentQuestionIndex + 1} of{' '}
                {quiz?.questions.length ?? 0}
              </div>
              <h1 className="solo-question-text">{currentQuestion.text}</h1>
            </div>

            {/* Timer countdown bar */}
            {timeRemaining !== null && (
              <div
                className={`solo-timer${
                  timeRemaining <= 5 && timeRemaining > 0
                    ? ' solo-timer--low'
                    : ''
                }${timerExpired ? ' solo-timer--expired' : ''}`}
                role="timer"
                aria-label={timerExpired ? "Time's up" : `${Math.ceil(timeRemaining)} seconds remaining`}
              >
                <div className="solo-timer-track" aria-hidden="true">
                  <div
                    className="solo-timer-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, (timeRemaining / timeLimitSec) * 100))}%`,
                    }}
                  />
                </div>
                <div
                  className={`solo-timer-text${
                    shouldShowUrgentEffects
                      ? ' solo-timer-text--heartbeat'
                      : ''
                  }`}
                >
                  {timerExpired
                    ? "Time's up!"
                    : `${Math.ceil(timeRemaining)}s`}
                </div>
              </div>
            )}

            {/* ── Slider input ── */}
            {isSlider &&
              (() => {
                const slMin = currentQuestion.sliderMin ?? 0;
                const slMax = currentQuestion.sliderMax ?? 100;
                const slRange = slMax - slMin;
                const scaleLabels: number[] = [];
                for (let i = 0; i <= 4; i++) {
                  scaleLabels.push(Math.round(slMin + (i / 4) * slRange));
                }
                return (
                  <div className="solo-slider-section">
                    {!answerSubmitted && !timerExpired ? (
                      <>
                        <div className="solo-slider-value">{sliderValue}</div>
                        <input
                          type="range"
                          className="solo-slider-input"
                          min={slMin}
                          max={slMax}
                          step={1}
                          value={sliderValue}
                          onChange={(e) =>
                            setSliderValue(Number(e.target.value))
                          }
                          aria-label={`Answer value, ${slMin} to ${slMax}`}
                          aria-valuetext={String(sliderValue)}
                        />
                        <div className="solo-slider-scale">
                          {scaleLabels.map((label, idx) => (
                            <span key={`sl-${idx}-${label}`}>{label}</span>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary solo-slider-submit"
                          onClick={handleSliderSubmit}
                        >
                          Submit: {sliderValue}
                        </button>
                      </>
                    ) : (
                      <div className="solo-slider-locked">
                        <div className="solo-slider-value solo-slider-value--submitted">
                          {answerSubmitted ? selectedAnswer : '\u2014'}
                        </div>
                        <div className="solo-slider-locked-label">
                          {timerExpired && !answerSubmitted
                            ? "Time's up!"
                            : 'Answer locked in!'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* ── Multi-choice checkboxes ── */}
            {isMultiChoice && (
              <div
                className={`solo-answer-grid solo-answer-grid--mc${
                  hasImageOptions ? ' solo-answer-grid--mc-images' : ''
                }`}
              >
                {!answerSubmitted && !timerExpired ? (
                  <>
                    {currentQuestion.options.map((option, idx) => {
                      const isChecked = selectedAnswers.has(idx);
                      const imageUrl = hasImageOptions
                        ? (currentQuestion.imageOptions ?? [])[idx]
                        : undefined;
                      return (
                        <label
                          key={`mc-${ANSWER_LABELS[idx] ?? idx}`}
                          className={`solo-mc-label${
                            isChecked ? ' solo-mc-label--checked' : ''
                          }${imageUrl ? ' solo-mc-label--image' : ''}`}
                          style={
                            imageUrl
                              ? {
                                  backgroundImage: `url(${imageUrl})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center center',
                                  backgroundRepeat: 'no-repeat',
                                }
                              : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            className="solo-mc-checkbox"
                            checked={isChecked}
                            onChange={() => handleMultiChoiceToggle(idx)}
                          />
                          {!imageUrl && (
                            <span className="solo-mc-text">
                              {ANSWER_LABELS[idx] ??
                                String.fromCharCode(65 + idx)}
                              . {option}
                            </span>
                          )}
                          {imageUrl && (
                            <span className="solo-mc-image-letter">
                              {ANSWER_LABELS[idx] ??
                                String.fromCharCode(65 + idx)}
                            </span>
                          )}
                          {isChecked && (
                            <span className="solo-mc-check-badge">
                              {'\u2713'}
                            </span>
                          )}
                        </label>
                      );
                    })}
                    <button
                      type="button"
                      className="btn btn-primary solo-mc-submit"
                      onClick={handleMultiChoiceSubmit}
                      disabled={selectedAnswers.size === 0}
                    >
                      Submit ({selectedAnswers.size} selected)
                    </button>
                  </>
                ) : (
                  <div className="solo-mc-locked">
                    <div className="solo-mc-locked-icon">{'\u2705'}</div>
                    <div className="solo-mc-locked-label">
                      {timerExpired && !answerSubmitted
                        ? "Time's up!"
                        : 'Answer locked in!'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MC / TF answer buttons ── */}
            {!isSlider && !isMultiChoice && (
              <div
                className={`solo-answer-grid${
                  isTrueFalse ? ' solo-answer-grid--two' : ''
                }${
                  hasImageOptions && !isTrueFalse
                    ? ' solo-answer-grid--images'
                    : ''
                }`}
              >
                {currentQuestion.options
                  .slice(0, isTrueFalse ? 2 : 4)
                  .map((option, idx) => {
                    const expired = timerExpired;
                    const imageUrl =
                      !isTrueFalse && hasImageOptions
                        ? (currentQuestion.imageOptions ?? [])[idx]
                        : undefined;
                    let btnClass = `solo-answer-btn ${ANSWER_COLORS[idx]}`;
                    if (imageUrl) btnClass += ' solo-answer-btn--image';
                    if (selectedAnswer === idx)
                      btnClass += ' solo-answer-btn--selected';
                    if (selectedAnswer !== null && selectedAnswer !== idx)
                      btnClass += ' solo-answer-btn--disabled';
                    if (expired && selectedAnswer === null)
                      btnClass += ' solo-answer-btn--disabled';

                    return (
                      <button
                        key={`answer-${ANSWER_LABELS[idx]}`}
                        type="button"
                        className={btnClass}
                        onClick={() => handleAnswerClick(idx)}
                        disabled={selectedAnswer !== null || expired}
                        style={
                          imageUrl
                            ? {
                                backgroundImage: `url(${imageUrl})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center center',
                                backgroundRepeat: 'no-repeat',
                              }
                            : undefined
                        }
                      >
                        <span
                          className={`solo-answer-btn-label${
                            imageUrl ? ' solo-answer-btn-label--badge' : ''
                          }`}
                        >
                          {ANSWER_LABELS[idx]}
                        </span>
                        {!imageUrl && (
                          <span className="solo-answer-btn-text">
                            {option}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Submission / expiry feedback (MC/TF only — slider and multi-choice have inline feedback) */}
            {(answerSubmitted || timerExpired) && !isSlider && !isMultiChoice && (
              <output className="solo-submit-feedback" aria-live="polite">
                {answerSubmitted ? 'Answer submitted!' : "Time's up!"}
              </output>
            )}
          </div>
        )}

        {/* ── Reveal phase ── */}
        {phase === 'reveal' && currentQuestion && state.currentReveal && (
          <div className="solo-reveal-section">
            {/* Question header (same as question phase) */}
            <div className="solo-question-header">
              {currentQuestion.image && (
                <div className="solo-question-image">
                  <img src={currentQuestion.image} alt="Question" />
                </div>
              )}
              <div className="solo-question-counter">
                Question {currentQuestionIndex + 1} of{' '}
                {quiz?.questions.length ?? 0}
              </div>
              <h1 className="solo-question-text">{currentQuestion.text}</h1>
            </div>

            {/* MC / TF reveal: option grid with correct/incorrect highlighting */}
            {(state.currentReveal.questionType === 'multiple_choice' ||
              state.currentReveal.questionType === 'true_false') &&
              (() => {
                const revealCount =
                  state.currentReveal.questionType === 'true_false' ? 2 : 4;
                const revealHasImages =
                  state.currentReveal.questionType !== 'true_false' &&
                  hasImageOptions;
                const correctIdx = state.currentReveal
                  .correctAnswer as number;
                const playerIdx = state.currentReveal
                  .playerAnswer as number | null;
                return (
                  <div
                    className={`solo-answer-grid solo-answer-grid--reveal${
                      state.currentReveal.questionType === 'true_false'
                        ? ' solo-answer-grid--two'
                        : ''
                    }${revealHasImages ? ' solo-answer-grid--images' : ''}`}
                  >
                    {currentQuestion.options
                      .slice(0, revealCount)
                      .map((option, idx) => {
                        const imageUrl = revealHasImages
                          ? (currentQuestion.imageOptions ?? [])[idx]
                          : undefined;
                        let btnClass = `solo-answer-btn ${ANSWER_COLORS[idx]}`;
                        if (imageUrl) btnClass += ' solo-answer-btn--image';
                        const isCorrectAnswer = idx === correctIdx;
                        const isPlayerAnswer = idx === playerIdx;

                        if (isCorrectAnswer) {
                          btnClass += ' solo-answer-btn--correct-answer';
                        } else if (isPlayerAnswer) {
                          btnClass += ' solo-answer-btn--wrong-answer';
                        } else {
                          btnClass += ' solo-answer-btn--disabled-other';
                        }

                        return (
                          <button
                            key={`reveal-${ANSWER_LABELS[idx]}`}
                            type="button"
                            className={btnClass}
                            disabled
                            style={
                              imageUrl
                                ? {
                                    backgroundImage: `url(${imageUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center center',
                                    backgroundRepeat: 'no-repeat',
                                  }
                                : undefined
                            }
                          >
                            <span
                              className={`solo-answer-btn-label${
                                imageUrl
                                  ? ' solo-answer-btn-label--badge'
                                  : ''
                              }`}
                            >
                              {ANSWER_LABELS[idx]}
                            </span>
                            {!imageUrl && (
                              <span className="solo-answer-btn-text">
                                {option}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                );
              })()}

            {/* Multi-choice reveal: correct/wrong/missed highlighting */}
            {state.currentReveal.questionType === 'multi_choice' &&
              (() => {
                const correctSet = new Set(
                  state.currentReveal.correctAnswer as number[],
                );
                const playerArr = state.currentReveal
                  .playerAnswer as number[] | null;
                const playerSet = new Set(playerArr ?? []);
                const revealHasImages = hasImageOptions;
                return (
                  <div
                    className={`solo-reveal-options${
                      revealHasImages ? ' solo-reveal-options--images' : ''
                    }`}
                  >
                    {currentQuestion.options.map((option, idx) => {
                      const isCorrect = correctSet.has(idx);
                      const isSelected = playerSet.has(idx);
                      const imageUrl = revealHasImages
                        ? (currentQuestion.imageOptions ?? [])[idx]
                        : undefined;
                      let optionClass = 'solo-reveal-option';
                      if (imageUrl) optionClass += ' solo-reveal-option--image';
                      if (isCorrect && isSelected) {
                        optionClass += ' solo-reveal-option--correct-selected';
                      } else if (isCorrect && !isSelected) {
                        optionClass += ' solo-reveal-option--correct-missed';
                      } else if (!isCorrect && isSelected) {
                        optionClass += ' solo-reveal-option--wrong-selected';
                      } else {
                        optionClass += ' solo-reveal-option--neutral';
                      }

                      return (
                        <div
                          key={`mc-reveal-${ANSWER_LABELS[idx] ?? idx}`}
                          className={optionClass}
                          style={{
                            animationDelay: `${idx * 0.08}s`,
                            ...(imageUrl
                              ? {
                                  backgroundImage: `url(${imageUrl})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center center',
                                  backgroundRepeat: 'no-repeat',
                                }
                              : {}),
                          }}
                        >
                          {!imageUrl && (
                            <span className="solo-reveal-option-text">
                              {ANSWER_LABELS[idx] ??
                                String.fromCharCode(65 + idx)}
                              . {option}
                            </span>
                          )}
                          {imageUrl && (
                            <span className="solo-reveal-option-letter-badge">
                              {ANSWER_LABELS[idx] ??
                                String.fromCharCode(65 + idx)}
                            </span>
                          )}
                          {isCorrect && isSelected && (
                            <span className="solo-reveal-status solo-reveal-status--correct">
                              {'\u2713'} Correct
                            </span>
                          )}
                          {isCorrect && !isSelected && (
                            <span className="solo-reveal-status solo-reveal-status--missed">
                              Missed
                            </span>
                          )}
                          {!isCorrect && isSelected && (
                            <span className="solo-reveal-status solo-reveal-status--wrong">
                              {'\u2717'} Wrong
                            </span>
                          )}
                          {isCorrect && isSelected && (
                            <span className="solo-reveal-badge solo-reveal-badge--correct-hit">
                              {'\u2713'}
                            </span>
                          )}
                          {isCorrect && !isSelected && (
                            <span className="solo-reveal-badge solo-reveal-badge--correct-miss">
                              !
                            </span>
                          )}
                          {!isCorrect && isSelected && (
                            <span className="solo-reveal-badge solo-reveal-badge--wrong">
                              {'\u2717'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

            {/* Slider reveal: numeric answer comparison */}
            {state.currentReveal.questionType === 'slider' && (
              <div className="solo-slider-reveal">
                <div className="solo-slider-reveal-values">
                  <div className="solo-slider-reveal-item">
                    <span className="solo-slider-reveal-label">
                      Your answer
                    </span>
                    <span className="solo-slider-reveal-value">
                      {state.currentReveal.playerAnswer ?? '\u2014'}
                    </span>
                  </div>
                  <div className="solo-slider-reveal-item">
                    <span className="solo-slider-reveal-label">
                      Correct answer
                    </span>
                    <span className="solo-slider-reveal-value solo-slider-reveal-value--correct">
                      {state.currentReveal.correctAnswer}
                    </span>
                  </div>
                </div>
                {state.currentReveal.closeness !== undefined &&
                  state.currentReveal.closeness > 0 && (
                    <div className="solo-slider-reveal-closeness">
                      Off by {state.currentReveal.closeness} point
                      {state.currentReveal.closeness !== 1 ? 's' : ''}
                    </div>
                  )}
                {state.currentReveal.closeness === 0 && (
                  <div className="solo-slider-reveal-closeness solo-slider-reveal-closeness--perfect">
                    Perfect answer!
                  </div>
                )}
              </div>
            )}

            {/* Points gained */}
            <div
              className={`solo-points-display ${
                state.currentReveal.scoreGained > 0
                  ? 'solo-points-display--positive'
                  : 'solo-points-display--zero'
              }`}
              aria-live="polite"
            >
              {state.currentReveal.scoreGained > 0
                ? `+${state.currentReveal.scoreGained} points!`
                : '0 points'}
            </div>

            {/* Running total */}
            <div className="solo-running-total" aria-label={`Total score: ${state.totalScore.toLocaleString()} points`}>
              Total: {state.totalScore.toLocaleString()} points
            </div>

            {/* Next Question / See Results */}
            <button
              ref={nextBtnRef}
              type="button"
              className="btn btn-primary solo-next-btn"
              onClick={handleNextQuestion}
            >
              {quiz && currentQuestionIndex + 1 >= quiz.questions.length
                ? 'See Results'
                : 'Next Question'}
            </button>
          </div>
        )}

        {/* ── Finished phase ── */}
        {phase === 'finished' && (
          <section className="solo-finished-section" aria-label="Quiz Results">
            <h1 className="solo-final-score">
              {state.totalScore.toLocaleString()} points
            </h1>
            <p className="solo-final-score-label">Your Score</p>

            <button
              type="button"
              className="btn solo-share-result-btn"
              onClick={handleShareResult}
            >
              📤 Share Result
            </button>

            {shareResultCopied && (
              <div className="solo-share-toast">Copied to clipboard!</div>
            )}

            <ol className="solo-results-list" aria-label="Question results">
              {state.questionResults.map((result) => (
                <li
                  key={`result-q${result.questionIndex}`}
                  className={`solo-result-row${
                    result.correct
                      ? ' solo-result-row--correct'
                      : ' solo-result-row--incorrect'
                  }`}
                >
                  <span
                    className={`solo-result-row-status${
                      result.correct
                        ? ' solo-result-row-status--correct'
                        : ' solo-result-row-status--incorrect'
                    }`}
                  >
                    {result.correct ? '\u2713' : '\u2717'}
                  </span>
                  <span className="solo-result-row-question-text">
                    Q{result.questionIndex + 1}: {result.questionText}
                  </span>
                  <span
                    className={`solo-result-row-points${
                      result.scoreGained > 0
                        ? ' solo-result-row-points--positive'
                        : ' solo-result-row-points--zero'
                    }`}
                  >
                    {result.scoreGained > 0
                      ? `+${result.scoreGained.toLocaleString()}`
                      : '0'}
                  </span>
                </li>
              ))}
            </ol>

            <div className="solo-action-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePlayAgain}
              >
                Play Again
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/')}
              >
                Back to Home
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default SoloQuiz;
