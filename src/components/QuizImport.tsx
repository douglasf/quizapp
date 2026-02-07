import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Quiz } from '../types/quiz'
import { validateQuiz } from '../utils/quizValidator'
import './QuizImport.css'

const CREATED_QUIZ_KEY = 'quizapp_created_quiz'
const IMPORTED_QUIZ_KEY = 'quizapp_imported_quiz'

function QuizImport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isLoadMode = searchParams.get('mode') === 'load'

  // Export state — quiz that was just created
  const [createdQuiz, setCreatedQuiz] = useState<Quiz | null>(null)
  const [copied, setCopied] = useState(false)

  // Import state
  const [jsonText, setJsonText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load created quiz from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CREATED_QUIZ_KEY)
    if (stored) {
      try {
        const quiz = JSON.parse(stored) as Quiz
        setCreatedQuiz(quiz)
      } catch {
        // Corrupt data — ignore
        localStorage.removeItem(CREATED_QUIZ_KEY)
      }
    }
  }, [])

  // ── Export actions ──

  function handleCopyToClipboard() {
    if (!createdQuiz) return
    const json = JSON.stringify(createdQuiz, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownloadJson() {
    if (!createdQuiz) return
    const json = JSON.stringify(createdQuiz, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = createdQuiz.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    a.download = `${safeName || 'quiz'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleNewQuiz() {
    localStorage.removeItem(CREATED_QUIZ_KEY)
    navigate('/create')
  }

  function handleHostCreatedQuiz() {
    if (!createdQuiz) return
    // Move quiz to imported key so host lobby can pick it up
    localStorage.setItem(IMPORTED_QUIZ_KEY, JSON.stringify(createdQuiz))
    localStorage.removeItem(CREATED_QUIZ_KEY)
    navigate('/host')
  }

  // ── Import actions ──

  function processImport(raw: string) {
    setErrors([])
    setImportSuccess(false)

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      const parseErr = e instanceof SyntaxError ? e.message : 'Unknown error';
      setErrors([`Invalid JSON — could not parse the input. ${parseErr}`])
      return
    }

    const result = validateQuiz(parsed)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }

    // Valid quiz — store and navigate
    localStorage.setItem(IMPORTED_QUIZ_KEY, JSON.stringify(parsed))
    localStorage.removeItem(CREATED_QUIZ_KEY)
    setImportSuccess(true)

    // Small delay so user sees the success state
    setTimeout(() => {
      navigate('/host')
    }, 600)
  }

  function handleImport() {
    if (!jsonText.trim()) {
      setErrors(['Please paste some JSON or upload a file first.'])
      return
    }
    processImport(jsonText)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setJsonText(text)
      processImport(text)
    }
    reader.onerror = () => {
      setErrors(['Failed to read the file. Please try again.'])
    }
    reader.readAsText(file)

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // ── Render ──

  const prettyJson = createdQuiz ? JSON.stringify(createdQuiz, null, 2) : ''

  return (
    <div className="page quiz-import">
      <div className="import-container">
        <h1>{isLoadMode && !createdQuiz ? 'Load a Quiz to Host' : 'Import / Export Quiz'}</h1>

        {/* ─── Export section ─── */}
        {createdQuiz && (
          <section className="export-section">
            <h2>Your Quiz is Ready!</h2>
            <p className="section-description">
              Share this JSON with others so they can import your quiz, or host it now.
            </p>

            <div className="json-preview">
              <pre>{prettyJson}</pre>
            </div>

            <div className="export-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleHostCreatedQuiz}
              >
                Host This Quiz
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopyToClipboard}
              >
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadJson}
              >
                Download as JSON
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleNewQuiz}
              >
                Create New Quiz
              </button>
            </div>
          </section>
        )}

        {/* ─── Import section ─── */}
        <section className="import-section">
          <h2>{isLoadMode && !createdQuiz ? 'Load Your Quiz' : 'Import a Quiz'}</h2>
          <p className="section-description">
            {isLoadMode && !createdQuiz
              ? 'Paste a previously saved quiz JSON below or upload a .json file to start hosting.'
              : <>Paste quiz JSON below or upload a <code>.json</code> file.</>
            }
          </p>

          {/* Error display */}
          {errors.length > 0 && (
            <div className="error-box" role="alert">
              <strong>Import failed:</strong>
              <ul>
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Success display */}
          {importSuccess && (
            <output className="success-box">
              Quiz imported successfully! Redirecting to host lobby...
            </output>
          )}

          {/* Paste JSON */}
          <div className="form-group">
            <label htmlFor="import-json" className="form-label">
              Quiz JSON
            </label>
            <textarea
              id="import-json"
              className="form-input json-textarea"
              placeholder='{"title": "My Quiz", "questions": [...]}'
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setErrors([])
                setImportSuccess(false)
              }}
              rows={8}
            />
          </div>

          {/* File upload */}
          <div className="form-group">
            <label htmlFor="import-file" className="form-label">
              Or upload a file
            </label>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="file-input"
              onChange={handleFileChange}
            />
          </div>

          {/* Import button */}
          <button
            type="button"
            className="btn btn-primary import-btn"
            onClick={handleImport}
            disabled={importSuccess}
          >
            Import Quiz
          </button>
        </section>

        {/* ─── Navigation ─── */}
        <div className="nav-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuizImport
