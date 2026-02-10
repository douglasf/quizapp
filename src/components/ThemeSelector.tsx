import { THEMES } from '../config/themes';
import './ThemeSelector.css';

interface ThemeSelectorProps {
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
}

function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  return (
    <div className="theme-selector">
      <span className="theme-selector-label">Theme</span>
      <div className="theme-selector-row">
        {THEMES.map((theme) => (
          <button
            type="button"
            key={theme.id}
            className={`theme-btn${currentTheme === theme.id ? ' theme-btn--active' : ''}`}
            onClick={() => onThemeChange(theme.id)}
            title={theme.description}
            aria-pressed={currentTheme === theme.id}
          >
            <span className="theme-btn-emoji" aria-hidden="true">
              {theme.emoji}
            </span>
            <span className="theme-btn-label">{theme.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ThemeSelector;
