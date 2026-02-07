import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayer } from '../hooks/usePlayer';
import './PlayerJoin.css';

function PlayerJoin() {
  const { gameCode: urlGameCode } = useParams<{ gameCode?: string }>();
  const navigate = useNavigate();

  const [gameCode, setGameCode] = useState(urlGameCode?.toUpperCase() ?? '');
  const [playerName, setPlayerName] = useState('');
  // Only connect when we have a valid 4-char game code
  const [activeGameCode, setActiveGameCode] = useState(
    urlGameCode && urlGameCode.length === 4 ? urlGameCode.toUpperCase() : ''
  );

  const {
    connectionStatus,
    playerName: confirmedName,
    handleJoin,
    onMessage,
    isLoading,
    errorMessage,
  } = usePlayer(activeGameCode);

  // Track if we've already auto-connected from URL
  const autoConnectedRef = useRef(false);

  // Listen for welcome/rejoin_success to navigate to play screen
  useEffect(() => {
    onMessage((msg) => {
      if (msg.type === 'welcome' || msg.type === 'rejoin_success') {
        // Store player info for PlayerGame
        sessionStorage.setItem('quizapp_player_data', JSON.stringify({
          gameCode: activeGameCode,
          playerName: msg.playerName,
        }));
        navigate('/play');
      }
    });
  }, [onMessage, activeGameCode, navigate]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!gameCode.trim() || !playerName.trim() || gameCode.length < 4) return;

    // If the active game code doesn't match, update it (triggers connection)
    if (activeGameCode !== gameCode.toUpperCase()) {
      setActiveGameCode(gameCode.toUpperCase());
      // Wait for connection to establish before joining
      // The useEffect below will handle sending join once connected
      autoConnectedRef.current = false;
      return;
    }

    handleJoin(playerName);
  }, [gameCode, playerName, handleJoin, activeGameCode]);

  // When activeGameCode changes and connection is established, send join
  useEffect(() => {
    if (
      activeGameCode &&
      connectionStatus === 'connected' &&
      playerName.trim() &&
      !confirmedName &&
      !autoConnectedRef.current
    ) {
      autoConnectedRef.current = true;
      // Small delay to ensure connection is fully ready
      const timeout = setTimeout(() => {
        handleJoin(playerName);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [activeGameCode, connectionStatus, playerName, confirmedName, handleJoin]);

  const handleGameCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only alphanumeric, max 4 chars
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    setGameCode(val);
  }, []);

  return (
    <div className="page player-join">
      <div className="join-container">
        <h1>Join Quiz</h1>

        {errorMessage && (
          <div className="join-error" role="alert">
            {errorMessage}
            {connectionStatus === 'failed' && (
              <p className="error-suggestion">Check the game code and make sure the host is still running.</p>
            )}
          </div>
        )}

        <form className="join-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="game-code" className="form-label">Game Code</label>
            <input
              id="game-code"
              type="text"
              className="form-input game-code-input"
              placeholder="ABCD"
              value={gameCode}
              onChange={handleGameCodeChange}
              maxLength={4}
              autoComplete="off"
              autoCapitalize="characters"
              disabled={isLoading}
            />
            {urlGameCode && (
              <div className="qr-hint">Scanned from QR code</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="player-name" className="form-label">Your Name</label>
            <input
              id="player-name"
              type="text"
              className="form-input"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              autoComplete="off"
              disabled={isLoading}
            />
          </div>

          {isLoading ? (
            <div className="join-loading">
              <div className="spinner" />
              Joining...
            </div>
          ) : (
            <button
              type="submit"
              className="btn btn-primary join-btn"
              disabled={!gameCode.trim() || !playerName.trim() || gameCode.length < 4}
            >
              Join Quiz
            </button>
          )}
        </form>

        <button
          type="button"
          className="btn btn-secondary join-back"
          onClick={() => navigate('/')}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default PlayerJoin;
