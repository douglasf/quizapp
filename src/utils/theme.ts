import { DEFAULT_THEME_ID } from '../config/themes';

export const STORAGE_KEY = 'quizapp_theme';

/** Apply a theme by setting data-theme on <html>. */
export function applyTheme(themeId: string): void {
  if (themeId === DEFAULT_THEME_ID || !themeId) {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = themeId;
  }
}

/** Persist theme choice to localStorage. */
export function saveTheme(themeId: string): void {
  localStorage.setItem(STORAGE_KEY, themeId);
}

/** Read persisted theme (or return default). */
export function getSavedTheme(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_ID;
}

/** Call synchronously before createRoot() to prevent FOUC. */
export function initTheme(): void {
  applyTheme(getSavedTheme());
}
