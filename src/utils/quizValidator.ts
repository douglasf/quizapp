// Quiz JSON validation for imported quiz files

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_QUESTION_TYPES = ['multiple_choice', 'true_false', 'slider'] as const;

interface RawQuestion {
  text?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  correctValue?: unknown;
  sliderMin?: unknown;
  sliderMax?: unknown;
  timeLimitSeconds?: unknown;
  type?: unknown;
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

      // Resolve question type (default to 'multiple_choice' for backward compat)
      const qType =
        typeof q.type === 'string' && (VALID_QUESTION_TYPES as readonly string[]).includes(q.type)
          ? q.type
          : 'multiple_choice';

      if (q.type !== undefined && q.type !== null && qType === 'multiple_choice' && q.type !== 'multiple_choice') {
        errors.push(
          `Question ${i + 1}: invalid "type" value "${String(q.type)}" (must be one of: ${VALID_QUESTION_TYPES.join(', ')})`
        );
      }

      // Type-specific option/answer validation
      if (qType === 'multiple_choice') {
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
      } else if (qType === 'true_false') {
        // True/false questions need at least 2 non-empty options (A and B).
        // The options array may be 2 or 4 elements (4-element for backward compat).
        // Expected values: options[0] = "False", options[1] = "True"
        if (!Array.isArray(q.options) || q.options.length < 2) {
          errors.push(`Question ${i + 1}: must have at least 2 options`);
        } else {
          // Only validate the first 2 options
          const tfOptions = q.options.slice(0, 2);
          if (
            tfOptions.some((o: unknown) => typeof o !== 'string' || (o as string).trim() === '')
          ) {
            errors.push(`Question ${i + 1}: options must be ["False", "True"]`);
          }
        }
        if (
          typeof q.correctIndex !== 'number' ||
          q.correctIndex < 0 ||
          q.correctIndex > 1
        ) {
          errors.push(`Question ${i + 1}: "correctIndex" must be 0 or 1 for true/false`);
        }
      } else if (qType === 'slider') {
        // Slider questions use correctValue within [sliderMin, sliderMax] instead of options/correctIndex.
        // Options array is still present for backward compat but not validated.
        const sMin = (q.sliderMin !== undefined && q.sliderMin !== null && typeof q.sliderMin === 'number') ? q.sliderMin : 0;
        const sMax = (q.sliderMax !== undefined && q.sliderMax !== null && typeof q.sliderMax === 'number') ? q.sliderMax : 100;

        // Validate sliderMin if provided
        if (q.sliderMin !== undefined && q.sliderMin !== null && typeof q.sliderMin !== 'number') {
          errors.push(`Question ${i + 1}: "sliderMin" must be a number`);
        }
        // Validate sliderMax if provided
        if (q.sliderMax !== undefined && q.sliderMax !== null && typeof q.sliderMax !== 'number') {
          errors.push(`Question ${i + 1}: "sliderMax" must be a number`);
        }
        // Enforce min < max
        if (sMin >= sMax) {
          errors.push(`Question ${i + 1}: "sliderMin" (${sMin}) must be less than "sliderMax" (${sMax})`);
        }

        if (q.correctValue === undefined || q.correctValue === null) {
          errors.push(`Question ${i + 1}: slider questions require a "correctValue" (${sMin}-${sMax})`);
        } else if (
          typeof q.correctValue !== 'number' ||
          q.correctValue < sMin ||
          q.correctValue > sMax
        ) {
          errors.push(`Question ${i + 1}: "correctValue" must be a number between ${sMin} and ${sMax}`);
        }
      }

      if (
        q.timeLimitSeconds !== undefined &&
        q.timeLimitSeconds !== null &&
        (typeof q.timeLimitSeconds !== 'number' ||
          q.timeLimitSeconds < 5 ||
          q.timeLimitSeconds > 120)
      ) {
        errors.push(`Question ${i + 1}: "timeLimitSeconds" must be between 5 and 120`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
