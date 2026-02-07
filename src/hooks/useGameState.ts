// Game state management hook — drives the host-side quiz flow using a reducer pattern.
//
// This hook ONLY manages phase transitions and quiz metadata.
// All player data, answer tracking, and scores are managed by useHost.

import { useReducer, useCallback } from 'react';
import type { Quiz } from '../types/quiz';
import type { GamePhase } from '../types/game';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface GameState {
  phase: GamePhase;
  quiz: Quiz | null;
  gameCode: string;
  currentQuestionIndex: number;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type GameAction =
  | { type: 'INIT_GAME'; quiz: Quiz; gameCode: string }
  | { type: 'START_QUIZ' }
  | { type: 'REVEAL_ANSWER' }
  | { type: 'SHOW_ANSWER_SUMMARY' }
  | { type: 'NEXT_QUESTION' }
  | { type: 'FINISH_GAME' };

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function createInitialState(): GameState {
  return {
    phase: 'lobby',
    quiz: null,
    gameCode: '',
    currentQuestionIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'INIT_GAME': {
      return {
        phase: 'lobby',
        quiz: action.quiz,
        gameCode: action.gameCode,
        currentQuestionIndex: 0,
      };
    }

    case 'START_QUIZ': {
      if (state.phase !== 'lobby') return state;
      if (!state.quiz || state.quiz.questions.length === 0) return state;

      return {
        ...state,
        phase: 'question',
        currentQuestionIndex: 0,
      };
    }

    case 'REVEAL_ANSWER': {
      if (state.phase !== 'question') return state;
      return { ...state, phase: 'answer_reveal' };
    }

    case 'SHOW_ANSWER_SUMMARY': {
      if (state.phase !== 'answer_reveal') return state;
      return { ...state, phase: 'answer_summary' };
    }

    case 'NEXT_QUESTION': {
      if (state.phase !== 'answer_summary') return state;
      if (!state.quiz) return state;

      const nextIndex = state.currentQuestionIndex + 1;

      if (nextIndex >= state.quiz.questions.length) {
        return {
          ...state,
          phase: 'finished',
          currentQuestionIndex: nextIndex,
        };
      }

      return {
        ...state,
        phase: 'question',
        currentQuestionIndex: nextIndex,
      };
    }

    case 'FINISH_GAME': {
      return { ...state, phase: 'finished' };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseGameStateReturn {
  state: GameState;

  // Derived helpers
  getCorrectAnswerIndex: () => number | null;

  // Convenience action dispatchers
  initGame: (quiz: Quiz, gameCode: string) => void;
  startQuiz: () => void;
  revealAnswer: () => void;
  showAnswerSummary: () => void;
  nextQuestion: () => void;
  finishGame: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGameState(): UseGameStateReturn {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  const getCorrectAnswerIndex = useCallback((): number | null => {
    if (!state.quiz || state.currentQuestionIndex >= state.quiz.questions.length) return null;
    return state.quiz.questions[state.currentQuestionIndex].correctIndex;
  }, [state.quiz, state.currentQuestionIndex]);

  const initGame = useCallback(
    (quiz: Quiz, gameCode: string) => {
      dispatch({ type: 'INIT_GAME', quiz, gameCode });
    },
    [],
  );

  const startQuiz = useCallback(() => {
    dispatch({ type: 'START_QUIZ' });
  }, []);

  const revealAnswer = useCallback(() => {
    dispatch({ type: 'REVEAL_ANSWER' });
  }, []);

  const showAnswerSummary = useCallback(() => {
    dispatch({ type: 'SHOW_ANSWER_SUMMARY' });
  }, []);

  const nextQuestion = useCallback(() => {
    dispatch({ type: 'NEXT_QUESTION' });
  }, []);

  const finishGame = useCallback(() => {
    dispatch({ type: 'FINISH_GAME' });
  }, []);

  return {
    state,
    getCorrectAnswerIndex,
    initGame,
    startQuiz,
    revealAnswer,
    showAnswerSummary,
    nextQuestion,
    finishGame,
  };
}
