// PeerJS configuration helpers for WebRTC connections

import Peer from 'peerjs';

export function createHostPeer(gameCode: string): Peer {
  return new Peer(`quiz-${gameCode}`, {
    debug: 1, // Errors only in production
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
  });
}

export function createPlayerPeer(): Peer {
  return new Peer(undefined as unknown as string, {
    // Auto-generated ID
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    },
  });
}
