// Host-side networking hook — manages PeerJS peer, player connections, and message handling

import { useState, useRef, useCallback, useEffect } from 'react';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { createHostPeer } from '../utils/peer';
import { generateGameCode } from '../utils/gameCode';
import type { Player, GamePhase } from '../types/game';
import type { PlayerMessage, HostMessage } from '../types/messages';

const MAX_PLAYERS = 20;

/** Canonical key for player name: trimmed + lowercased */
function canonicalName(name: string): string {
  return name.trim().toLowerCase();
}

export interface UseHostReturn {
  gameCode: string;
  players: Map<string, Player>;
  broadcast: (msg: HostMessage) => void;
  sendToPlayer: (playerName: string, msg: HostMessage) => void;
  addAnswer: (playerName: string, questionIndex: number, optionIndex: number) => void;
  getAnswers: (questionIndex: number) => Map<string, number>;
  updatePlayerScore: (playerName: string, delta: number) => void;
  resetScores: () => void;
  retryWithNewCode: () => void;
  peer: Peer | null;
  error: string | null;
}

/**
 * Custom hook that manages all host-side PeerJS networking.
 *
 * Flow:
 *  1. Creates a PeerJS peer with ID `quiz-<gameCode>`.
 *  2. Listens for incoming data connections from players.
 *  3. Handles join/rejoin/answer/ping messages from players.
 *  4. Provides broadcast() and sendToPlayer() for the host game logic.
 */
export function useHost(
  initialGameCode: string,
  currentQuestionIndexRef?: React.RefObject<number>,
  phaseRef?: React.RefObject<GamePhase>,
  onPlayerRejoinRef?: React.RefObject<((playerName: string) => void) | null>,
): UseHostReturn {
  const [gameCode, setGameCode] = useState(initialGameCode);
  const [players, setPlayers] = useState<Map<string, Player>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);

  // Refs persist across renders without triggering re-renders
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map()); // keyed by peerId
  const playersRef = useRef<Map<string, Player>>(new Map()); // keyed by player name (lowercase)
  // answers per question: Map<questionIndex, Map<playerName, optionIndex>>
  const answersRef = useRef<Map<number, Map<string, number>>>(new Map());
  // Track retry attempts for unavailable-id errors
  const retryCountRef = useRef(0);
  // Track whether a delayed retry is pending (to avoid double-triggers)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- helpers ----------

  /** Build a player_list message from the current players map. */
  const buildPlayerListMessage = useCallback((): HostMessage => {
    const list = Array.from(playersRef.current.values()).map((p) => ({
      name: p.name,
      connected: p.connected,
    }));
    return { type: 'player_list' as const, players: list };
  }, []);

  /** Send a message to a specific player (looked up by canonical name). */
  const sendToPlayer = useCallback((playerName: string, msg: HostMessage) => {
    const key = canonicalName(playerName);
    const player = playersRef.current.get(key);
    if (!player) return;
    const conn = connectionsRef.current.get(player.peerId);
    if (conn?.open) {
      conn.send(msg);
    }
  }, []);

  /** Broadcast a message to every connected player. */
  const broadcast = useCallback(
    (msg: HostMessage) => {
      for (const player of playersRef.current.values()) {
        if (player.connected) {
          sendToPlayer(player.name, msg);
        }
      }
    },
    [sendToPlayer],
  );

  /** Flush the players ref into React state so the UI re-renders. */
  const syncPlayersState = useCallback(() => {
    setPlayers(new Map(playersRef.current));
  }, []);

  // ---------- answer tracking ----------

  const addAnswer = useCallback(
    (playerName: string, questionIndex: number, optionIndex: number) => {
      if (!answersRef.current.has(questionIndex)) {
        answersRef.current.set(questionIndex, new Map());
      }
      const questionAnswers = answersRef.current.get(questionIndex);
      if (questionAnswers) {
        questionAnswers.set(canonicalName(playerName), optionIndex);
      }
    },
    [],
  );

  const getAnswers = useCallback((questionIndex: number): Map<string, number> => {
    return answersRef.current.get(questionIndex) ?? new Map();
  }, []);

  /** Add delta to a player's score and sync state. */
  const updatePlayerScore = useCallback((playerName: string, delta: number) => {
    const key = canonicalName(playerName);
    const player = playersRef.current.get(key);
    if (player) {
      player.score += delta;
      syncPlayersState();
    }
  }, [syncPlayersState]);

  /** Reset all player scores to zero (for Play Again). */
  const resetScores = useCallback(() => {
    for (const player of playersRef.current.values()) {
      player.score = 0;
      player.answeredQuestions.clear();
    }
    answersRef.current.clear();
    syncPlayersState();
  }, [syncPlayersState]);

  // ---------- connection handler ----------

  const handleConnection = useCallback(
    (conn: DataConnection) => {
      conn.on('open', () => {
        // Store the raw connection keyed by its peerId
        connectionsRef.current.set(conn.peer, conn);

        conn.on('data', (rawData: unknown) => {
          const msg = rawData as PlayerMessage;
          if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

          switch (msg.type) {
            case 'join': {
              const trimmedName = (msg.name ?? '').trim();
              if (!trimmedName) {
                conn.send({ type: 'error', message: 'Name cannot be empty' } satisfies HostMessage);
                return;
              }

              const key = canonicalName(trimmedName);

              // Duplicate check (case-insensitive)
              if (playersRef.current.has(key)) {
                conn.send({
                  type: 'error',
                  message: 'A player with that name already exists',
                } satisfies HostMessage);
                return;
              }

              // Max players check
              if (playersRef.current.size >= MAX_PLAYERS) {
                conn.send({
                  type: 'error',
                  message: 'Game is full (max 20 players)',
                } satisfies HostMessage);
                return;
              }

              // Register new player
              const newPlayer: Player = {
                peerId: conn.peer,
                name: trimmedName,
                score: 0,
                connected: true,
                answeredQuestions: new Set(),
              };
              playersRef.current.set(key, newPlayer);
              syncPlayersState();

              // Send welcome to joining player
              conn.send({
                type: 'welcome',
                playerName: trimmedName,
                gameCode,
              } satisfies HostMessage);

              // Broadcast updated player list to everyone
              broadcast(buildPlayerListMessage());
              break;
            }

            case 'rejoin': {
              const trimmedName = (msg.name ?? '').trim();
              const key = canonicalName(trimmedName);
              const existing = playersRef.current.get(key);

              if (!existing) {
                // Player not found — treat as a fresh join
                if (!trimmedName) {
                  conn.send({ type: 'error', message: 'Name cannot be empty' } satisfies HostMessage);
                  return;
                }
                if (playersRef.current.size >= MAX_PLAYERS) {
                  conn.send({
                    type: 'error',
                    message: 'Game is full (max 20 players)',
                  } satisfies HostMessage);
                  return;
                }
                const newPlayer: Player = {
                  peerId: conn.peer,
                  name: trimmedName,
                  score: 0,
                  connected: true,
                  answeredQuestions: new Set(),
                };
                playersRef.current.set(key, newPlayer);
                syncPlayersState();

                conn.send({
                  type: 'welcome',
                  playerName: trimmedName,
                  gameCode,
                } satisfies HostMessage);
                broadcast(buildPlayerListMessage());
                return;
              }

              if (existing.connected) {
                // Already connected — reject
                conn.send({
                  type: 'error',
                  message: 'This player is already connected',
                } satisfies HostMessage);
                return;
              }

              // Reconnect: update peerId, mark connected
              // Remove old connection mapping if it exists
              connectionsRef.current.delete(existing.peerId);
              existing.peerId = conn.peer;
              existing.connected = true;
              connectionsRef.current.set(conn.peer, conn);
              syncPlayersState();

              const currentQI = currentQuestionIndexRef?.current ?? 0;
              const currentPhase = phaseRef?.current ?? 'lobby';

              conn.send({
                type: 'rejoin_success',
                playerName: existing.name,
                gameCode,
                score: existing.score,
                currentQuestionIndex: currentQI,
                phase: currentPhase,
              } satisfies HostMessage);

              broadcast(buildPlayerListMessage());

              // Notify host page so it can send current question data
              onPlayerRejoinRef?.current?.(existing.name);
              break;
            }

            case 'answer': {
              // Find the player by peerId
              let playerKey: string | null = null;
              for (const [key, p] of playersRef.current) {
                if (p.peerId === conn.peer) {
                  playerKey = key;
                  break;
                }
              }
              if (!playerKey) return;

              const player = playersRef.current.get(playerKey);
              if (!player) return;

              // Record the answer
              addAnswer(playerKey, msg.questionIndex, msg.optionIndex);
              player.answeredQuestions.add(msg.questionIndex);
              syncPlayersState();

              conn.send({
                type: 'answer_ack',
                questionIndex: msg.questionIndex,
              } satisfies HostMessage);
              break;
            }

            case 'ping': {
              conn.send({ type: 'pong' } satisfies HostMessage);
              break;
            }
          }
        });

        conn.on('close', () => {
          // Mark the player as disconnected but keep their data
          for (const [, player] of playersRef.current) {
            if (player.peerId === conn.peer) {
              player.connected = false;
              break;
            }
          }
          connectionsRef.current.delete(conn.peer);
          syncPlayersState();
          broadcast(buildPlayerListMessage());
        });

        conn.on('error', (err) => {
          console.error(`[useHost] Connection error from ${conn.peer}:`, err);
        });
      });
    },
    [gameCode, broadcast, buildPlayerListMessage, syncPlayersState, addAnswer, currentQuestionIndexRef, phaseRef, onPlayerRejoinRef],
  );

  // ---------- manual retry ----------

  /** Manually generate a new game code and retry the peer connection.
   *  Useful when auto-retries are exhausted (especially during local dev). */
  const retryWithNewCode = useCallback(() => {
    // Clean up any existing peer
    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.destroy();
    }
    // Clear any pending auto-retry timer
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    // Reset retry counter and generate fresh code
    retryCountRef.current = 0;
    setError(null);
    setGameCode(generateGameCode());
  }, []);

  // ---------- peer lifecycle ----------

  useEffect(() => {
    const p = createHostPeer(gameCode);
    peerRef.current = p;
    setPeer(p);

    // Capture ref value for cleanup
    const connections = connectionsRef.current;

    p.on('open', () => {
      console.log(`[useHost] Peer open with ID: ${p.id}`);
      retryCountRef.current = 0;
      setError(null);
    });

    p.on('connection', (conn) => {
      handleConnection(conn);
    });

    p.on('error', (err) => {
      console.error('[useHost] Peer error:', err);
      if (err.type === 'unavailable-id') {
        if (retryCountRef.current < 3) {
          retryCountRef.current++;
          const attempt = retryCountRef.current;
          // In dev mode, PeerJS Cloud may still hold the old peer ID for a few seconds.
          // Add a delay before retrying so the old registration has time to expire.
          const delayMs = import.meta.env.DEV ? 1500 : 500;
          setError(`Game code taken, retrying in ${delayMs / 1000}s... (attempt ${attempt}/3)`);
          p.destroy();
          retryTimerRef.current = setTimeout(() => {
            const newCode = generateGameCode();
            console.log(
              `[useHost] Retrying with new code ${newCode} (attempt ${attempt}/3)`,
            );
            setGameCode(newCode);
          }, delayMs);
        } else {
          setError('Unable to create game after 3 attempts. Please refresh and try again.');
        }
      } else {
        setError(`Connection error: ${err.message}`);
      }
    });

    p.on('disconnected', () => {
      console.warn('[useHost] Peer disconnected from signalling server, attempting reconnect…');
      if (!p.destroyed) {
        p.reconnect();
      }
    });

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      p.destroy();
      peerRef.current = null;
      connections.clear();
    };
  }, [gameCode, handleConnection]);

  return {
    gameCode,
    players,
    broadcast,
    sendToPlayer,
    addAnswer,
    getAnswers,
    updatePlayerScore,
    resetScores,
    retryWithNewCode,
    peer,
    error,
  };
}
