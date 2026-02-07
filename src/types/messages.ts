// P2P message protocol between host and players

// Player -> Host messages
export type PlayerMessage =
  | { type: 'join'; name: string }
  | { type: 'rejoin'; name: string }
  | { type: 'get_state'; name: string }
  | { type: 'answer'; questionIndex: number; optionIndex: number }
  | { type: 'ping' };

// Host -> Player messages
export type HostMessage =
  | { type: 'welcome'; playerName: string; gameCode: string }
  | { type: 'rejoin_success'; playerName: string; gameCode: string; score: number; currentQuestionIndex: number; phase: string }
  | { type: 'game_state'; phase: string; currentQuestionIndex: number; score: number; standings?: { name: string; score: number; rank: number }[] }
  | { type: 'player_list'; players: { name: string; connected: boolean }[] }
  | { type: 'question'; index: number; total: number; text: string; options: [string, string, string, string] }
  | { type: 'answer_ack'; questionIndex: number }
  | { type: 'answer_reveal'; questionIndex: number; correctIndex: number; yourAnswer: number | null; correct: boolean; scoreGained: number }
  | { type: 'answer_summary'; results: { name: string; correct: boolean; scoreGained: number }[] }
  | { type: 'game_over'; standings: { name: string; score: number; rank: number }[] }
  | { type: 'play_again' }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export type Message = PlayerMessage | HostMessage;
