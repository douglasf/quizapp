import type { PlayerStanding } from '../types/game';
import Avatar from './Avatar';
import './Scoreboard.css';

interface ScoreboardProps {
  standings: PlayerStanding[];
  currentPlayerName?: string;
  showPodium?: boolean;
  title?: string;
  anonymous?: boolean;
}

function Scoreboard({ standings, currentPlayerName, showPodium = false, title, anonymous = false }: ScoreboardProps) {
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
          {podiumOrder.map((player, idx) => (
            <div key={anonymous ? `anon-${idx}` : player.name} className="podium-place">
              <span className="podium-badge">{podiumBadges[player.rank] || ''}</span>
              {!anonymous && player.avatar && <Avatar emoji={player.avatar.emoji} color={player.avatar.color} size="lg" />}
              {!anonymous && <span className="podium-name">{player.name}</span>}
              <span className="podium-score">{player.score} pts</span>
              <div className="podium-bar" />
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <ul className="standings-list">
          {rest.map((player, idx) => {
            const isCurrentPlayer = !anonymous && currentPlayerName !== undefined
              && player.name.toLowerCase() === currentPlayerName.toLowerCase();
            return (
              <li
                key={anonymous ? `anon-${idx}` : player.name}
                className={`standings-item${isCurrentPlayer ? ' standings-item--highlight' : ''}`}
              >
                <span className="standings-rank">#{player.rank}</span>
                {!anonymous && player.avatar && <Avatar emoji={player.avatar.emoji} color={player.avatar.color} size="sm" />}
                {!anonymous && <span className="standings-name">{player.name}</span>}
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
