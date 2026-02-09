import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import './Home.css'

function Home() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, user, logout } = useAuth()

  return (
    <div className="page home">
      <div className="home-hero">
        <div className="home-emoji">🧠</div>
        <h1>Quiz!</h1>
      </div>
      <p>Create and play quizzes with friends in real-time — no server needed!</p>

      {/* Auth-aware top bar */}
      {!isLoading && (
        <div className="home-auth-bar">
          {isAuthenticated ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/my-quizzes')}>
                My Quizzes
              </button>
              <span className="home-user-greeting">Hi, {user?.displayName}!</span>
              <button type="button" className="btn-link home-logout" onClick={() => logout()}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/login')}>
                Sign In
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/signup')}>
                Sign Up
              </button>
            </>
          )}
        </div>
      )}

      <div className="button-group">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/create')}>
          Create a Quiz
        </button>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/import?mode=load')}>
          Load &amp; Host Quiz
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/join')}>
          Join a Quiz
        </button>
      </div>
    </div>
  )
}

export default Home
