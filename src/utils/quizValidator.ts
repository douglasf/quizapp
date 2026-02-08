// Quiz JSON validation for imported quiz files

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_QUESTION_TYPES = ['multiple_choice', 'true_false', 'slider', 'multi_choice'] as const;

interface RawQuestion {
  text?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  correctIndices?: unknown;
  correctValue?: unknown;
  sliderMin?: unknown;
  sliderMax?: unknown;
  timeLimitSeconds?: unknown;
  type?: unknown;
  image?: unknown;
}

const VALID_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/;
const MAX_IMAGE_BYTES = 200 * 1024; // 200 KB per image
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB total (warning only)

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
      } else if (qType === 'multi_choice') {
        // Multi-choice: variable option count (2-8), multiple correct answers
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) {
          errors.push(`Question ${i + 1}: multi-choice must have 2-8 options`);
        } else {
          if (q.options.some((o: unknown) => typeof o !== 'string' || (o as string).trim() === '')) {
            errors.push(`Question ${i + 1}: all options must be non-empty strings`);
          }
        }

        // correctIndices required, must be an array with 1+ elements
        if (!Array.isArray(q.correctIndices) || q.correctIndices.length === 0) {
          errors.push(`Question ${i + 1}: must select at least 1 correct answer`);
        } else {
          const optLen = Array.isArray(q.options) ? q.options.length : 0;
          // All indices must be in bounds
          if (q.correctIndices.some((idx: unknown) => typeof idx !== 'number' || (idx as number) < 0 || (idx as number) >= optLen)) {
            errors.push(`Question ${i + 1}: correctIndices out of bounds`);
          }
          // No duplicates
          if (new Set(q.correctIndices as unknown[]).size !== q.correctIndices.length) {
            errors.push(`Question ${i + 1}: correctIndices must have unique values`);
          }
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

      // Image validation (optional field)
      if (q.image !== undefined && q.image !== null) {
        if (typeof q.image !== 'string') {
          errors.push(`Question ${i + 1}: "image" must be a string (base64 data URL)`);
        } else if (!VALID_IMAGE_DATA_URL_PATTERN.test(q.image)) {
          errors.push(`Question ${i + 1}: "image" must be a valid data URL (data:image/png|jpeg|webp|gif|svg+xml;base64,...)`);
        } else {
          // Estimate actual byte size from base64 string length
          const base64Part = q.image.split(',')[1] ?? '';
          const estimatedBytes = Math.ceil(base64Part.length * 3 / 4);
          if (estimatedBytes > MAX_IMAGE_BYTES) {
            const sizeKB = Math.round(estimatedBytes / 1024);
            errors.push(`Question ${i + 1}: image is too large (${sizeKB} KB). Maximum allowed is ${MAX_IMAGE_BYTES / 1024} KB.`);
          }
        }
      }
    });

    // Check total image size across all questions (warning, not error)
    let totalImageBytes = 0;
    for (const q of (quiz.questions as RawQuestion[])) {
      if (typeof q.image === 'string' && q.image.startsWith('data:image/')) {
        const base64Part = q.image.split(',')[1] ?? '';
        totalImageBytes += Math.ceil(base64Part.length * 3 / 4);
      }
    }
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      const sizeMB = (totalImageBytes / (1024 * 1024)).toFixed(1);
      errors.push(`Total image size (${sizeMB} MB) exceeds recommended limit of ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)} MB. Consider removing or compressing some images.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
