import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Quiz, Question } from '../types/quiz'
import { validateQuiz } from '../utils/quizValidator'
import './QuizCreator.css'

let questionIdCounter = 0;

function createEmptyQuestion(): Question & { _id: number } {
  return {
    _id: ++questionIdCounter,
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
  }
}

// Strip the _id field before saving
function stripIds(questions: (Question & { _id?: number })[]): Question[] {
  return questions.map(({ text, options, correctIndex }) => ({
    text,
    options,
    correctIndex,
  }));
}

type QuestionWithId = Question & { _id: number };

function QuizCreator() {
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<QuestionWithId[]>([createEmptyQuestion()])
  const [errors, setErrors] = useState<string[]>([])
  const errorBoxRef = useRef<HTMLDivElement>(null)

  function updateQuestion(index: number, updated: QuestionWithId) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)))
  }

  function updateQuestionText(index: number, text: string) {
    const q = questions[index]
    updateQuestion(index, { ...q, text })
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    const q = questions[questionIndex]
    const options = [...q.options] as [string, string, string, string]
    options[optionIndex] = value
    updateQuestion(questionIndex, { ...q, options })
  }

  function updateCorrectIndex(questionIndex: number, correctIndex: number) {
    const q = questions[questionIndex]
    updateQuestion(questionIndex, { ...q, correctIndex })
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, createEmptyQuestion()])
  }

  function removeQuestion(index: number) {
    if (questions.length <= 1) return
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    setQuestions((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[target]
      next[target] = temp
      return next
    })
  }

  function handleSave() {
    const quiz: Quiz = {
      title: title.trim(),
      questions: stripIds(questions),
      createdAt: new Date().toISOString(),
    }

    const result = validateQuiz(quiz)
    if (!result.valid) {
      setErrors(result.errors)
      // Scroll to error box
      errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setErrors([])

    // Store quiz in localStorage so the import screen can access it
    localStorage.setItem('quizapp_created_quiz', JSON.stringify(quiz))
    navigate('/import')
  }

  function handleCancel() {
    navigate('/')
  }

  const optionLabels = ['A', 'B', 'C', 'D']

  return (
    <div className="page quiz-creator">
      <div className="creator-container">
        <h1>Create a Quiz</h1>

        {errors.length > 0 && (
          <div className="error-box" role="alert" ref={errorBoxRef}>
            <strong>Please fix the following:</strong>
            <ul>
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Quiz title */}
        <div className="form-group">
          <label htmlFor="quiz-title" className="form-label">
            Quiz Title
          </label>
          <input
            id="quiz-title"
            type="text"
            className="form-input"
            placeholder="e.g. Fun Science Quiz"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Questions */}
        <div className="questions-list">
          {questions.map((q, qIndex) => (
            <div key={q._id} className="question-card">
              <div className="question-header">
                <span className="question-number">Question {qIndex + 1}</span>
                <div className="question-actions">
                  <button
                    type="button"
                    className="btn-icon"
                    title="Move up"
                    disabled={qIndex === 0}
                    onClick={() => moveQuestion(qIndex, -1)}
                    aria-label={`Move question ${qIndex + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Move down"
                    disabled={qIndex === questions.length - 1}
                    onClick={() => moveQuestion(qIndex, 1)}
                    aria-label={`Move question ${qIndex + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    title="Remove question"
                    disabled={questions.length <= 1}
                    onClick={() => removeQuestion(qIndex)}
                    aria-label={`Remove question ${qIndex + 1}`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Question text */}
              <div className="form-group">
                <label htmlFor={`q-${q._id}-text`} className="form-label">
                  Question
                </label>
                <input
                  id={`q-${q._id}-text`}
                  type="text"
                  className="form-input"
                  placeholder="Type your question here..."
                  value={q.text}
                  onChange={(e) => updateQuestionText(qIndex, e.target.value)}
                />
              </div>

              {/* Answer options */}
              <fieldset className="options-group">
                <legend className="form-label">Answer Options</legend>
                {q.options.map((opt, oIndex) => (
                  <div key={`${q._id}-opt-${optionLabels[oIndex]}`} className="option-row">
                    <input
                      type="radio"
                      id={`q-${q._id}-correct-${optionLabels[oIndex]}`}
                      name={`q-${q._id}-correct`}
                      className="option-radio"
                      checked={q.correctIndex === oIndex}
                      onChange={() => updateCorrectIndex(qIndex, oIndex)}
                      aria-label={`Mark option ${optionLabels[oIndex]} as correct`}
                    />
                    <label
                      htmlFor={`q-${q._id}-correct-${optionLabels[oIndex]}`}
                      className="option-label"
                    >
                      {optionLabels[oIndex]}
                    </label>
                    <input
                      type="text"
                      id={`q-${q._id}-opt-${optionLabels[oIndex]}`}
                      className="form-input option-input"
                      placeholder={`Option ${optionLabels[oIndex]}`}
                      value={opt}
                      onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                      aria-label={`Option ${optionLabels[oIndex]} text`}
                    />
                  </div>
                ))}
                <p className="hint">Select the radio button next to the correct answer.</p>
              </fieldset>
            </div>
          ))}
        </div>

        {/* Add question */}
        <button type="button" className="btn btn-secondary add-question-btn" onClick={addQuestion}>
          + Add Question
        </button>

        {/* Action buttons */}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save Quiz
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuizCreator
