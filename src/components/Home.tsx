import { useNavigate } from 'react-router-dom'

function Home() {
  const navigate = useNavigate()

  return (
    <div className="page home">
      <h1>Quiz App</h1>
      <p>Create and play quizzes with friends in real-time — no server needed!</p>
      <div className="button-group">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/create')}>
          Host a Quiz
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/join')}>
          Join a Quiz
        </button>
      </div>
    </div>
  )
}

export default Home
