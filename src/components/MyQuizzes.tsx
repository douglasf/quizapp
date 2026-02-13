import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  listQuizzes,
  getQuiz,
  deleteQuiz,
  createQuiz,
  ApiError,
} from '../utils/apiClient'
import type { QuizMeta } from '../utils/apiClient'
import type { Quiz } from '../types/quiz'
import './MyQuizzes.css'

const CREATED_QUIZ_KEY = 'quizapp_created_quiz'
const IMPORTED_QUIZ_KEY = 'quizapp_imported_quiz'
const PAGE_SIZE = 20

function MyQuizzes() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, user } = useAuth()

  // Quiz list state
  const [quizzes, setQuizzes] = useState<QuizMeta[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Per-quiz action state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedSoloId, setCopiedSoloId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Migration banner state
  const [hasLocalQuiz, setHasLocalQuiz] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationDismissed, setMigrationDismissed] = useState(false)

  // ── Redirect to login if not authenticated ──
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login')
    }
  }, [authLoading, isAuthenticated, navigate])

  // ── Check for local quiz on mount ──
  useEffect(() => {
    const stored = localStorage.getItem(CREATED_QUIZ_KEY)
    if (stored) {
      try {
        JSON.parse(stored)
        setHasLocalQuiz(true)
      } catch {
        localStorage.removeItem(CREATED_QUIZ_KEY)
      }
    }
  }, [])

  // ── Fetch quizzes ──
  const fetchQuizzes = useCallback(
    async (pageNum: number) => {
      setLoading(true)
      setError('')
      try {
        const result = await listQuizzes(pageNum, PAGE_SIZE)
        if (pageNum === 1) {
          setQuizzes(result.quizzes)
        } else {
          setQuizzes((prev) => [...prev, ...result.quizzes])
        }
        setTotal(result.total)
        setPage(pageNum)
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          setError('Failed to load quizzes. Please try again.')
        }
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchQuizzes(1)
    }
  }, [authLoading, isAuthenticated, fetchQuizzes])

  // ── Host a quiz ──
  async function handleHost(quizId: string) {
    try {
      const response = await getQuiz(quizId)
      localStorage.setItem(IMPORTED_QUIZ_KEY, JSON.stringify(response.quiz.data))
      navigate('/host')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to load quiz: ${err.message}`)
      } else {
        setError('Failed to load quiz. Please try again.')
      }
    }
  }

  // ── Share a quiz ──
  function handleShare(quizId: string) {
    const shareUrl = `${window.location.origin}/quizapp/#/q/${quizId}`
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedId(quizId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  // ── Copy solo link ──
  function handleCopySoloLink(quizId: string) {
    const soloUrl = `${window.location.origin}/quizapp/#/solo/${quizId}`
    navigator.clipboard.writeText(soloUrl).then(() => {
      setCopiedSoloId(quizId)
      setTimeout(() => setCopiedSoloId(null), 2000)
    })
  }

  // ── Delete a quiz ──
  async function handleDelete(quizId: string) {
    setDeletingId(quizId)
    setError('')
    try {
      await deleteQuiz(quizId)
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId))
      setTotal((prev) => prev - 1)
      setConfirmDeleteId(null)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to delete quiz: ${err.message}`)
      } else {
        setError('Failed to delete quiz. Please try again.')
      }
    } finally {
      setDeletingId(null)
    }
  }

  // ── Import local quiz ──
  async function handleImportLocal() {
    const stored = localStorage.getItem(CREATED_QUIZ_KEY)
    if (!stored) return

    setMigrating(true)
    setError('')
    try {
      const quiz: Quiz = JSON.parse(stored)
      const result = await createQuiz(quiz)
      localStorage.removeItem(CREATED_QUIZ_KEY)
      setHasLocalQuiz(false)
      // Prepend the new quiz to the list
      setQuizzes((prev) => [result.quiz, ...prev])
      setTotal((prev) => prev + 1)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Failed to import quiz: ${err.message}`)
      } else {
        setError('Failed to import quiz. Please try again.')
      }
    } finally {
      setMigrating(false)
    }
  }

  function handleDismissMigration() {
    setMigrationDismissed(true)
  }

  // ── Load more ──
  function handleLoadMore() {
    fetchQuizzes(page + 1)
  }

  // ── Format date ──
  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  // ── Render guards ──
  if (authLoading) {
    return (
      <div className="page my-quizzes-page">
        <div className="my-quizzes-container">
          <div className="my-quizzes-loading">
            <div className="spinner" />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null // redirect will happen via useEffect
  }

  const hasMore = quizzes.length < total
  const showMigrationBanner = hasLocalQuiz && !migrationDismissed

  return (
    <div className="page my-quizzes-page">
      <div className="my-quizzes-container">
        {/* Header */}
        <div className="my-quizzes-header">
          <div className="my-quizzes-emoji">📚</div>
          <h1>My Quizzes</h1>
          {user && (
            <p className="my-quizzes-greeting">
              Welcome back, {user.displayName}!
            </p>
          )}
        </div>

        {/* Migration banner */}
        {showMigrationBanner && (
          <div className="migration-banner">
            <div className="migration-banner-icon">💾</div>
            <div className="migration-banner-content">
              <p className="migration-banner-text">
                You have a quiz saved locally. Import it to your account?
              </p>
              <div className="migration-banner-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleImportLocal}
                  disabled={migrating}
                >
                  {migrating ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Importing...
                    </>
                  ) : (
                    'Import Quiz'
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleDismissMigration}
                  disabled={migrating}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="error-box" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* Actions bar */}
        <div className="my-quizzes-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/create')}
          >
            Create New Quiz
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </div>

        {/* Quiz list */}
        {loading && quizzes.length === 0 ? (
          <div className="my-quizzes-loading">
            <div className="spinner" />
            <p>Loading your quizzes...</p>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="my-quizzes-empty">
            <div className="my-quizzes-empty-icon">🎯</div>
            <p>You don't have any quizzes yet. Create one!</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/create')}
            >
              Create a Quiz
            </button>
          </div>
        ) : (
          <>
            <div className="quiz-grid">
              {quizzes.map((quiz) => (
                <div key={quiz.id} className="quiz-card">
                  <div className="quiz-card-body">
                    <h3 className="quiz-card-title">{quiz.title}</h3>
                    <div className="quiz-card-meta">
                      <span className="quiz-card-questions">
                        {quiz.questionCount} question{quiz.questionCount !== 1 ? 's' : ''}
                      </span>
                      <span className="quiz-card-date">
                        {formatDate(quiz.createdAt)}
                      </span>
                      {quiz.updatedAt && quiz.updatedAt !== quiz.createdAt && (
                        <span className="quiz-card-updated">
                          Edited: {formatDate(quiz.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="quiz-card-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleHost(quiz.id)}
                    >
                      Host
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/create?edit=${quiz.id}`)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleShare(quiz.id)}
                    >
                      {copiedId === quiz.id ? 'Copied!' : 'Share'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCopySoloLink(quiz.id)}
                      disabled={copiedSoloId === quiz.id}
                    >
                      {copiedSoloId === quiz.id ? 'Copied!' : 'Solo Link'}
                    </button>
                    {confirmDeleteId === quiz.id ? (
                      <div className="delete-confirm">
                        <span className="delete-confirm-text">Delete?</span>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(quiz.id)}
                          disabled={deletingId === quiz.id}
                        >
                          {deletingId === quiz.id ? (
                            <span className="btn-spinner" aria-hidden="true" />
                          ) : (
                            'Yes'
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === quiz.id}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setConfirmDeleteId(quiz.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="my-quizzes-load-more">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLoadMore}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Loading...
                    </>
                  ) : (
                    `Load More (${quizzes.length} of ${total})`
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default MyQuizzes
