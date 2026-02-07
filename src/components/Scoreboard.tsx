import type { PlayerStanding } from '../types/game';
import './Scoreboard.css';

interface ScoreboardProps {
  standings: PlayerStanding[];
  currentPlayerName?: string;
  showPodium?: boolean;
  title?: string;
}

function Scoreboard({ standings, currentPlayerName, showPodium = false, title }: ScoreboardProps) {
  if (standings.length === 0) {
    return (
      <div className="scoreboard">
        {title && <h2 className="scoreboard-title">{title}</h2>}
        <p style={{ textAlign: 'center', color: '#6b7280' }}>No players yet.</p>
      </div>
    );
  }

  const top3 = showPodium ? standings.slice(0, 3) : [];
  const rest = showPodium ? standings.slice(3) : standings;

  // Podium order: [2nd, 1st, 3rd] for visual layout
  const podiumOrder = top3.length >= 2
    ? [top3[1], top3[0], ...(top3[2] ? [top3[2]] : [])]
    : top3;

  const podiumBadges = ['', '\u{1F451}', '\u{1F948}', '\u{1F949}']; // crown, silver, bronze

  return (
    <div className="scoreboard">
      {title && <h2 className="scoreboard-title">{title}</h2>}

      {showPodium && podiumOrder.length > 0 && (
        <div className="podium">
          {podiumOrder.map((player) => (
            <div key={player.name} className="podium-place">
              <span className="podium-badge">{podiumBadges[player.rank] || ''}</span>
              <span className="podium-name">{player.name}</span>
              <span className="podium-score">{player.score} pts</span>
              <div className="podium-bar" />
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <ul className="standings-list">
          {rest.map((player) => {
            const isCurrentPlayer = currentPlayerName !== undefined
              && player.name.toLowerCase() === currentPlayerName.toLowerCase();
            return (
              <li
                key={player.name}
                className={`standings-item${isCurrentPlayer ? ' standings-item--highlight' : ''}`}
              >
                <span className="standings-rank">#{player.rank}</span>
                <span className="standings-name">{player.name}</span>
                <span className="standings-score">{player.score} pts</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Scoreboard;
