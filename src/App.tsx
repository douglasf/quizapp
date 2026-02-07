import { Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import QuizCreator from './components/QuizCreator'
import QuizImport from './components/QuizImport'
import HostPage from './components/HostPage'
import PlayerJoin from './components/PlayerJoin'
import PlayerGame from './components/PlayerGame'

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<QuizCreator />} />
        <Route path="/import" element={<QuizImport />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/join/:gameCode?" element={<PlayerJoin />} />
        <Route path="/play" element={<PlayerGame />} />
      </Routes>
    </div>
  )
}

export default App
