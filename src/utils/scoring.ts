// Scoring utility — calculates points for each question type

import type { QuestionType } from '../types/quiz';

/**
 * Calculate the score for a player's answer based on question type.
 *
 * - multiple_choice / true_false: binary correct/incorrect with speed bonus (0-1000)
 * - slider: proximity score + speed bonus, averaged (0-1000)
 *
 * @param questionType  The type of question
 * @param playerAnswer  The player's answer (optionIndex for MC/TF, numeric value for slider)
 * @param correctAnswer The correct answer (correctIndex for MC/TF, correctValue for slider)
 * @param elapsedMs     Milliseconds elapsed since question was shown
 * @param timeLimitSeconds  The question's time limit in seconds
 * @param sliderRange   Optional slider range { min, max } — defaults to { min: 0, max: 100 }
 * @returns Score between 0 and 1000
 */
export function calculateScore(
  questionType: QuestionType,
  playerAnswer: number,
  correctAnswer: number,
  elapsedMs: number,
  timeLimitSeconds: number,
  sliderRange?: { min: number; max: number },
): number {
  const timeLimitMs = timeLimitSeconds * 1000;

  switch (questionType) {
    case 'multiple_choice':
    case 'true_false': {
      const isCorrect = playerAnswer === correctAnswer;
      if (!isCorrect) return 0;
      const speedFraction = Math.max(0, 1 - (elapsedMs / timeLimitMs));
      return Math.round(1000 * speedFraction);
    }

    case 'slider': {
      const distance = Math.abs(playerAnswer - correctAnswer);
      const range = sliderRange ? (sliderRange.max - sliderRange.min) : 100;
      // Proximity score: perfect answer (distance 0) = 1000, off by full range = 0
      const proximityFraction = Math.max(0, 1 - (distance / range));
      const proximityScore = Math.round(1000 * proximityFraction);

      // Speed bonus: same formula as MC/TF
      const speedFraction = Math.max(0, 1 - (elapsedMs / timeLimitMs));
      const speedBonus = Math.round(1000 * speedFraction);

      // Combined: average of proximity and speed (both factors matter equally)
      return Math.round((proximityScore + speedBonus) / 2);
    }

    default:
      return 0;
  }
}

/**
 * Determine if the answer is "correct" for display purposes.
 *
 * - MC/TF: exact match
 * - Slider: perfect match (distance === 0)
 */
export function isAnswerCorrect(
  questionType: QuestionType,
  playerAnswer: number,
  correctAnswer: number,
): boolean {
  switch (questionType) {
    case 'multiple_choice':
    case 'true_false':
      return playerAnswer === correctAnswer;
    case 'slider':
      return playerAnswer === correctAnswer;
    default:
      return false;
  }
}
