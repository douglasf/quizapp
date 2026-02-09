import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Quiz } from '../types/quiz'
import { validateQuiz } from '../utils/quizValidator'
import { fetchQuizFromUrl } from '../utils/fetchQuiz'
import { encodeQuizToFragment, decodeQuizFromFragment } from '../utils/quizLink'
import { compressQuizImages } from '../utils/imageCompression'
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
  const [linkCopied, setLinkCopied] = useState(false)
  const [linkWarning, setLinkWarning] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  // Import state
  const [jsonText, setJsonText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // URL import state
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)

  // Auto-import from ?quiz= parameter state
  const [autoImportLoading, setAutoImportLoading] = useState(false)

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

  // Auto-import from ?quiz= search parameter on mount
  useEffect(() => {
    const quizParam = searchParams.get('quiz')
    if (!quizParam) return

    setAutoImportLoading(true)
    decodeQuizFromFragment(quizParam)
      .then((json) => processImport(json))
      .catch(() =>
        setErrors(['Could not decode quiz from URL. The link may be corrupted.']),
      )
      .finally(() => setAutoImportLoading(false))
    // processImport is stable (defined in component scope, no deps change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

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

  async function handleShareAsLink() {
    if (!createdQuiz) return
    setLinkLoading(true)
    setLinkWarning('')

    try {
      // Re-compress all images before encoding to ensure minimal URL size
      const compressedQuiz = await compressQuizImages(createdQuiz as unknown as Parameters<typeof compressQuizImages>[0]) as unknown as Quiz;
      const encoded = await encodeQuizToFragment(compressedQuiz)
      // HashRouter: routes live inside the # fragment, so the URL must be
      // origin/base/#/import?quiz=...  (not origin/base/import?quiz=...)
      const fullUrl = `${window.location.origin}/quizapp/#/import?quiz=${encoded}`

      console.log(
        `[ShareLink] URL length: ${fullUrl.length} chars ` +
        `(JSON: ${JSON.stringify(compressedQuiz).length} chars)`
      );

      if (fullUrl.length > 50_000) {
        setLinkWarning(
          'This link is large due to images. Some browsers may not support URLs this long.',
        )
      } else {
        setLinkWarning('')
      }

      await navigator.clipboard.writeText(fullUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setErrors([`Failed to create share link: ${message}`])
    } finally {
      setLinkLoading(false)
    }
  }

  function handleNewQuiz() {
    localStorage.removeItem(CREATED_QUIZ_KEY)
    navigate('/create')
  }

  function handleHostCreatedQuiz() {
    if (!createdQuiz) return
    // Move quiz to imported key so host lobby can pick it up
    try {
      localStorage.setItem(IMPORTED_QUIZ_KEY, JSON.stringify(createdQuiz))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setErrors(['Quiz is too large to save locally. Please remove some images or simplify the quiz.'])
        return
      }
      throw err
    }
    localStorage.removeItem(CREATED_QUIZ_KEY)
    navigate('/host')
  }

  // ── Import actions ──

  async function processImport(raw: string) {
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

    // Compress all images BEFORE validation so that oversized images get
    // compressed down and pass the size checks in the validator.
    try {
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).questions)) {
        parsed = await compressQuizImages(parsed as Parameters<typeof compressQuizImages>[0]);
      }
    } catch (err) {
      console.warn('[QuizImport] Image compression failed, validating with original images:', err);
      // Continue with original images — validation may reject if too large
    }

    const result = validateQuiz(parsed)
    if (!result.valid) {
      setErrors(result.errors)
      return
    }

    // Valid quiz — store and navigate
    try {
      localStorage.setItem(IMPORTED_QUIZ_KEY, JSON.stringify(parsed))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setErrors(['Quiz is too large to save locally. Please remove some images or simplify the quiz.'])
        return
      }
      throw err
    }
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

  async function handleFetchFromUrl() {
    if (!urlInput.trim()) {
      setErrors(['Please enter a URL to fetch a quiz from.'])
      return
    }
    setUrlLoading(true)
    setErrors([])
    setImportSuccess(false)

    const result = await fetchQuizFromUrl(urlInput)

    if (result.success) {
      processImport(result.json)
    } else {
      setErrors([result.error])
    }

    setUrlLoading(false)
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
                onClick={handleShareAsLink}
                disabled={linkLoading}
              >
                {linkLoading ? 'Sharing...' : linkCopied ? 'Link Copied!' : 'Share as Link'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleNewQuiz}
              >
                Create New Quiz
              </button>
            </div>

            {linkWarning && (
              <div className="link-warning" role="alert">
                {linkWarning}
              </div>
            )}
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

          {/* Auto-import loading state */}
          {autoImportLoading && (
            <div className="success-box" role="status">
              Decoding quiz from link...
            </div>
          )}

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

          {/* URL import */}
          <div className="form-group">
            <label htmlFor="import-url" className="form-label">
              Fetch from URL
            </label>
            <div className="url-import-group">
              <input
                id="import-url"
                type="url"
                className="form-input url-input"
                placeholder="https://gist.githubusercontent.com/..."
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value)
                  setErrors([])
                  setImportSuccess(false)
                }}
                disabled={urlLoading || importSuccess}
              />
              <button
                type="button"
                className="btn btn-primary fetch-btn"
                onClick={handleFetchFromUrl}
                disabled={urlLoading || importSuccess}
              >
                {urlLoading ? 'Fetching...' : 'Fetch Quiz'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="import-divider">
            <hr /><span>or</span><hr />
          </div>

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
