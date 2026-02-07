import { useState, useEffect, useMemo, useCallback } from 'react';
import { detectLocalIp, buildJoinBaseUrl } from '../utils/getHostUrl';

const DETECTED_IP_KEY = 'quizapp_detected_ip';
const MANUAL_IP_KEY = 'quizapp_manual_ip_override';

/**
 * Hook that detects the local network IP (in development on localhost)
 * and provides a `joinBaseUrl` suitable for QR codes and join links.
 *
 * The returned `joinBaseUrl` already includes the origin and pathname
 * (e.g. `http://192.168.1.42:5173/quizapp/`). Append `#/join/<code>`
 * to build the full join URL.
 *
 * Supports manual IP override: if `quizapp_manual_ip_override` is set in
 * localStorage, that value takes precedence over auto-detection.
 *
 * @returns {{ joinBaseUrl: string; detecting: boolean; localIp: string | null; setManualIp: (ip: string | null) => void }}
 */
export function useHostUrl() {
  // Check for a manual override first
  const [manualIp, setManualIpState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MANUAL_IP_KEY);
    } catch {
      return null;
    }
  });

  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(() => {
    const { hostname } = window.location;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  });

  useEffect(() => {
    const { hostname } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (!isLocalhost) {
      // Not on localhost — nothing to detect
      setDetecting(false);
      return;
    }

    let cancelled = false;

    detectLocalIp().then((ip) => {
      console.log('[useHostUrl] detectLocalIp resolved with:', ip);
      if (!cancelled) {
        if (ip) {
          // Persist the detected IP so we can inspect it
          try {
            localStorage.setItem(DETECTED_IP_KEY, ip);
          } catch { /* noop */ }

          const joinUrl = buildJoinBaseUrl(ip);
          console.log('[useHostUrl] Setting detectedIp:', ip, '→ joinBaseUrl will be:', joinUrl);
          setDetectedIp(ip);
        } else {
          console.log('[useHostUrl] No IP detected, using current origin');
          try {
            localStorage.setItem(DETECTED_IP_KEY, 'null');
          } catch { /* noop */ }
        }
        setDetecting(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Set (or clear) a manual IP override.
   * Passing `null` clears the override and reverts to auto-detected IP.
   */
  const setManualIp = useCallback((ip: string | null) => {
    try {
      if (ip) {
        localStorage.setItem(MANUAL_IP_KEY, ip);
      } else {
        localStorage.removeItem(MANUAL_IP_KEY);
      }
    } catch { /* noop */ }
    setManualIpState(ip);
  }, []);

  // The effective IP: manual override takes precedence
  const localIp = manualIp || detectedIp;

  // Derive joinBaseUrl whenever localIp changes.
  const joinBaseUrl = useMemo(() => buildJoinBaseUrl(localIp), [localIp]);

  return { joinBaseUrl, detecting, localIp, detectedIp, manualIp, setManualIp };
}
