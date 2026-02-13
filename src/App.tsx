import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom'
import Home from './components/Home'
import QuizCreator from './components/QuizCreator'
import QuizImport from './components/QuizImport'
import HostPage from './components/HostPage'
import PlayerJoin from './components/PlayerJoin'
import PlayerGame from './components/PlayerGame'
import Login from './components/Login'
import Signup from './components/Signup'
import MyQuizzes from './components/MyQuizzes'
import { useAuth } from './hooks/useAuth'
import './App.css'

/** Client-side short link handler: /q/:id → /import?quizId=:id */
function ShortLinkRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/import?quizId=${id}`} replace />
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  // Plan §5.4.2 / Step 4: gate on isLoading so the login page does not flash
  // while AuthProvider is restoring the session via the refresh-token cookie.
  const { isLoading, isAuthenticated, user, logout } = useAuth()

  if (isLoading) {
    return <div className="app-loading">Loading…</div>
  }

  // Plan §5.4.1 / Step 5: Log out action clears the session via
  // useAuth().logout() and redirects to the home page.
  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="app">
      {/* Plan §5.4.1 / Step 5 – global auth header.
          Shows the host's display name and a Log out action across all
          authenticated routes so the persisted-session state is always visible.
          Hidden on /host since that screen may be projected on a TV. */}
      {isAuthenticated && user && location.pathname !== '/host' && (
        <header className="app-header">
          <span className="app-header-greeting">
            {user.displayName}
          </span>
          <button
            type="button"
            className="app-header-logout"
            onClick={handleLogout}
            aria-label="Log out"
          >
            Log out
          </button>
        </header>
      )}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/my-quizzes" element={<MyQuizzes />} />
        <Route path="/create" element={<QuizCreator />} />
        <Route path="/import" element={<QuizImport />} />
        <Route path="/q/:id" element={<ShortLinkRedirect />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/join/:gameCode?" element={<PlayerJoin />} />
        <Route path="/play" element={<PlayerGame />} />
      </Routes>
    </div>
  )
}

export default App
