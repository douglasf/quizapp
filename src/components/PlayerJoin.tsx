import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayer } from '../hooks/usePlayer';
import './PlayerJoin.css';

function PlayerJoin() {
  const { gameCode: urlGameCode } = useParams<{ gameCode?: string }>();
  const navigate = useNavigate();

  const [gameCode, setGameCode] = useState(urlGameCode?.toUpperCase() ?? '');
  const [playerName, setPlayerName] = useState('');
  // Only connect when we have a valid 4-char game code — set on explicit button click
  const [activeGameCode, setActiveGameCode] = useState('');

  const {
    connectionStatus,
    playerName: confirmedName,
    handleJoin,
    onMessage,
    isLoading,
    errorMessage,
  } = usePlayer(activeGameCode);

  // Track whether we've already sent a join after connection was established
  const pendingJoinRef = useRef(false);
  // Stash the player name at submission time so the auto-join effect uses
  // the value that was current when the button was clicked, not the live state
  const pendingNameRef = useRef('');

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

  // Prevent Enter key from submitting the form — only allow explicit button click
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }, []);

  // Only called when the "Join Quiz" button is explicitly clicked
  const handleButtonClick = useCallback(() => {
    if (!gameCode.trim() || !playerName.trim() || gameCode.length < 4) return;

    const upperCode = gameCode.toUpperCase();

    // If we need to (re-)connect to a different game code, set it and
    // let the useEffect below send the join once the connection opens
    if (activeGameCode !== upperCode) {
      pendingNameRef.current = playerName;
      pendingJoinRef.current = true;
      setActiveGameCode(upperCode);
      return;
    }

    // Already connected to this game code — send join immediately
    if (connectionStatus === 'connected') {
      handleJoin(playerName);
    }
  }, [gameCode, playerName, handleJoin, activeGameCode, connectionStatus]);

  // When the connection to the host is established after a button-click-triggered
  // activeGameCode change, send the join message exactly once.
  useEffect(() => {
    if (
      pendingJoinRef.current &&
      activeGameCode &&
      connectionStatus === 'connected' &&
      !confirmedName
    ) {
      pendingJoinRef.current = false;
      // Small delay to ensure the PeerJS data channel is fully ready
      const timeout = setTimeout(() => {
        handleJoin(pendingNameRef.current);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [activeGameCode, connectionStatus, confirmedName, handleJoin]);

  const handleGameCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only alphanumeric, max 4 chars
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    setGameCode(val);
  }, []);

  const isFormValid = gameCode.trim().length === 4 && playerName.trim().length > 0;

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

        {/* No onSubmit — form submission is driven exclusively by the button onClick */}
        <div className="join-form">
          <div className="form-group">
            <label htmlFor="game-code" className="form-label">Game Code</label>
            <input
              id="game-code"
              type="text"
              className="form-input game-code-input"
              placeholder="ABCD"
              value={gameCode}
              onChange={handleGameCodeChange}
              onKeyDown={handleKeyDown}
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
              onKeyDown={handleKeyDown}
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
              type="button"
              className="btn btn-primary join-btn"
              disabled={!isFormValid}
              onClick={handleButtonClick}
            >
              Join Quiz
            </button>
          )}
        </div>

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
