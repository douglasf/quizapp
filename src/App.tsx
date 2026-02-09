import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import Home from './components/Home'
import QuizCreator from './components/QuizCreator'
import QuizImport from './components/QuizImport'
import HostPage from './components/HostPage'
import PlayerJoin from './components/PlayerJoin'
import PlayerGame from './components/PlayerGame'
import Login from './components/Login'
import Signup from './components/Signup'
import MyQuizzes from './components/MyQuizzes'

/** Client-side short link handler: /q/:id → /import?quizId=:id */
function ShortLinkRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/import?quizId=${id}`} replace />
}

function App() {
  return (
    <div className="app">
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
