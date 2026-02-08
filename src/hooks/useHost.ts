// Host-side networking hook — manages player connections and message handling
// Peer lifecycle is managed by PeerManager singleton (see ../utils/peerManager.ts)

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import type { DataConnection } from 'peerjs';
import type Peer from 'peerjs';
import * as peerManager from '../utils/peerManager';
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
  addAnswer: (playerName: string, questionIndex: number, answer: number | number[], answeredAt?: number) => void;
  getAnswers: (questionIndex: number) => Map<string, number | number[]>;
  getAnswerTimestamps: (questionIndex: number) => Map<string, number>;
  updatePlayerScore: (playerName: string, delta: number) => void;
  resetScores: () => void;
  peer: Peer | null;
  error: string | null;
}

/**
 * Custom hook that manages all host-side networking.
 *
 * Flow:
 *  1. PeerManager creates a PeerJS peer with ID `quiz-<gameCode>` (singleton).
 *  2. Listens for incoming data connections from players via peerManager.onConnection().
 *  3. Handles join/rejoin/answer/ping messages from players.
 *  4. Provides broadcast() and sendToPlayer() for the host game logic.
 */
export function useHost(
  currentQuestionIndexRef?: React.RefObject<number>,
  phaseRef?: React.RefObject<GamePhase>,
  onPlayerRejoinRef?: React.RefObject<((playerName: string) => void) | null>,
  onPlayerGetStateRef?: React.RefObject<((playerName: string) => void) | null>,
): UseHostReturn {
  // Use PeerManager singleton for peer lifecycle
  const snapshot = useSyncExternalStore(
    peerManager.subscribe,
    peerManager.getSnapshot,
  );
  const gameCode = snapshot.gameCode;
  const error = snapshot.error;

  const [players, setPlayers] = useState<Map<string, Player>>(() => new Map());

  // Refs persist across renders without triggering re-renders
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map()); // keyed by peerId
  const playersRef = useRef<Map<string, Player>>(new Map()); // keyed by player name (lowercase)
  // answers per question: Map<questionIndex, Map<playerName, answer>>
  // answer is optionIndex (0-3) for MC/TF, numeric value for slider, or number[] for multi_choice
  const answersRef = useRef<Map<number, Map<string, number | number[]>>>(new Map());
  // answer timestamps per question: Map<questionIndex, Map<playerName, timestamp>>
  const answerTimestampsRef = useRef<Map<number, Map<string, number>>>(new Map());

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
    (playerName: string, questionIndex: number, answer: number | number[], answeredAt?: number) => {
      if (!answersRef.current.has(questionIndex)) {
        answersRef.current.set(questionIndex, new Map());
      }
      const questionAnswers = answersRef.current.get(questionIndex);
      if (questionAnswers) {
        questionAnswers.set(canonicalName(playerName), answer);
      }
      // Store timestamp if provided
      if (answeredAt !== undefined) {
        if (!answerTimestampsRef.current.has(questionIndex)) {
          answerTimestampsRef.current.set(questionIndex, new Map());
        }
        const timestamps = answerTimestampsRef.current.get(questionIndex);
        if (timestamps) {
          timestamps.set(canonicalName(playerName), answeredAt);
        }
      }
    },
    [],
  );

  const getAnswers = useCallback((questionIndex: number): Map<string, number | number[]> => {
    return answersRef.current.get(questionIndex) ?? new Map();
  }, []);

  const getAnswerTimestamps = useCallback((questionIndex: number): Map<string, number> => {
    return answerTimestampsRef.current.get(questionIndex) ?? new Map();
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
    answerTimestampsRef.current.clear();
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

            case 'get_state': {
              const trimmedName = (msg.name ?? '').trim();
              const key = canonicalName(trimmedName);
              const player = playersRef.current.get(key);

              if (!player) {
                conn.send({
                  type: 'error',
                  message: 'Player not found',
                } satisfies HostMessage);
                return;
              }

              // Update the player's peerId and connection mapping so future
              // messages (question, reveal, answer_summary, etc.) reach the new socket.
              if (player.peerId !== conn.peer) {
                connectionsRef.current.delete(player.peerId);
                player.peerId = conn.peer;
                connectionsRef.current.set(conn.peer, conn);
              }
              player.connected = true;
              syncPlayersState();

              const qIndex = currentQuestionIndexRef?.current ?? 0;
              const currentPhase = phaseRef?.current ?? 'lobby';

              // Build standings from current players
              const stateStandings = Array.from(playersRef.current.values())
                .sort((a, b) => b.score - a.score)
                .map((p, i) => ({
                  name: p.name,
                  score: p.score,
                  rank: i + 1,
                }));

              conn.send({
                type: 'game_state',
                phase: currentPhase,
                currentQuestionIndex: qIndex,
                score: player.score,
                standings: stateStandings,
              } satisfies HostMessage);

              broadcast(buildPlayerListMessage());

              // Notify host page so it can send current question data
              onPlayerGetStateRef?.current?.(player.name);
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
              addAnswer(playerKey, msg.questionIndex, msg.answer, msg.answeredAt);
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
    [gameCode, broadcast, buildPlayerListMessage, syncPlayersState, addAnswer, currentQuestionIndexRef, phaseRef, onPlayerRejoinRef, onPlayerGetStateRef],
  );

  // ---------- connection registration via PeerManager ----------

  useEffect(() => {
    const unsubscribe = peerManager.onConnection(handleConnection);
    return unsubscribe;
  }, [handleConnection]);

  return {
    gameCode,
    players,
    broadcast,
    sendToPlayer,
    addAnswer,
    getAnswers,
    getAnswerTimestamps,
    updatePlayerScore,
    resetScores,
    peer: peerManager.getPeer(),
    error,
  };
}
