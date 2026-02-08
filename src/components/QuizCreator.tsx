import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Quiz, Question, QuestionType } from '../types/quiz'
import { DEFAULT_TIME_LIMIT_SECONDS } from '../types/quiz'
import { validateQuiz } from '../utils/quizValidator'
import './QuizCreator.css'

let questionIdCounter = 0;

function createEmptyQuestion(questionType: QuestionType = 'multiple_choice'): Question & { _id: number } {
  const base = {
    _id: ++questionIdCounter,
    text: '',
    correctValue: 50,
    sliderMin: 0,
    sliderMax: 100,
    timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
  };

  if (questionType === 'multi_choice') {
    return {
      ...base,
      options: ['', ''],
      correctIndex: 0,
      correctIndices: [],
      type: 'multi_choice',
    };
  }

  return {
    ...base,
    options: ['', '', '', ''],
    correctIndex: 0,
    type: questionType,
  };
}

// Strip the _id field before saving, and clean up type-specific fields
function stripIds(questions: (Question & { _id?: number })[]): Question[] {
  return questions.map(q => {
    const qType = q.type ?? 'multiple_choice';
    const base = {
      text: q.text,
      timeLimitSeconds: q.timeLimitSeconds,
      type: q.type,
      ...(q.image ? { image: q.image } : {}),
    };

    if (qType === 'slider') {
      // Slider questions don't use options/correctIndex — provide sensible defaults
      return {
        ...base,
        options: ['', '', '', ''],
        correctIndex: 0,
        correctValue: q.correctValue ?? 50,
        sliderMin: q.sliderMin ?? 0,
        sliderMax: q.sliderMax ?? 100,
      };
    }

    if (qType === 'multi_choice') {
      return {
        ...base,
        options: q.options,
        correctIndex: 0,
        correctIndices: q.correctIndices ?? [],
      };
    }

    return {
      ...base,
      options: q.options,
      correctIndex: q.correctIndex,
      ...(q.correctValue !== undefined ? { correctValue: q.correctValue } : {}),
    };
  });
}

type QuestionWithId = Question & { _id: number };

const COMPRESS_THRESHOLD = 100 * 1024; // 100 KB — only compress files larger than this

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;

      // If file is small enough, skip compression
      if (file.size <= COMPRESS_THRESHOLD) {
        resolve(rawDataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        // Try WebP first, fall back to JPEG
        const webpUrl = canvas.toDataURL('image/webp', 0.65);
        const jpegUrl = canvas.toDataURL('image/jpeg', 0.70);
        // Use whichever is smaller, or WebP if roughly equal
        resolve(webpUrl.length <= jpegUrl.length ? webpUrl : jpegUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = rawDataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function QuizCreator() {
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<QuestionWithId[]>([createEmptyQuestion()])
  const [errors, setErrors] = useState<string[]>([])
  const errorBoxRef = useRef<HTMLDivElement>(null)

  // Draft string states: allow users to fully clear numeric inputs while typing.
  // null = no active draft (show model value), '' = user cleared the field.
  const [draftSliderMin, setDraftSliderMin] = useState<string | null>(null)
  const [draftSliderMax, setDraftSliderMax] = useState<string | null>(null)
  const [draftCorrectValue, setDraftCorrectValue] = useState<string | null>(null)
  const [draftTimeLimit, setDraftTimeLimit] = useState<string | null>(null)

  // "Dirty" flags: track whether the user actually typed into a focused field.
  // Prevents focus-then-blur (without typing) from resetting to a default value.
  const [editedSliderMin, setEditedSliderMin] = useState(false)
  const [editedSliderMax, setEditedSliderMax] = useState(false)
  const [editedCorrectValue, setEditedCorrectValue] = useState(false)
  const [editedTimeLimit, setEditedTimeLimit] = useState(false)

  // Image upload state: tracks which question is currently compressing
  const [compressingImage, setCompressingImage] = useState<number | null>(null)

  function updateQuestion(index: number, updated: QuestionWithId) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)))
  }

  function updateQuestionText(index: number, text: string) {
    const q = questions[index]
    updateQuestion(index, { ...q, text })
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    const q = questions[questionIndex]
    const options = [...q.options]
    options[optionIndex] = value
    updateQuestion(questionIndex, { ...q, options })
  }

  function updateCorrectIndex(questionIndex: number, correctIndex: number) {
    const q = questions[questionIndex]
    updateQuestion(questionIndex, { ...q, correctIndex })
  }

  function updateTimeLimitSeconds(index: number, value: number) {
    const q = questions[index]
    updateQuestion(index, { ...q, timeLimitSeconds: value })
  }

  function updateQuestionType(index: number, type: QuestionType) {
    const q = questions[index]
    // When switching types, reset answer-related fields appropriately
    let updated = { ...q, type }
    if (type === 'true_false') {
      // Clamp correctIndex to 0 or 1 and auto-populate hardcoded options
      updated = {
        ...updated,
        correctIndex: Math.min(q.correctIndex, 1),
        options: ['False', 'True', '', ''],
      }
    } else if (type === 'slider') {
      // Ensure correctValue and slider range have defaults
      const sMin = q.sliderMin ?? 0
      const sMax = q.sliderMax ?? 100
      const mid = Math.round((sMin + sMax) / 2)
      updated = { ...updated, correctValue: q.correctValue ?? mid, sliderMin: sMin, sliderMax: sMax }
    } else if (type === 'multi_choice') {
      // Initialize with 2 empty options and empty correctIndices
      updated = {
        ...updated,
        options: ['', ''],
        correctIndices: [],
        correctIndex: 0,
      }
    } else if (type === 'multiple_choice') {
      // Switching back to MC: ensure 4 options
      const opts = [...q.options]
      while (opts.length < 4) opts.push('')
      updated = {
        ...updated,
        options: opts.slice(0, 4),
        correctIndex: q.correctIndex < 4 ? q.correctIndex : 0,
      }
    }
    updateQuestion(index, updated)
  }

  function updateCorrectValue(index: number, value: number) {
    const q = questions[index]
    updateQuestion(index, { ...q, correctValue: value })
  }

  function toggleCorrectIndex(questionIndex: number, optionIndex: number) {
    const q = questions[questionIndex]
    const current = q.correctIndices ?? []
    const updated = current.includes(optionIndex)
      ? current.filter(idx => idx !== optionIndex)
      : [...current, optionIndex]
    updateQuestion(questionIndex, { ...q, correctIndices: updated })
  }

  function addOption(questionIndex: number) {
    const q = questions[questionIndex]
    if (q.options.length >= 8) return // max 8 options
    const newOptions = [...q.options, '']
    updateQuestion(questionIndex, { ...q, options: newOptions })
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    const q = questions[questionIndex]
    if (q.options.length <= 2) return // min 2 options
    const newOptions = q.options.filter((_, idx) => idx !== optionIndex)
    // Clean up correctIndices: remove deleted index, shift indices above it
    let correctIndices = q.correctIndices ?? []
    correctIndices = correctIndices
      .filter(idx => idx !== optionIndex)
      .map(idx => idx > optionIndex ? idx - 1 : idx)
    updateQuestion(questionIndex, { ...q, options: newOptions, correctIndices })
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

  async function handleImageUpload(index: number, file: File) {
    const isLarge = file.size > COMPRESS_THRESHOLD
    if (isLarge) setCompressingImage(index)
    try {
      const dataUrl = await compressImage(file)
      const q = questions[index]
      updateQuestion(index, { ...q, image: dataUrl })
    } catch {
      // Silently fail — could show error but keeping UX simple
    } finally {
      if (isLarge) setCompressingImage(null)
    }
  }

  function removeImage(index: number) {
    const q = questions[index]
    updateQuestion(index, { ...q, image: undefined })
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
    try {
      localStorage.setItem('quizapp_created_quiz', JSON.stringify(quiz))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setErrors(['Quiz is too large to save locally. Please remove some images or simplify the quiz.'])
        errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      throw err
    }
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

              {/* Question image upload */}
              <div className="image-input-group">
                <label htmlFor={`q-${q._id}-image`} className="form-label">
                  Image (optional)
                </label>
                {q.image ? (
                  <div className="image-preview-row">
                    <img
                      src={q.image}
                      alt={`Question ${qIndex + 1} preview`}
                      className="image-preview-thumbnail"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-remove-image"
                      onClick={() => removeImage(qIndex)}
                    >
                      Remove image
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      id={`q-${q._id}-image`}
                      type="file"
                      accept="image/*"
                      className="file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleImageUpload(qIndex, file)
                        // Reset so the same file can be re-selected
                        e.target.value = ''
                      }}
                    />
                    {compressingImage === qIndex && (
                      <p className="hint">Compressing image...</p>
                    )}
                  </>
                )}
              </div>

              {/* Question type selector */}
              <div className="form-group">
                <label htmlFor={`q-${q._id}-type`} className="form-label">
                  Question Type
                </label>
                <select
                  id={`q-${q._id}-type`}
                  className="form-input"
                  value={q.type ?? 'multiple_choice'}
                  onChange={(e) => updateQuestionType(qIndex, e.target.value as QuestionType)}
                >
                  <option value="multiple_choice">Choice (4 options)</option>
                  <option value="multi_choice">Multi-Choice (multiple answers)</option>
                  <option value="true_false">True / False (2 options)</option>
                  <option value="slider">Slider (numeric range)</option>
                </select>
              </div>

              {/* Answer options — conditional on question type */}
              {(q.type ?? 'multiple_choice') === 'slider' ? (
                /* Slider: min, max, and correct answer inputs */
                <div className="slider-config-group">
                  <div className="form-group">
                    <label htmlFor={`q-${q._id}-sliderMin`} className="form-label">
                      Min Value
                    </label>
                    <input
                      id={`q-${q._id}-sliderMin`}
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      value={draftSliderMin !== null ? draftSliderMin : String(q.sliderMin ?? 0)}
                      onFocus={() => {
                        setDraftSliderMin('')
                        setEditedSliderMin(false)
                      }}
                      onChange={(e) => {
                        setDraftSliderMin(e.target.value)
                        setEditedSliderMin(true)
                      }}
                      onBlur={(e) => {
                        if (!editedSliderMin) {
                          setDraftSliderMin(null)
                          setEditedSliderMin(false)
                          return
                        }
                        const inputVal = e.target.value.trim()
                        if (inputVal === '') {
                          setDraftSliderMin(null)
                          setEditedSliderMin(false)
                          const newMin = 0
                          const newMax = q.sliderMax ?? 100
                          let cv = q.correctValue ?? Math.round((newMin + newMax) / 2)
                          if (cv < newMin) cv = newMin
                          if (cv > newMax) cv = newMax
                          updateQuestion(qIndex, { ...q, sliderMin: newMin, correctValue: cv })
                        } else {
                          const val = Number.parseInt(inputVal, 10)
                          if (!Number.isNaN(val)) {
                            setDraftSliderMin(null)
                            setEditedSliderMin(false)
                            const newMin = val
                            const newMax = q.sliderMax ?? 100
                            let cv = q.correctValue ?? Math.round((newMin + newMax) / 2)
                            if (cv < newMin) cv = newMin
                            if (cv > newMax) cv = newMax
                            updateQuestion(qIndex, { ...q, sliderMin: newMin, correctValue: cv })
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`q-${q._id}-sliderMax`} className="form-label">
                      Max Value
                    </label>
                    <input
                      id={`q-${q._id}-sliderMax`}
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      value={draftSliderMax !== null ? draftSliderMax : String(q.sliderMax ?? 100)}
                      onFocus={() => {
                        setDraftSliderMax('')
                        setEditedSliderMax(false)
                      }}
                      onChange={(e) => {
                        setDraftSliderMax(e.target.value)
                        setEditedSliderMax(true)
                      }}
                      onBlur={(e) => {
                        if (!editedSliderMax) {
                          setDraftSliderMax(null)
                          setEditedSliderMax(false)
                          return
                        }
                        const inputVal = e.target.value.trim()
                        if (inputVal === '') {
                          setDraftSliderMax(null)
                          setEditedSliderMax(false)
                          const newMax = 100
                          const newMin = q.sliderMin ?? 0
                          let cv = q.correctValue ?? Math.round((newMin + newMax) / 2)
                          if (cv < newMin) cv = newMin
                          if (cv > newMax) cv = newMax
                          updateQuestion(qIndex, { ...q, sliderMax: newMax, correctValue: cv })
                        } else {
                          const val = Number.parseInt(inputVal, 10)
                          if (!Number.isNaN(val)) {
                            setDraftSliderMax(null)
                            setEditedSliderMax(false)
                            const newMax = val
                            const newMin = q.sliderMin ?? 0
                            let cv = q.correctValue ?? Math.round((newMin + newMax) / 2)
                            if (cv < newMin) cv = newMin
                            if (cv > newMax) cv = newMax
                            updateQuestion(qIndex, { ...q, sliderMax: newMax, correctValue: cv })
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`q-${q._id}-correctValue`} className="form-label">
                      Correct Answer
                    </label>
                    <input
                      id={`q-${q._id}-correctValue`}
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      value={draftCorrectValue !== null ? draftCorrectValue : String(q.correctValue ?? Math.round(((q.sliderMin ?? 0) + (q.sliderMax ?? 100)) / 2))}
                      onFocus={() => {
                        setDraftCorrectValue('')
                        setEditedCorrectValue(false)
                      }}
                      onChange={(e) => {
                        setDraftCorrectValue(e.target.value)
                        setEditedCorrectValue(true)
                      }}
                      onBlur={(e) => {
                        if (!editedCorrectValue) {
                          setDraftCorrectValue(null)
                          setEditedCorrectValue(false)
                          return
                        }
                        const sMin = q.sliderMin ?? 0
                        const sMax = q.sliderMax ?? 100
                        const defaultVal = Math.round((sMin + sMax) / 2)
                        const inputVal = e.target.value.trim()
                        if (inputVal === '') {
                          setDraftCorrectValue(null)
                          setEditedCorrectValue(false)
                          updateCorrectValue(qIndex, defaultVal)
                        } else {
                          const val = Number.parseInt(inputVal, 10)
                          if (!Number.isNaN(val)) {
                            setDraftCorrectValue(null)
                            setEditedCorrectValue(false)
                            let cv = val
                            if (cv < sMin) cv = sMin
                            if (cv > sMax) cv = sMax
                            updateCorrectValue(qIndex, cv)
                          }
                        }
                      }}
                    />
                    <p className="hint">Enter the correct numeric answer between {q.sliderMin ?? 0} and {q.sliderMax ?? 100}.</p>
                  </div>
                </div>
              ) : (q.type ?? 'multiple_choice') === 'multi_choice' ? (
                /* Multi-Choice: dynamic options with checkboxes */
                <fieldset className="options-group">
                  <legend className="form-label">Answer Options (select all correct answers with checkboxes)</legend>
                  {q.options.map((opt, oIndex) => (
                    <div key={`${q._id}-opt-${oIndex}`} className="option-row-dynamic">
                      <input
                        type="checkbox"
                        id={`q-${q._id}-correct-${oIndex}`}
                        className="option-checkbox"
                        checked={q.correctIndices?.includes(oIndex) ?? false}
                        onChange={() => toggleCorrectIndex(qIndex, oIndex)}
                        aria-label={`Mark option ${oIndex + 1} as correct`}
                      />
                      <input
                        type="text"
                        id={`q-${q._id}-opt-${oIndex}`}
                        className="form-input option-input"
                        placeholder={`Option ${oIndex + 1}`}
                        value={opt}
                        onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                        aria-label={`Option ${oIndex + 1} text`}
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          className="btn-icon btn-icon-danger"
                          title="Remove option"
                          onClick={() => removeOption(qIndex, oIndex)}
                          aria-label={`Remove option ${oIndex + 1}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {q.options.length < 8 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-add-option"
                      onClick={() => addOption(qIndex)}
                    >
                      + Add Option
                    </button>
                  )}
                  <p className="hint">Check the boxes next to all correct answers. You can have 2-8 options.</p>
                </fieldset>
              ) : (
                /* Multiple Choice or True/False: radio + text inputs */
                <fieldset className="options-group">
                  <legend className="form-label">Answer Options</legend>
                  {q.options.slice(0, (q.type ?? 'multiple_choice') === 'true_false' ? 2 : 4).map((opt, oIndex) => {
                    const isTrueFalse = (q.type ?? 'multiple_choice') === 'true_false';

                    return (
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

                        {isTrueFalse ? (
                          <span className="true-false-label">{opt}</span>
                        ) : (
                          <input
                            type="text"
                            id={`q-${q._id}-opt-${optionLabels[oIndex]}`}
                            className="form-input option-input"
                            placeholder={`Option ${optionLabels[oIndex]}`}
                            value={opt}
                            onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                            aria-label={`Option ${optionLabels[oIndex]} text`}
                          />
                        )}
                      </div>
                    );
                  })}
                  <p className="hint">Select the radio button next to the correct answer.</p>
                </fieldset>
              )}

              {/* Time limit */}
              <div className="form-group time-limit-group">
                <label htmlFor={`q-${q._id}-time`} className="form-label">
                  Time Limit
                </label>
                <div className="time-limit-input-row">
                  <input
                    id={`q-${q._id}-time`}
                    type="text"
                    inputMode="numeric"
                    className="form-input time-limit-input"
                    value={draftTimeLimit !== null ? draftTimeLimit : String(q.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS)}
                    onFocus={() => {
                      setDraftTimeLimit('')
                      setEditedTimeLimit(false)
                    }}
                    onChange={(e) => {
                      setDraftTimeLimit(e.target.value)
                      setEditedTimeLimit(true)
                    }}
                    onBlur={(e) => {
                      if (!editedTimeLimit) {
                        setDraftTimeLimit(null)
                        setEditedTimeLimit(false)
                        return
                      }
                      const inputVal = e.target.value.trim()
                      if (inputVal === '') {
                        setDraftTimeLimit(null)
                        setEditedTimeLimit(false)
                        updateTimeLimitSeconds(qIndex, DEFAULT_TIME_LIMIT_SECONDS)
                      } else {
                        const val = Number.parseInt(inputVal, 10)
                        if (!Number.isNaN(val)) {
                          setDraftTimeLimit(null)
                          setEditedTimeLimit(false)
                          const clamped = Math.min(120, Math.max(5, val))
                          updateTimeLimitSeconds(qIndex, clamped)
                        }
                      }
                    }}
                  />
                  <span className="time-limit-unit">seconds</span>
                </div>
              </div>
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
