import type { DataConnection } from 'peerjs';
import { Peer } from 'peerjs';
import { generateGameCode } from './gameCode';

// Type for the peer status
type PeerStatus = 'idle' | 'connecting' | 'open' | 'error' | 'destroyed';

// Module-level state
let peer: Peer | null = null;
let gameCode: string | null = null;
const listeners: Set<() => void> = new Set();
const connectionHandlers: Set<(conn: DataConnection) => void> = new Set();
let peerStatus: PeerStatus = 'idle';
let lastError: string | null = null;

// Module-level cache for snapshot to prevent infinite re-render loops in useSyncExternalStore
let cachedSnapshot: PeerManagerSnapshot = {
  gameCode: '',
  status: 'idle',
  error: null,
};

// Type for snapshot returned to React
export interface PeerManagerSnapshot {
  gameCode: string;
  status: PeerStatus;
  error: string | null;
}

// --- Initialization ---

/**
 * Initialize peer with a random game code (lazy init).
 * Safe to call multiple times — returns existing peer if already initialized.
 */
export function initializePeer(): Peer {
  if (peer && !peer.destroyed) {
    return peer;
  }

  // Generate game code if not already set
  if (!gameCode) {
    gameCode = generateGameCode();
  }

  const peerId = `quiz-${gameCode}`;
  peerStatus = 'connecting';

  const newPeer = new Peer(peerId, {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
  });

  peer = newPeer;

  // Event handlers
  newPeer.on('open', () => {
    peerStatus = 'open';
    lastError = null;
    notifyListeners();
  });

  newPeer.on('error', (err) => {
    console.error('[PeerManager] Peer error:', err);
    peerStatus = 'error';
    lastError = err.type === 'unavailable-id' 
      ? 'Game code unavailable (may be in use). Try refreshing.'
      : `Peer error: ${err.type}`;
    notifyListeners();
  });

  newPeer.on('disconnected', () => {
    console.warn('[PeerManager] Peer disconnected, attempting reconnect');
    if (!newPeer.destroyed) {
      newPeer.reconnect();
    }
  });

  newPeer.on('connection', (conn) => {
    for (const handler of connectionHandlers) {
      handler(conn);
    }
  });

  notifyListeners();
  return newPeer;
}

/**
 * Get the current peer instance, or null if not initialized.
 */
export function getPeer(): Peer | null {
  return peer && !peer.destroyed ? peer : null;
}

/**
 * Get the current game code.
 */
export function getGameCode(): string {
  return gameCode || '';
}

/**
 * Get current status.
 */
export function getStatus(): PeerStatus {
  return peerStatus;
}

// --- Connection Management ---

/**
 * Register a handler to be called when a player connects.
 * Returns an unsubscribe function.
 */
export function onConnection(handler: (conn: DataConnection) => void): () => void {
  connectionHandlers.add(handler);
  return () => {
    connectionHandlers.delete(handler);
  };
}

// --- React Integration (useSyncExternalStore) ---

/**
 * Subscribe to PeerManager state changes.
 * Used by useSyncExternalStore in React components.
 */
export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Get an immutable snapshot of PeerManager state.
 * Used by useSyncExternalStore in React components.
 */
export function getSnapshot(): PeerManagerSnapshot {
  const current = {
    gameCode: gameCode || '',
    status: peerStatus,
    error: lastError,
  };

  // Only return a new object if something actually changed
  if (
    cachedSnapshot.gameCode !== current.gameCode ||
    cachedSnapshot.status !== current.status ||
    cachedSnapshot.error !== current.error
  ) {
    cachedSnapshot = current;
  }

  return cachedSnapshot;
}

// --- Lifecycle ---

/**
 * Reset the peer with a new game code.
 * Useful if user explicitly wants to "generate new code" (future feature).
 */
export function resetPeer(): void {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }
  peer = null;
  gameCode = null;
  peerStatus = 'idle';
  lastError = null;
  notifyListeners();
  
  // Recreate with new code
  initializePeer();
}

/**
 * Destroy the peer (full cleanup).
 * Use this if shutting down the host entirely.
 */
export function destroyPeer(): void {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }
  peer = null;
  gameCode = null;
  connectionHandlers.clear();
  listeners.clear();
  peerStatus = 'destroyed';
  lastError = null;
}

// --- Internal Helpers ---

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

// Clean up on page unload (optional but recommended)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    destroyPeer();
  });
}

// HMR cleanup (Vite dev mode)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    destroyPeer();
  });
}
