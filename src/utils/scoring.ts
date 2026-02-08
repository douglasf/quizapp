// Scoring utility — calculates points for each question type

import type { QuestionType } from '../types/quiz';

/**
 * Calculate the score for a player's answer based on question type.
 *
 * - multiple_choice / true_false: binary correct/incorrect with speed bonus (0-1000)
 * - slider: proximity score + speed bonus, averaged (0-1000)
 * - multi_choice (multiple correct answers):
 *     - Base score: (correctCount / correctAnswers.length) * 1000
 *     - Wrong penalty: wrongCount * (1000 / totalOptions) subtracted from base
 *     - Speed bonus: additive (up to +150), rewards fast answers
 *     - Perfect bonus: +200 only if ALL correct AND ZERO wrong
 *     - Floor: 0, Cap: 1500 pts maximum
 *
 * @param questionType  The type of question
 * @param playerAnswer  The player's answer (optionIndex for MC/TF, numeric value for slider, number[] for multi_choice)
 * @param correctAnswer The correct answer (correctIndex for MC/TF, correctValue for slider, number[] for multi_choice)
 * @param elapsedMs     Milliseconds elapsed since question was shown
 * @param timeLimitSeconds  The question's time limit in seconds
 * @param sliderRange   Optional slider range { min, max } — defaults to { min: 0, max: 100 }
 * @returns Score between 0 and 1000 (up to 1500 for multi_choice)
 */
export function calculateScore(
  questionType: QuestionType,
  playerAnswer: number | number[],
  correctAnswer: number | number[],
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

    // Multi-choice (multiple correct answers):
    // - Base score: (correctCount / correctAnswers.length) * 1000
    // - Wrong penalty: wrongCount * (1000 / totalOptions) subtracted directly from base
    // - Speed bonus: additive (up to +150), rewards fast answers
    // - Perfect bonus: +200 only if ALL correct AND ZERO wrong
    // - Floor at 0, cap at 1500
    case 'multi_choice': {
      const playerAnswers = Array.isArray(playerAnswer) ? playerAnswer : [];
      const correctAnswers = Array.isArray(correctAnswer) ? correctAnswer : [];

      if (correctAnswers.length === 0) return 0;

      const correctCount = playerAnswers.filter(idx => correctAnswers.includes(idx)).length;
      const wrongCount = playerAnswers.filter(idx => !correctAnswers.includes(idx)).length;

      // If player selected no correct answers, score is 0
      if (correctCount === 0) return 0;

      // --- Base score: proportional to how many correct answers were found ---
      const baseScore = (correctCount / correctAnswers.length) * 1000;

      // --- Wrong penalty: subtracted directly from base score ---
      // Each wrong answer costs (1000 / totalOptions) points, where totalOptions
      // is the total number of distinct options (union of correct + selected choices)
      const allOptions = new Set([...correctAnswers, ...playerAnswers]);
      const totalOptions = Math.max(allOptions.size, correctAnswers.length + 1);
      const wrongPenalty = wrongCount * (1000 / totalOptions);
      const penalisedBase = baseScore - wrongPenalty;

      // --- Speed bonus: adds UP TO 150 extra points (additive, not multiplicative) ---
      const speedFraction = Math.max(0, 1 - (elapsedMs / timeLimitMs));
      const speedBonus = 150 * speedFraction;

      // --- Perfect bonus: +200 only if ALL correct answers selected AND ZERO wrong ---
      const isPerfect = correctCount === correctAnswers.length && wrongCount === 0;
      const perfectBonus = isPerfect ? 200 : 0;

      // --- Final: penalised base + speed bonus + perfect bonus, floored at 0, capped at 1500 ---
      const finalScore = Math.round(Math.min(1500, penalisedBase + speedBonus + perfectBonus));
      return Math.max(0, finalScore);
    }

    case 'slider': {
      const pAnswer = typeof playerAnswer === 'number' ? playerAnswer : 0;
      const cAnswer = typeof correctAnswer === 'number' ? correctAnswer : 0;
      const distance = Math.abs(pAnswer - cAnswer);
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
 * - multi_choice: all correct answers selected with no wrong ones
 */
export function isAnswerCorrect(
  questionType: QuestionType,
  playerAnswer: number | number[],
  correctAnswer: number | number[],
): boolean {
  switch (questionType) {
    case 'multiple_choice':
    case 'true_false':
      return playerAnswer === correctAnswer;
    case 'multi_choice': {
      const playerAnswers = Array.isArray(playerAnswer) ? playerAnswer : [];
      const correctAnswers = Array.isArray(correctAnswer) ? correctAnswer : [];
      return playerAnswers.length === correctAnswers.length &&
             correctAnswers.every(idx => playerAnswers.includes(idx));
    }
    case 'slider':
      return playerAnswer === correctAnswer;
    default:
      return false;
  }
}
