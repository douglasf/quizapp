import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ApiError } from '../utils/apiClient'
import './Login.css'

function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      await login(email.trim(), password)
      navigate('/my-quizzes')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details) {
          setFieldErrors(err.details)
        } else {
          setError(
            err.status === 401
              ? 'Invalid email or password'
              : err.message || 'Login failed. Please try again.',
          )
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
          <div className="auth-emoji">🔑</div>
          <h1>Log In</h1>
          <p>Welcome back! Sign in to manage your quizzes.</p>
        </div>

        {error && (
          <div className="error-box">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">
              Email
            </label>
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="form-label">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className={`form-input${hasFieldError('password') ? ' input-error' : ''}`}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="current-password"
              required
            />
            {hasFieldError('password') && (
              <p className="field-error">{fieldErrors.password[0]}</p>
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
                Logging in…
              </>
            ) : (
              'Log In'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
