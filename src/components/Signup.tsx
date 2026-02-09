import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ApiError } from '../utils/apiClient'
import './Signup.css'

function Signup() {
  const navigate = useNavigate()
  const { signup } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  function validate(): boolean {
    const errors: Record<string, string[]> = {}

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      errors.email = ['Email is required']
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = ['Please enter a valid email address']
    }

    if (!password) {
      errors.password = ['Password is required']
    } else if (password.length < 8) {
      errors.password = ['Password must be at least 8 characters']
    }

    const trimmedName = displayName.trim()
    if (!trimmedName) {
      errors.displayName = ['Display name is required']
    } else if (trimmedName.length > 50) {
      errors.displayName = ['Display name must be 50 characters or fewer']
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    if (!validate()) return

    setIsSubmitting(true)
    try {
      await signup(email.trim(), password, displayName.trim())
      navigate('/my-quizzes')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details) {
          setFieldErrors(err.details)
        } else if (err.status === 409) {
          setError('An account with this email already exists.')
        } else {
          setError(err.message || 'Signup failed. Please try again.')
        }
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasFieldError = (field: string) =>
    fieldErrors[field] && fieldErrors[field].length > 0

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-emoji">✨</div>
          <h1>Sign Up</h1>
          <p>Create an account to save and manage your quizzes.</p>
        </div>

        {error && (
          <div className="error-box">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="signup-display-name" className="form-label">
              Display Name
            </label>
            <input
              id="signup-display-name"
              type="text"
              className={`form-input${hasFieldError('displayName') ? ' input-error' : ''}`}
              placeholder="What should we call you?"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isSubmitting}
              autoComplete="name"
              maxLength={50}
              required
            />
            {hasFieldError('displayName') && (
              <p className="field-error">{fieldErrors.displayName[0]}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="signup-email" className="form-label">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              className={`form-input${hasFieldError('email') ? ' input-error' : ''}`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              autoComplete="email"
              required
            />
            {hasFieldError('email') && (
              <p className="field-error">{fieldErrors.email[0]}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="signup-password" className="form-label">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              className={`form-input${hasFieldError('password') ? ' input-error' : ''}`}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="new-password"
              minLength={8}
              required
            />
            {hasFieldError('password') && (
              <p className="field-error">{fieldErrors.password[0]}</p>
            )}
            {!hasFieldError('password') && (
              <p className="hint">Must be at least 8 characters</p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Creating account…
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  )
}

export default Signup
