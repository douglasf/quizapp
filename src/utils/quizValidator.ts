// Quiz JSON validation for imported quiz files

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface RawQuestion {
  text?: unknown;
  options?: unknown;
  correctIndex?: unknown;
}

export function validateQuiz(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid JSON: expected an object'] };
  }

  const quiz = data as Record<string, unknown>;

  if (typeof quiz.title !== 'string' || quiz.title.trim() === '') {
    errors.push('Quiz must have a non-empty "title" field');
  }

  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push('Quiz must have at least one question');
  } else {
    (quiz.questions as RawQuestion[]).forEach((q, i) => {
      if (typeof q.text !== 'string' || q.text.trim() === '') {
        errors.push(`Question ${i + 1}: must have non-empty "text"`);
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`Question ${i + 1}: must have exactly 4 options`);
      } else if (
        q.options.some((o: unknown) => typeof o !== 'string' || (o as string).trim() === '')
      ) {
        errors.push(`Question ${i + 1}: all options must be non-empty strings`);
      }
      if (
        typeof q.correctIndex !== 'number' ||
        q.correctIndex < 0 ||
        q.correctIndex > 3
      ) {
        errors.push(`Question ${i + 1}: "correctIndex" must be 0, 1, 2, or 3`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
