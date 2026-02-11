import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Quiz } from '../types/quiz'
import { validateQuiz } from '../utils/quizValidator'
import { fetchQuizFromUrl } from '../utils/fetchQuiz'
import { encodeQuizToFragment, decodeQuizFromFragment } from '../utils/quizLink'
import { compressQuizImages } from '../utils/imageCompression'
import { getQuiz, createQuiz, ApiError } from '../utils/apiClient'
import { useAuth } from '../hooks/useAuth'
import './QuizImport.css'

const CREATED_QUIZ_KEY = 'quizapp_created_quiz'
const IMPORTED_QUIZ_KEY = 'quizapp_imported_quiz'

function QuizImport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const isLoadMode = searchParams.get('mode') === 'load'

  // Export state — quiz that was just created
  const [createdQuiz, setCreatedQuiz] = useState<Quiz | null>(null)
  const [createdQuizCloudId, setCreatedQuizCloudId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [shortLinkCopied, setShortLinkCopied] = useState(false)
  const [linkWarning, setLinkWarning] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  // Import state
  const [jsonText, setJsonText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [importSuccess, setImportSuccess] = useState(false)
  const [importedQuiz, setImportedQuiz] = useState<Quiz | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Save-to-cloud state
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // URL import state
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)

  // Auto-import from ?quiz= parameter state
  const [autoImportLoading, setAutoImportLoading] = useState(false)

  // Cloud loading state (for ?quizId= parameter)
  const [cloudLoading, setCloudLoading] = useState(false)

  // Load created quiz from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CREATED_QUIZ_KEY)
    if (stored) {
      try {
        const quiz = JSON.parse(stored) as Quiz
        setCreatedQuiz(quiz)
        // Check if this quiz has a cloud ID saved alongside it
        const cloudId = localStorage.getItem('quizapp_created_quiz_cloud_id')
        if (cloudId) {
          setCreatedQuizCloudId(cloudId)
        }
      } catch {
        // Corrupt data — ignore
        localStorage.removeItem(CREATED_QUIZ_KEY)
        localStorage.removeItem('quizapp_created_quiz_cloud_id')
      }
    }
  }, [])

  // Auto-import from ?quizId= search parameter (cloud quiz)
  useEffect(() => {
    const quizId = searchParams.get('quizId')
    if (quizId) {
      loadQuizFromCloud(quizId)
      return
    }

    // Auto-import from ?quiz= search parameter (encoded quiz)
    const quizParam = searchParams.get('quiz')
    if (!quizParam) return

    setAutoImportLoading(true)
    decodeQuizFromFragment(quizParam)
      .then((json) => processImport(json))
      .catch(() =>
        setErrors(['Could not decode quiz from URL. The link may be corrupted.']),
      )
      .finally(() => setAutoImportLoading(false))
    // processImport / loadQuizFromCloud are stable (defined in component scope, no deps change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Cloud loading ──

  async function loadQuizFromCloud(quizId: string) {
    setCloudLoading(true)
    setErrors([])

    try {
      const response = await getQuiz(quizId)
      const quizData = response.quiz.data

      // Validate the quiz
      const result = validateQuiz(quizData)
      if (!result.valid) {
        setErrors(result.errors)
        return
      }

      // Store and navigate to host
      try {
        localStorage.setItem(IMPORTED_QUIZ_KEY, JSON.stringify(quizData))
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          setErrors(['Quiz is too large to save locally. Please remove some images or simplify the quiz.'])
          return
        }
        throw err
      }
      localStorage.removeItem(CREATED_QUIZ_KEY)
      localStorage.removeItem('quizapp_created_quiz_cloud_id')
      setImportedQuiz(quizData as Quiz)
      setImportSuccess(true)

      // For authenticated users, pause so they can save before hosting.
      // Unauthenticated users get the original quick redirect.
      if (!isAuthenticated) {
        setTimeout(() => {
          navigate('/host')
        }, 600)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setErrors(['Quiz not found. The link may be expired or incorrect.'])
        } else {
          setErrors([`Failed to load quiz: ${err.message}`])
        }
      } else {
        setErrors(['Failed to load quiz from cloud. Please try again.'])
      }
    } finally {
      setCloudLoading(false)
    }
  }

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
    localStorage.removeItem('quizapp_created_quiz_cloud_id')
    navigate('/create')
  }

  function handleShareShortLink() {
    if (!createdQuizCloudId) return
    const shortUrl = `${window.location.origin}/quizapp/#/q/${createdQuizCloudId}`
    navigator.clipboard.writeText(shortUrl).then(() => {
      setShortLinkCopied(true)
      setTimeout(() => setShortLinkCopied(false), 2000)
    })
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
    localStorage.removeItem('quizapp_created_quiz_cloud_id')
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
    setImportedQuiz(parsed as Quiz)
    setImportSuccess(true)

    // For authenticated users, pause so they can save before hosting.
    // Unauthenticated users get the original quick redirect.
    if (!isAuthenticated) {
      setTimeout(() => {
        navigate('/host')
      }, 600)
    }
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

  // ── Save imported quiz to cloud ──

  async function handleSaveToMyQuizzes() {
    if (!importedQuiz) return

    setSaving(true)
    setSaveError(null)

    try {
      await createQuiz(importedQuiz)
      setSaveSuccess(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(`Failed to save: ${err.message}`)
      } else {
        setSaveError('Failed to save quiz. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──

  const prettyJson = createdQuiz ? JSON.stringify(createdQuiz, null, 2) : ''

  return (
    <div className="page quiz-import">
      <div className="import-container">
        <h1>
          {createdQuiz
            ? 'Your Quiz is Ready!'
            : isLoadMode
              ? 'Load a Quiz to Host'
              : 'Import / Export Quiz'}
        </h1>

        {/* ─── Export section ─── */}
        {createdQuiz && (
          <section className="export-section">
            <p className="quiz-summary">
              {createdQuiz.title} — {createdQuiz.questions.length} question{createdQuiz.questions.length !== 1 ? 's' : ''}
            </p>

            <button
              type="button"
              className="btn btn-primary btn-host-cta"
              onClick={handleHostCreatedQuiz}
            >
              Host This Quiz
            </button>

            <details className="json-accordion">
              <summary>View Quiz JSON</summary>
              <div className="json-preview">
                <pre>{prettyJson}</pre>
              </div>
            </details>

            {/* Share link options */}
            <div className="share-links-section">
              <h3 className="share-links-heading">Share Links</h3>

              {createdQuizCloudId && (
                <div className="share-link-option share-link-recommended">
                  <div className="share-link-info">
                    <span className="share-link-label">Short link</span>
                    <span className="share-link-badge">Recommended</span>
                    <p className="share-link-description">
                      Clean, short URL. Works as long as the quiz is stored in the cloud.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleShareShortLink}
                  >
                    {shortLinkCopied ? 'Copied!' : 'Copy Short Link'}
                  </button>
                </div>
              )}

              <div className={`share-link-option${createdQuizCloudId ? ' share-link-legacy' : ''}`}>
                <div className="share-link-info">
                  <span className="share-link-label">
                    {createdQuizCloudId ? 'Full link' : 'Share as Link'}
                  </span>
                  {createdQuizCloudId && (
                    <span className="share-link-badge share-link-badge-secondary">Legacy</span>
                  )}
                  <p className="share-link-description">
                    {createdQuizCloudId
                      ? 'Encodes the entire quiz in the URL. Large but works offline.'
                      : 'Encodes the entire quiz in the URL so others can import it directly.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleShareAsLink}
                  disabled={linkLoading}
                >
                  {linkLoading ? 'Sharing...' : linkCopied ? 'Copied!' : 'Copy Full Link'}
                </button>
              </div>
            </div>

            {linkWarning && (
              <div className="link-warning" role="alert">
                {linkWarning}
              </div>
            )}

            {/* Secondary export tools */}
            <div className="export-tools">
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
            </div>
          </section>
        )}

        {/* ─── Import section ─── */}
        {!createdQuiz && (
        <section className="import-section">
          <h2>{isLoadMode && !createdQuiz ? 'Load Your Quiz' : 'Import a Quiz'}</h2>
          <p className="section-description">
            {isLoadMode && !createdQuiz
              ? 'Paste a previously saved quiz JSON below or upload a .json file to start hosting.'
              : <>Paste quiz JSON below or upload a <code>.json</code> file.</>
            }
          </p>

          {/* Cloud loading state */}
          {cloudLoading && (
            <div className="success-box" role="status">
              Loading quiz from cloud...
            </div>
          )}

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
            <div className="import-success-area">
              <output className="success-box">
                Quiz imported successfully!{!isAuthenticated && ' Redirecting to host lobby...'}
              </output>

              {/* Save & continue actions for authenticated users */}
              {isAuthenticated && importedQuiz && (
                <div className="import-success-actions">
                  {saveError && (
                    <div className="save-error" role="alert">
                      {saveError}
                    </div>
                  )}

                  {saveSuccess ? (
                    <div className="save-success-msg">
                      Saved to My Quizzes!
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary save-quiz-btn"
                      onClick={handleSaveToMyQuizzes}
                      disabled={saving}
                    >
                      {saving ? (
                        <><span className="btn-spinner" aria-hidden="true" />Saving...</>
                      ) : (
                        'Save to My Quizzes'
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary continue-host-btn"
                    onClick={() => navigate('/host')}
                  >
                    Continue to Host Lobby
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Load from My Quizzes — only shown to authenticated users */}
          {isAuthenticated && (
            <>
              <button
                type="button"
                className="btn btn-primary my-quizzes-btn"
                onClick={() => navigate('/my-quizzes')}
              >
                Load from My Quizzes
              </button>

              <div className="import-divider">
                <hr /><span>or</span><hr />
              </div>
            </>
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
        )}

        {/* ─── Navigation ─── */}
        <div className="nav-actions">
          {createdQuiz && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleNewQuiz}
            >
              Create New Quiz
            </button>
          )}
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
