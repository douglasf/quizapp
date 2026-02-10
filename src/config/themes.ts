export interface ThemeDefinition {
  id: string;        // slug used in data-theme attribute and localStorage
  label: string;     // display name
  emoji: string;     // visual indicator in selector
  description: string;
}

export const THEMES: ThemeDefinition[] = [
  { id: 'default', label: 'Pastel',      emoji: '🌸', description: 'Soft pastels with auto dark mode' },
  { id: 'dark',    label: 'Dark Mode',   emoji: '🌙', description: 'Always-dark purple theme' },
  { id: 'neon',    label: 'Neon Arcade', emoji: '🕹️', description: 'Bright neon on dark background' },
  { id: 'holiday', label: 'Holiday',     emoji: '🎄', description: 'Festive red and green' },
  { id: 'sunset',  label: 'Warm Sunset', emoji: '🌅', description: 'Warm oranges and deep purples' },
];

export const DEFAULT_THEME_ID = 'default';
