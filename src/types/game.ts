// Game state and player structures

export interface Player {
  peerId: string;
  name: string;
  score: number;
  connected: boolean;
  answeredQuestions: Set<number>;
}

export type GamePhase = 'lobby' | 'question' | 'answer_reveal' | 'scoreboard' | 'finished';

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
}

export interface PlayerStanding {
  name: string;
  score: number;
  rank: number;
}
