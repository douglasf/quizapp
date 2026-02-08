import type { QuestionType } from './quiz';

// Game state and player structures

export interface Player {
  peerId: string;
  name: string;
  score: number;
  connected: boolean;
  answeredQuestions: Set<number>;
}

export type GamePhase = 'lobby' | 'question' | 'answer_reveal' | 'answer_summary' | 'finished';

export interface AnswerSummaryResult {
  name: string;
  correct: boolean;
  scoreGained: number;
  /** For slider questions: the player's numeric answer (undefined if they didn't answer) */
  playerAnswer?: number;
  /** For slider questions: distance from correct answer */
  closeness?: number;
}

// Player-side minimal state
export interface PlayerState {
  phase: 'joining' | 'waiting' | 'answering' | 'answered' | 'viewing_results';
  connectionStatus: 'connected' | 'reconnecting' | 'failed';
  reconnectAttempts: number;
  playerName: string;
  gameCode: string;
  currentQuestion: PlayerQuestion | null;
  selectedAnswer: number | null;
  score: number;
  standings: PlayerStanding[];
}

export interface PlayerQuestion {
  index: number;
  total: number;
  text: string;
  options: [string, string, string, string];
  timeLimitSeconds: number;
  questionType: QuestionType;
  sliderMin?: number; // minimum slider value (defaults to 0)
  sliderMax?: number; // maximum slider value (defaults to 100)
}

export interface PlayerStanding {
  name: string;
  score: number;
  rank: number;
}
