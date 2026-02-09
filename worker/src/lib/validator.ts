/**
 * Server-side quiz validation.
 *
 * Ported from the frontend `src/utils/quizValidator.ts`, simplified to focus
 * on data integrity rather than user-facing import UX.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "slider",
  "multi_choice",
] as const;

type QuestionType = (typeof VALID_QUESTION_TYPES)[number];

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
  imageOptions?: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/;
const VALID_IMAGE_URL = /^https:\/\/.+/;
const MAX_IMAGE_BYTES = 200 * 1024; // 200 KB per image
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB total
const MAX_QUESTIONS = 200;
const MAX_TITLE_LENGTH = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveType(raw: unknown): QuestionType {
  if (
    typeof raw === "string" &&
    (VALID_QUESTION_TYPES as readonly string[]).includes(raw)
  ) {
    return raw as QuestionType;
  }
  return "multiple_choice";
}

function estimateBase64Bytes(dataUrl: string): number {
  const base64Part = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64Part.length * 3) / 4);
}

function validateImageUrl(
  value: string,
  label: string,
  errors: string[],
): number {
  if (value.startsWith("data:")) {
    if (!VALID_IMAGE_DATA_URL.test(value)) {
      errors.push(
        `${label}: invalid data URL (must be data:image/png|jpeg|webp|gif|svg+xml;base64,...)`,
      );
      return 0;
    }
    const bytes = estimateBase64Bytes(value);
    if (bytes > MAX_IMAGE_BYTES) {
      errors.push(
        `${label}: image too large (${Math.round(bytes / 1024)} KB, max ${MAX_IMAGE_BYTES / 1024} KB)`,
      );
    }
    return bytes;
  }

  if (value.startsWith("https://")) {
    if (!VALID_IMAGE_URL.test(value)) {
      errors.push(`${label}: invalid HTTPS URL`);
    }
    return 0; // external URLs don't count toward size budget
  }

  errors.push(`${label}: must be a data URL or HTTPS URL`);
  return 0;
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

/**
 * Validate a quiz payload for storage in D1.
 *
 * Returns `{ valid: true, errors: [] }` when the data is acceptable.
 */
export function validateQuiz(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Expected a JSON object"] };
  }

  const quiz = data as Record<string, unknown>;

  // ---- Title ----
  if (typeof quiz.title !== "string" || quiz.title.trim() === "") {
    errors.push('Quiz must have a non-empty "title"');
  } else if (quiz.title.length > MAX_TITLE_LENGTH) {
    errors.push(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  }

  // ---- Questions ----
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push("Quiz must have at least one question");
    return { valid: false, errors };
  }

  if (quiz.questions.length > MAX_QUESTIONS) {
    errors.push(`Quiz can have at most ${MAX_QUESTIONS} questions`);
    return { valid: false, errors };
  }

  let totalImageBytes = 0;

  (quiz.questions as RawQuestion[]).forEach((q, i) => {
    const label = `Question ${i + 1}`;

    // ---- text ----
    if (typeof q.text !== "string" || q.text.trim() === "") {
      errors.push(`${label}: must have non-empty "text"`);
    }

    // ---- type ----
    const qType = resolveType(q.type);

    if (
      q.type !== undefined &&
      q.type !== null &&
      qType === "multiple_choice" &&
      q.type !== "multiple_choice"
    ) {
      errors.push(
        `${label}: invalid type "${String(q.type)}" (allowed: ${VALID_QUESTION_TYPES.join(", ")})`,
      );
    }

    // ---- type-specific validation ----
    if (qType === "multiple_choice") {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`${label}: must have exactly 4 options`);
      } else if (
        q.options.some(
          (o: unknown) => typeof o !== "string" || (o as string).trim() === "",
        )
      ) {
        errors.push(`${label}: all options must be non-empty strings`);
      }
      if (
        typeof q.correctIndex !== "number" ||
        q.correctIndex < 0 ||
        q.correctIndex > 3
      ) {
        errors.push(`${label}: "correctIndex" must be 0-3`);
      }
    } else if (qType === "true_false") {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(`${label}: must have at least 2 options`);
      } else {
        const tfOpts = q.options.slice(0, 2);
        if (
          tfOpts.some(
            (o: unknown) =>
              typeof o !== "string" || (o as string).trim() === "",
          )
        ) {
          errors.push(`${label}: first two options must be non-empty strings`);
        }
      }
      if (
        typeof q.correctIndex !== "number" ||
        q.correctIndex < 0 ||
        q.correctIndex > 1
      ) {
        errors.push(`${label}: "correctIndex" must be 0 or 1 for true/false`);
      }
    } else if (qType === "slider") {
      const sMin =
        typeof q.sliderMin === "number" ? q.sliderMin : 0;
      const sMax =
        typeof q.sliderMax === "number" ? q.sliderMax : 100;

      if (q.sliderMin != null && typeof q.sliderMin !== "number") {
        errors.push(`${label}: "sliderMin" must be a number`);
      }
      if (q.sliderMax != null && typeof q.sliderMax !== "number") {
        errors.push(`${label}: "sliderMax" must be a number`);
      }
      if (sMin >= sMax) {
        errors.push(
          `${label}: "sliderMin" (${sMin}) must be less than "sliderMax" (${sMax})`,
        );
      }
      if (q.correctValue == null) {
        errors.push(
          `${label}: slider questions require "correctValue" (${sMin}-${sMax})`,
        );
      } else if (
        typeof q.correctValue !== "number" ||
        q.correctValue < sMin ||
        q.correctValue > sMax
      ) {
        errors.push(
          `${label}: "correctValue" must be a number between ${sMin} and ${sMax}`,
        );
      }
    } else if (qType === "multi_choice") {
      if (
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.length > 8
      ) {
        errors.push(`${label}: multi-choice must have 2-8 options`);
      } else if (
        q.options.some(
          (o: unknown) => typeof o !== "string" || (o as string).trim() === "",
        )
      ) {
        errors.push(`${label}: all options must be non-empty strings`);
      }

      if (!Array.isArray(q.correctIndices) || q.correctIndices.length === 0) {
        errors.push(`${label}: must select at least 1 correct answer`);
      } else {
        const optLen = Array.isArray(q.options) ? q.options.length : 0;
        if (
          q.correctIndices.some(
            (idx: unknown) =>
              typeof idx !== "number" ||
              (idx as number) < 0 ||
              (idx as number) >= optLen,
          )
        ) {
          errors.push(`${label}: correctIndices out of bounds`);
        }
        if (
          new Set(q.correctIndices as unknown[]).size !==
          q.correctIndices.length
        ) {
          errors.push(`${label}: correctIndices must have unique values`);
        }
      }
    }

    // ---- timeLimitSeconds ----
    if (
      q.timeLimitSeconds != null &&
      (typeof q.timeLimitSeconds !== "number" ||
        q.timeLimitSeconds < 5 ||
        q.timeLimitSeconds > 120)
    ) {
      errors.push(`${label}: "timeLimitSeconds" must be between 5 and 120`);
    }

    // ---- image ----
    if (q.image != null) {
      if (typeof q.image !== "string") {
        errors.push(`${label}: "image" must be a string`);
      } else {
        totalImageBytes += validateImageUrl(
          q.image,
          `${label} image`,
          errors,
        );
      }
    }

    // ---- imageOptions ----
    if (q.imageOptions != null) {
      if (!Array.isArray(q.imageOptions)) {
        errors.push(`${label}: "imageOptions" must be an array`);
      } else {
        const optLen = Array.isArray(q.options) ? q.options.length : 0;
        if (q.imageOptions.length !== optLen) {
          errors.push(
            `${label}: "imageOptions" length (${q.imageOptions.length}) must match "options" length (${optLen})`,
          );
        }
        (q.imageOptions as unknown[]).forEach((img: unknown, j: number) => {
          if (typeof img !== "string") {
            errors.push(`${label}, imageOptions[${j}]: must be a string`);
          } else {
            totalImageBytes += validateImageUrl(
              img as string,
              `${label}, imageOptions[${j}]`,
              errors,
            );
          }
        });
      }
    }
  });

  // ---- Total image budget ----
  if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
    const sizeMB = (totalImageBytes / (1024 * 1024)).toFixed(1);
    errors.push(
      `Total image size (${sizeMB} MB) exceeds ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)} MB limit`,
    );
  }

  return { valid: errors.length === 0, errors };
}
