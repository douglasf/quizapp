import { useNavigate } from 'react-router-dom'
import './Home.css'

function Home() {
  const navigate = useNavigate()

  return (
    <div className="page home">
      <div className="home-hero">
        <div className="home-emoji">🧠</div>
        <h1>Quiz!</h1>
      </div>
      <p>Create and play quizzes with friends in real-time — no server needed!</p>
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
