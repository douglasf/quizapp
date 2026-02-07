// Player-side networking hook — manages PeerJS connection to host, message handling, and reconnection

import { useState, useRef, useCallback, useEffect } from 'react';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { createPlayerPeer } from '../utils/peer';
import type { HostMessage, PlayerMessage } from '../types/messages';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_INTERVAL_MS = 5_000;

export interface UsePlayerReturn {
  connectionStatus: 'connected' | 'reconnecting' | 'failed';
  reconnectAttempts: number;
  playerName: string | null;
  handleJoin: (name: string) => void;
  handleSubmitAnswer: (optionIndex: number) => void;
  onMessage: (handler: (msg: HostMessage) => void) => void;
  onError: (handler: (error: string) => void) => void;
  isLoading: boolean;
  errorMessage: string | null;
}

/**
 * Custom hook that manages all player-side PeerJS networking.
 *
 * Flow:
 *  1. Creates a PeerJS peer with an auto-generated ID.
 *  2. Connects to the host peer at `quiz-<gameCode>`.
 *  3. On connection open, waits for handleJoin() to send a `join` message.
 *  4. Handles all host messages (welcome, question, answer_ack, etc.).
 *  5. On disconnect, auto-retries up to 3 times with 5-second intervals.
 */
export function usePlayer(gameCode: string): UsePlayerReturn {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'failed'>('connected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for PeerJS instances (don't trigger re-renders)
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  // Refs for reconnection management
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isReconnectingRef = useRef(false);

  // Stash playerName in a ref so reconnection callbacks can access it
  const playerNameRef = useRef<string | null>(null);

  // Current question index ref (for answer submission)
  const currentQuestionIndexRef = useRef<number>(0);

  // External handler refs — registered via onMessage / onError
  const messageHandlerRef = useRef<((msg: HostMessage) => void) | null>(null);
  const errorHandlerRef = useRef<((error: string) => void) | null>(null);

  // Track whether the hook has been unmounted
  const unmountedRef = useRef(false);

  // ---------- handler registration ----------

  const onMessage = useCallback((handler: (msg: HostMessage) => void) => {
    messageHandlerRef.current = handler;
  }, []);

  const onError = useCallback((handler: (error: string) => void) => {
    errorHandlerRef.current = handler;
  }, []);

  // ---------- message processing ----------

  const processHostMessage = useCallback((msg: HostMessage) => {
    switch (msg.type) {
      case 'welcome': {
        setPlayerName(msg.playerName);
        playerNameRef.current = msg.playerName;
        setIsLoading(false);
        setErrorMessage(null);
        setConnectionStatus('connected');
        break;
      }

      case 'rejoin_success': {
        setPlayerName(msg.playerName);
        playerNameRef.current = msg.playerName;
        setConnectionStatus('connected');
        setReconnectAttempts(0);
        reconnectAttemptsRef.current = 0;
        isReconnectingRef.current = false;
        setIsLoading(false);
        setErrorMessage(null);
        break;
      }

      case 'question': {
        currentQuestionIndexRef.current = msg.index;
        break;
      }

      case 'error': {
        setIsLoading(false);
        setErrorMessage(msg.message);
        errorHandlerRef.current?.(msg.message);
        break;
      }

      case 'pong': {
        // Keep-alive response, no action needed
        break;
      }

      // player_list, answer_ack, answer_reveal, scoreboard, game_over
      // are forwarded to the external handler below
      default:
        break;
    }

    // Always forward the raw message to the external handler
    messageHandlerRef.current?.(msg);
  }, []);

  // ---------- connection setup ----------

  const setupConnectionListeners = useCallback(
    (conn: DataConnection) => {
      conn.on('data', (rawData: unknown) => {
        const msg = rawData as HostMessage;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
        processHostMessage(msg);
      });

      conn.on('close', () => {
        if (unmountedRef.current) return;

        // Only attempt reconnection if we had a player name (i.e. we were joined)
        if (playerNameRef.current && !isReconnectingRef.current) {
          attemptReconnect();
        }
      });

      conn.on('error', (err) => {
        console.error('[usePlayer] Connection error:', err);
        if (unmountedRef.current) return;

        // If the host's peer is unavailable, don't retry — host is gone
        const errMsg = err?.message ?? String(err);
        if (errMsg.includes('Could not connect to peer') || errMsg.includes('peer-unavailable')) {
          setConnectionStatus('failed');
          setErrorMessage('Host disconnected. The game is no longer available.');
          setIsLoading(false);
          return;
        }

        // For other errors, attempt reconnection if we were joined
        if (playerNameRef.current && !isReconnectingRef.current) {
          attemptReconnect();
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [processHostMessage],
  );

  // ---------- reconnection logic ----------

  const attemptReconnect = useCallback(() => {
    if (unmountedRef.current) return;

    isReconnectingRef.current = true;
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    setConnectionStatus('reconnecting');
    setErrorMessage(null);

    const doAttempt = () => {
      if (unmountedRef.current) return;

      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus('failed');
        setErrorMessage('Unable to reconnect to the game. Please refresh and try again.');
        isReconnectingRef.current = false;
        return;
      }

      reconnectAttemptsRef.current += 1;
      setReconnectAttempts(reconnectAttemptsRef.current);

      console.log(
        `[usePlayer] Reconnect attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`,
      );

      // Destroy old peer if it exists
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }

      // Create a fresh peer
      const newPeer = createPlayerPeer();
      peerRef.current = newPeer;

      newPeer.on('open', () => {
        if (unmountedRef.current) {
          newPeer.destroy();
          return;
        }

        const conn = newPeer.connect(`quiz-${gameCode}`, { reliable: true });
        connRef.current = conn;

        conn.on('open', () => {
          if (unmountedRef.current) return;

          // Send rejoin (NOT join)
          const name = playerNameRef.current;
          if (!name) return;
          const rejoinMsg: PlayerMessage = { type: 'rejoin', name };
          conn.send(rejoinMsg);
        });

        setupConnectionListeners(conn);
      });

      newPeer.on('error', (err) => {
        console.error('[usePlayer] Peer error during reconnect:', err);
        if (unmountedRef.current) return;

        // Schedule next attempt
        reconnectTimeoutRef.current = setTimeout(doAttempt, RECONNECT_INTERVAL_MS);
      });
    };

    // Start first attempt after a brief delay
    reconnectTimeoutRef.current = setTimeout(doAttempt, RECONNECT_INTERVAL_MS);
  }, [gameCode, setupConnectionListeners]);

  // ---------- initial peer + connection setup ----------

  useEffect(() => {
    // Don't connect if there's no game code
    if (!gameCode || gameCode.trim().length < 4) {
      return;
    }

    unmountedRef.current = false;

    const peer = createPlayerPeer();
    peerRef.current = peer;

    peer.on('open', () => {
      if (unmountedRef.current) return;
      console.log(`[usePlayer] Peer open with ID: ${peer.id}`);

      const conn = peer.connect(`quiz-${gameCode}`, { reliable: true });
      connRef.current = conn;

      conn.on('open', () => {
        if (unmountedRef.current) return;
        console.log('[usePlayer] Connected to host');
        setConnectionStatus('connected');
      });

      setupConnectionListeners(conn);
    });

    peer.on('error', (err) => {
      console.error('[usePlayer] Peer error:', err);
      if (unmountedRef.current) return;

      if (err.type === 'peer-unavailable') {
        setErrorMessage('Game not found. Check the game code and make sure the host is still running.');
        setIsLoading(false);
        setConnectionStatus('failed');
      }
    });

    peer.on('disconnected', () => {
      console.warn('[usePlayer] Disconnected from signalling server');
      if (!peer.destroyed && !unmountedRef.current) {
        peer.reconnect();
      }
    });

    return () => {
      unmountedRef.current = true;

      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Destroy the peer (closes all connections)
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }
      peerRef.current = null;
      connRef.current = null;
    };
  }, [gameCode, setupConnectionListeners]);

  // ---------- actions ----------

  /** Send a `join` message to the host with the given player name. */
  const handleJoin = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMessage('Name cannot be empty');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const conn = connRef.current;
    if (!conn || !conn.open) {
      setIsLoading(false);
      setErrorMessage('Not connected to the game yet. Please wait and try again.');
      return;
    }

    const joinMsg: PlayerMessage = { type: 'join', name: trimmed };
    conn.send(joinMsg);
  }, []);

  /** Submit an answer for the current question. */
  const handleSubmitAnswer = useCallback((optionIndex: number) => {
    const conn = connRef.current;
    if (!conn || !conn.open) return;

    const answerMsg: PlayerMessage = {
      type: 'answer',
      questionIndex: currentQuestionIndexRef.current,
      optionIndex,
    };
    conn.send(answerMsg);
  }, []);

  return {
    connectionStatus,
    reconnectAttempts,
    playerName,
    handleJoin,
    handleSubmitAnswer,
    onMessage,
    onError,
    isLoading,
    errorMessage,
  };
}
