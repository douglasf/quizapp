// Quiz data structures for export/import

export interface Quiz {
  title: string;
  questions: Question[];
  createdAt?: string;
}

export interface Question {
  text: string;
  options: [string, string, string, string];
  correctIndex: number; // 0-3
}
