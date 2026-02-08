// P2P message protocol between host and players

import type { QuestionType } from './quiz';

// Player -> Host messages
export type PlayerMessage =
  | { type: 'join'; name: string }
  | { type: 'rejoin'; name: string }
  | { type: 'get_state'; name: string }
  | { type: 'answer'; questionIndex: number; answer: number; answeredAt?: number }
  | { type: 'ping' };

// Host -> Player messages
export type HostMessage =
  | { type: 'welcome'; playerName: string; gameCode: string }
  | { type: 'rejoin_success'; playerName: string; gameCode: string; score: number; currentQuestionIndex: number; phase: string }
  | { type: 'game_state'; phase: string; currentQuestionIndex: number; score: number; standings?: { name: string; score: number; rank: number }[] }
  | { type: 'player_list'; players: { name: string; connected: boolean }[] }
  | { type: 'question'; index: number; total: number; text: string; options: [string, string, string, string]; timeLimitSeconds: number; questionType: QuestionType; sliderMin?: number; sliderMax?: number }
  | { type: 'answer_ack'; questionIndex: number }
  | {
      type: 'answer_reveal';
      questionIndex: number;
      questionType: QuestionType;
      correctAnswer: number; // correctIndex for MC/TF, correctValue for slider
      yourAnswer: number | null;
      correct: boolean;
      scoreGained: number;
      closeness?: number; // distance from correct answer (slider only)
    }
  | { type: 'answer_summary'; results: { name: string; correct: boolean; scoreGained: number }[] }
  | { type: 'game_over'; standings: { name: string; score: number; rank: number }[] }
  | { type: 'play_again' }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export type Message = PlayerMessage | HostMessage;
