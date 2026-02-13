// Manages countdown audio (beeps at 5, 4, 3, 2, 1 seconds)
let audioCtx: AudioContext | null = null;

export function ensureAudioContext(): void {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export function playCountdownBeep(secondsRemaining: number): void {
  if (!audioCtx || audioCtx.state !== 'running') return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  // Higher pitch + longer duration at lower seconds
  const freq = secondsRemaining <= 1 ? 880 : secondsRemaining <= 3 ? 660 : 440;
  const duration = secondsRemaining <= 1 ? 0.3 : 0.15;

  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.value = 0.3;
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function cleanupAudio(): void {
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
  }
  audioCtx = null;
}
