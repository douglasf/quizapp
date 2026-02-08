import { useState, useEffect, useCallback } from 'react';

const LS_KEY = 'quizapp_fullscreen_enabled';

/**
 * useFullscreen — manages the browser Fullscreen API.
 *
 * Returns:
 *  - isFullscreen: whether the document is currently in fullscreen
 *  - toggleFullscreen: request/exit fullscreen
 *  - isSupported: whether the Fullscreen API is available
 *
 * Gracefully handles ESC-key exits and saves preference to localStorage
 * so the host can re-enter fullscreen automatically on next load.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const isSupported = typeof document.documentElement.requestFullscreen === 'function';

  // Sync state whenever fullscreen changes (user presses ESC, etc.)
  useEffect(() => {
    const handleChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      try {
        localStorage.setItem(LS_KEY, String(active));
      } catch {
        // localStorage not available — ignore
      }
    };

    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!isSupported) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen request denied or failed — ignore
    }
  }, [isSupported]);

  return { isFullscreen, toggleFullscreen, isSupported };
}
