import Avatar from './Avatar';
import { AVATAR_EMOJIS, AVATAR_COLORS } from '../constants/avatars';
import './AvatarPicker.css';

interface AvatarPickerProps {
  emoji: string;
  color: string;
  onEmojiChange: (emoji: string) => void;
  onColorChange: (color: string) => void;
}

function AvatarPicker({ emoji, color, onEmojiChange, onColorChange }: AvatarPickerProps) {
  return (
    <div className="avatar-picker">
      <div className="avatar-picker-preview">
        <Avatar emoji={emoji} color={color} size="lg" />
      </div>

      <div className="avatar-picker-section">
        <span className="avatar-picker-label">Choose your emoji</span>
        <div className="emoji-grid">
          {AVATAR_EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              className={`emoji-button ${emoji === e ? 'selected' : ''}`}
              onClick={() => onEmojiChange(e)}
              title={e}
            >
              <Avatar emoji={e} color={color} size="sm" />
            </button>
          ))}
        </div>
      </div>

      <div className="avatar-picker-section">
        <span className="avatar-picker-label">Choose your color</span>
        <div className="color-swatches">
          {AVATAR_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`color-button ${color === c ? 'selected' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(c)}
              title={c}
            >
              {color === c && <span className="checkmark">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AvatarPicker;
