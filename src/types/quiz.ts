// Quiz data structures for export/import

export type QuestionType = 'multiple_choice' | 'true_false' | 'slider';

export interface Quiz {
  title: string;
  questions: Question[];
  createdAt?: string;
}

export interface Question {
  text: string;
  options: [string, string, string, string];
  correctIndex: number; // 0-3
  correctValue?: number; // used for slider questions (must be within sliderMin–sliderMax)
  sliderMin?: number; // minimum slider value (defaults to 0)
  sliderMax?: number; // maximum slider value (defaults to 100)
  timeLimitSeconds?: number; // 5-120 seconds; defaults to 30 if omitted
  type?: QuestionType; // defaults to 'multiple_choice' when omitted
}

/** Default time limit when a question doesn't specify one */
export const DEFAULT_TIME_LIMIT_SECONDS = 30;
