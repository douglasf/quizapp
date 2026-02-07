/**
 * Check whether an IPv4 address belongs to a private (RFC 1918) range:
 *  - 10.0.0.0    – 10.255.255.255  (Class A)
 *  - 172.16.0.0  – 172.31.255.255  (Class B)
 *  - 192.168.0.0 – 192.168.255.255 (Class C)
 */
function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true;

  // 172.16.0.0 – 172.31.255.255
  if (ip.startsWith('172.')) {
    const secondOctet = Number.parseInt(ip.split('.')[1], 10);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

// ─── localStorage debug logging ───

const LOG_KEY = 'quizapp_ip_detection_log';

interface IpLogEntry {
  ts: string;
  event: string;
  data?: Record<string, unknown>;
}

function appendLog(event: string, data?: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const logs: IpLogEntry[] = raw ? JSON.parse(raw) : [];
    logs.push({ ts: new Date().toISOString(), event, data });
    // Keep last 100 entries to avoid unbounded growth
    if (logs.length > 100) logs.splice(0, logs.length - 100);
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch {
    // Silently ignore — localStorage might be unavailable
  }
}

/**
 * Detect the local network IP address via WebRTC ICE candidates.
 *
 * This uses the same underlying mechanism that PeerJS relies on.
 * It creates a temporary RTCPeerConnection, gathers ICE candidates,
 * and extracts the local IPv4 address from the candidates.
 *
 * A public STUN server is used to ensure candidates are generated even
 * in browsers that block host candidates for privacy (Chrome 91+, etc.).
 * The STUN server causes the browser to produce server-reflexive (srflx)
 * candidates whose connection-address is the local network IP.
 *
 * **Priority:** private/local IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 * are returned immediately. Public IPs are kept as a fallback and only used
 * if ICE gathering finishes without finding any private IP.
 *
 * Returns `null` if detection fails or times out.
 */
export function detectLocalIp(): Promise<string | null> {
  // Clear previous logs on each fresh detection attempt
  try { localStorage.removeItem(LOG_KEY); } catch { /* noop */ }

  appendLog('detection_start', { userAgent: navigator.userAgent });

  return new Promise((resolve) => {
    let resolved = false;
    let publicFallback: string | null = null;
    const allCandidates: string[] = [];

    const done = (ip: string | null, reason: string) => {
      if (resolved) {
        appendLog('done_ignored_already_resolved', { ip, reason });
        console.log('[detectLocalIp] Already resolved, ignoring done() call with:', ip, 'reason:', reason);
        return;
      }
      resolved = true;
      clearTimeout(timeout);

      appendLog('resolved', {
        ip,
        reason,
        publicFallback,
        totalCandidatesSeen: allCandidates.length,
        allCandidates,
      });

      console.log('[detectLocalIp] ✅ RESOLVED with IP:', ip, '| Reason:', reason);
      pc.close();
      resolve(ip);
    };

    // Use a public STUN server so the browser generates srflx candidates
    // even when host candidates are hidden behind mDNS (.local addresses).
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Timeout after 5 seconds — give STUN a bit more time than the old 3s.
    console.log('[detectLocalIp] Starting ICE candidate gathering (5s timeout)...');
    appendLog('timeout_armed', { timeoutMs: 5000 });
    const timeout = setTimeout(() => {
      console.log('[detectLocalIp] ⏰ TIMEOUT after 5s. publicFallback:', publicFallback);
      appendLog('timeout_fired', { publicFallback, totalCandidates: allCandidates.length });
      done(publicFallback, 'timeout');
    }, 5000);

    pc.createDataChannel('');

    pc.createOffer()
      .then((offer) => {
        appendLog('offer_created', { sdpLength: offer.sdp?.length ?? 0 });
        return pc.setLocalDescription(offer);
      })
      .then(() => {
        appendLog('local_description_set');
      })
      .catch((err) => {
        console.log('[detectLocalIp] ❌ createOffer/setLocalDescription failed');
        appendLog('offer_error', { error: String(err) });
        done(null, 'offer-error');
      });

    pc.onicecandidate = (event) => {
      if (resolved) {
        // Still log candidates that arrive after resolution
        if (event?.candidate) {
          appendLog('late_candidate_post_resolve', { candidate: event.candidate.candidate });
          console.log('[detectLocalIp] (post-resolve) Late candidate:', event.candidate.candidate);
        }
        return;
      }

      if (!event || !event.candidate) {
        // ICE gathering finished — use the best IP we found (or null).
        console.log('[detectLocalIp] ICE gathering complete (null candidate). publicFallback:', publicFallback);
        appendLog('ice_gathering_complete', { publicFallback });
        done(publicFallback, 'ice-gathering-complete');
        return;
      }

      const candidateStr = event.candidate.candidate;
      const candidateType = event.candidate.type; // host, srflx, prflx, relay
      allCandidates.push(candidateStr);

      console.log('[detectLocalIp] ────────────────────────────────');
      console.log('[detectLocalIp] Candidate:', candidateStr);
      console.log('[detectLocalIp] Candidate type:', candidateType);
      console.log('[detectLocalIp] Protocol:', event.candidate.protocol);
      console.log('[detectLocalIp] Address:', event.candidate.address);

      // ICE candidate lines look like:
      //   candidate:842163049 1 udp 1677729535 192.168.1.42 56234 typ srflx ...
      // We want the IPv4 address that is NOT 0.0.0.0 or 127.x.x.x
      const ipMatch = candidateStr.match(
        /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/
      );

      if (ipMatch) {
        const ip = ipMatch[1];
        const isPrivate = isPrivateIp(ip);

        appendLog('candidate_ip_extracted', {
          candidate: candidateStr,
          candidateType,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          extractedIp: ip,
          isPrivate,
          isLoopback: ip.startsWith('127.') || ip === '0.0.0.0',
        });

        console.log('[detectLocalIp] Extracted IP:', ip);
        console.log('[detectLocalIp] Is private?:', isPrivate);

        // Skip loopback and link-local "any" address
        if (ip.startsWith('127.') || ip === '0.0.0.0') {
          console.log('[detectLocalIp] Skipping (loopback/any):', ip);
          return;
        }

        if (isPrivate) {
          // Found a local network IP — resolve immediately.
          console.log('[detectLocalIp] 🏠 Found PRIVATE IP, resolving immediately:', ip);
          done(ip, 'private-ip-found');
        } else if (!publicFallback) {
          // Store the first public IP as a fallback, but keep listening
          // for a private one.
          console.log('[detectLocalIp] 🌐 Storing PUBLIC IP as fallback:', ip);
          publicFallback = ip;
        } else {
          console.log('[detectLocalIp] Ignoring duplicate public IP:', ip, '(already have fallback:', publicFallback, ')');
          appendLog('duplicate_public_ip_ignored', { ip, existingFallback: publicFallback });
        }
      } else {
        appendLog('candidate_no_ipv4', {
          candidate: candidateStr,
          candidateType,
          address: event.candidate.address,
        });
        console.log('[detectLocalIp] No IPv4 found in candidate (mDNS or IPv6?)');
      }
    };
  });
}

/**
 * Build the base URL (origin + pathname) for join links and QR codes.
 *
 * - In production (or when already accessed via an IP / real hostname):
 *   returns the current `window.location.origin + pathname` as-is.
 *
 * - In development on localhost/127.0.0.1: replaces the hostname with the
 *   detected local network IP so phones on the same WiFi can reach the app.
 *
 * @param localIp  The detected local network IP (from `detectLocalIp()`).
 *                 Pass `null` to fall back to the current origin.
 */
export function buildJoinBaseUrl(localIp: string | null): string {
  const { protocol, hostname, port, pathname } = window.location;

  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocalhost && localIp) {
    const portSuffix = port ? `:${port}` : '';
    return `${protocol}//${localIp}${portSuffix}${pathname}`;
  }

  // Already on a real hostname (deployed site, or user navigated via IP)
  return `${window.location.origin}${pathname}`;
}
